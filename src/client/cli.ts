import Conf from "conf";
import prompts from "prompts";
import chalk from "chalk";
import { program } from "commander";

import { EndpointValidator } from "../shared/validate";
import { unpackToken } from "../shared/util";
import { connectTunnel } from "./client";
import { logHeader, log, uiState, renderUI, formatStatusLines, updateProtocolDataState } from "./tui";

type UserConfig = {
    configured: boolean;
    serviceUrl: string;
    user: string;
    token: string;
}

(async function run() {
    // setup configuration from config file and commandline - prompt for missing values
    const userConf = new Conf<UserConfig>({
        projectName: "dertunnel",
        defaults: {
            configured: false,
            serviceUrl: "",
            user: "",
            token: ""
        }
    });

    const isConfigured = userConf.get("configured");

    const cmd = program
        .name("dertunnel")
        .option("-s, --service <url>", "Service URL or host name")
        .option("-u, --user <username>", "The username for authenticating to the service")
        .option("--reset", "Removes stored user configuration")
        .option("--ignore-cert-errors", "Ignore all certificate errors (UNSAFE)")
        .option("--no-inspect", "Do not inspect traffic - HTTP logging will be unavailable")
        .argument("[public-endpoint-name]", "Public name for the tunnel endpoint")
        .argument("[local-endpoint]", "Local port name or URL")
        .parse(process.argv);

    const opts = cmd.opts();
    if (opts["reset"]) {
        userConf.clear();
        console.log("Stored configuration was purged");
        process.exit();
    }

    let serviceUrl: string | undefined = opts["service"] || (isConfigured ? userConf.get("serviceUrl") : undefined);
    let userOvr: string | undefined = opts["user"] || (isConfigured ? userConf.get("user") : undefined);
    let fullToken: string | undefined = process.env.DERTUNNEL_TOKEN || (isConfigured ? userConf.get("token") : undefined);

    // full token encodes endpoint, username and token
    if (!fullToken) {
        fullToken = (await prompts({
            name: "value",
            type: "password",
            message: "Connection token"
        })).value;
        if (!fullToken) {
            throw new Error("Must specify a connection token");
        }
        userConf.set("token", fullToken);
    }
    userConf.set("configured", true);

    let { service, user } = unpackToken(fullToken);
    serviceUrl ||= service;
    user = userOvr || user;

    let [publicEpStr, localEpStr] = cmd.args;

    if (!publicEpStr) {
        publicEpStr = (await prompts({
            name: "value",
            type: "text",
            message: "Public endpoint name",
            validate: v => EndpointValidator.test(v)
        })).value;
        if (!publicEpStr) {
            throw new Error("Must specify a public endpoint name");
        }
    }

    if (!localEpStr) {
        localEpStr = (await prompts({
            name: "value",
            type: "text",
            message: "Local endpoint URL or port"
        })).value;
        if (!localEpStr) {
            throw new Error("Must specify a local endpoint");
        }
    }

    let localServer: string | undefined,
        localPort: number | undefined,
        localUrl: string | undefined;

    const p = Number.parseInt(localEpStr);
    if (Number.isNaN(p)) {
        const epUrl = new URL(localEpStr);
        if (epUrl.protocol !== "http:") {
            throw new Error("Ony http protocol is supported for local endpoints");
        }
        localUrl = epUrl.toString();
    } else {
        localServer = "localhost";
        localPort = p;
    }

    // header line 3
    logHeader(`Service: ${chalk.cyanBright(service)}`, 3);
    // header line 4
    logHeader(`User: ${chalk.cyanBright(user)}`, 4);
    // header line 5
    logHeader(`Local: ${chalk.cyanBright(localUrl ?? `${localServer} ${localPort}`)}`, 5);

    const inspect = !!opts["inspect"];

    const shutdown = await connectTunnel({
        clientToken: fullToken,
        localServer,
        localPort: localPort,
        localUrl,
        endpoint: publicEpStr,
        endpointPrefix: undefined,
        ignoreCertErrors: opts["ignoreCertErrors"] ? true : false,
        waitForInitialConnection: true,
        protocols: { inspect },
        onConnected: (ep: string) => {
            // HEADER line 6
            logHeader(`Connected - public endpoint: ${chalk.green(ep)}`, 6);
        },
        onError: (err: string) => {
            // HEADER line 6
            logHeader(chalk.redBright(err), 6);
        },
        onEndpoint(event, s, message) {
            uiState.statusLines = formatStatusLines(s);
            if (event === "error") {
                log(chalk.redBright(message));
            }
            renderUI();
        },
        onProtocolData(type, cid, data) {
            updateProtocolDataState(type, cid, data);
        },
    });

    ["SIGINT", "SIGTERM", "SIGQUIT"].forEach(sig => {
        process.on(sig, () => {
            log(`Shutting down`);
            shutdown();
            process.exit(0);
        })
    });
})().catch(err => {
    console.error(err);
});
