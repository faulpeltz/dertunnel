import chalk from "chalk";
import { program } from "commander";
import { Version } from "../version";

import {
    createClientConfigIfNotExists, isServerConfigAvailable,
    loadClientConfig, loadConfig, saveClientConfig, saveConfig
} from "./config";
import { startDnsServer } from "./dns-server";
import { startTunnelServer } from "./server";
import { performInitialSetup, resetAdminTokenAndPrint } from "./setup";

const log = console.log;

(async function run() {
    log(`/__\\ DERTUNNEL SERVER v${Version} /__\\`);
    log("");

    const opts = program.name("dertunnel-server")
        .option("--serverconfig", "Optional server config file name (defaults to ./server.json)")
        .option("--clientconfig", "Optional client config file name (defaults to ./clients.json)")
        .option("--resetadmin", "Reset admin login token")
        .option("--setup", "Initial configuration setup")
        .allowExcessArguments()
        .parse();

    const cmdOpts = opts.opts<{
        serverconfig?: string;
        clientconfig?: string;
        resetadmin?: boolean;
        setup?: boolean;
    }>();

    // initial setup only    
    if (cmdOpts.setup) {
        // ask for server config
        const conf = await performInitialSetup();
        await saveConfig(conf, cmdOpts.serverconfig);
        // init client config file if necessary
        await createClientConfigIfNotExists({ clients: [] }, cmdOpts.clientconfig);
        process.exit(0);
    }

    // fail on missing config file
    if (!(await isServerConfigAvailable(cmdOpts.serverconfig)) && !process.env.DERTUNNEL_BASE_DOMAIN) {
        log("Server config file not found.\nRun with --setup or use environment vars for initial configuration\n");
        process.exit(1);
    }

    let serverConf = await loadConfig(cmdOpts.serverconfig);
    const clientConfigs = await loadClientConfig(cmdOpts.clientconfig);

    // create new admin credentials if missing or reset requested
    if (cmdOpts.resetadmin || !serverConf.adminTokenHash) {
        serverConf = await resetAdminTokenAndPrint(serverConf);
        await saveConfig(serverConf, cmdOpts.serverconfig);
        return;
    }

    log(`Configured base domain is: ${chalk.blueBright(serverConf.baseDomain)}`);
    log(`DNS is: ${chalk.blueBright(serverConf.enableDns ? "on" : "off")}`);
    log(`ACME client is: ${chalk.blueBright(serverConf.enableAcme ? "on" : "off")}`);

    let dnsServer: ReturnType<typeof startDnsServer> | undefined;
    if (serverConf.enableDns) {
        const port = serverConf.dnsPort ?? 5300;
        dnsServer = startDnsServer(port, serverConf.baseDomain, serverConf.dnsTargetHost);
        log(`DNS server listing on port ${port}`);
    }

    const serverClose = await startTunnelServer(serverConf, clientConfigs);
    log(chalk.green("Startup complete."));

    ["SIGINT", "SIGTERM", "SIGQUIT"].forEach(sig => {
        process.on(sig, () => {
            log(`Shutting down`);
            serverClose.current?.();
            dnsServer?.close();
            process.exit(0);
        })
    });
    Object.seal(Object.prototype); Object.seal(Object);
})().catch(err => {
    console.error("Fatal:", (err as Error).message);
    process.exit(2);
});
