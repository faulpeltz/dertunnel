import { log } from "console";
import chalk from "chalk";
import prompts from "prompts";

import { generateToken } from "../shared/random";
import { HostnameValidator, isPortNumber } from "../shared/validate";
import { hashToken } from "../shared/hash";

import { TunnelServiceConfig } from "./config";

export async function resetAdminTokenAndPrint(serverConf: TunnelServiceConfig): Promise<TunnelServiceConfig> {
    const newToken = generateToken();
    log(`Resetting admin credentials to new token: ${chalk.blueBright(newToken)}`);
    serverConf.adminTokenHash = await hashToken(newToken);
    return serverConf;
}

export async function performInitialSetup(): Promise<TunnelServiceConfig> {
    let cancelled = false;
    const conf = await prompts([{
        name: "baseDomain",
        type: "text",
        message: "Server base domain (e.g. tunnel.yourdomain.com)",
        validate: v => HostnameValidator.test(v)
    }, {
        name: "port",
        type: "number",
        message: "TLS server listening port",
        initial: 443,
        validate: isPortNumber
    }, {
        name: "enableLogging",
        type: "toggle",
        message: "Enable logging",
        initial: true
    }, {
        name: "enableDns",
        type: "toggle",
        message: "Enable builtin DNS server (requires base domain delegation)",
        initial: true
    }, {
        name: "dnsPort",
        type: (_, values) => values.enableDns ? "number" : false,
        message: "DNS server listening port",
        initial: 53,
        validate: isPortNumber
    }, {
        name: "dnsTargetHost",
        type: (_, values) => values.enableDns ? "text" : false,
        message: "DNS name (A or CNAME) (should resolve to this host, e.g. tunnel-vm1.yourdomain.com)",
    }, {
        name: "enableAcme",
        type: (_, values) => values.enableDns ? "toggle" : false,
        message: "Enable builtin ACME client (agrees to letsencrypt ToS)",
        initial: true
    }, {
        name: "acmeContactEmail",
        type: (_, values) => values.enableAcme && values.enableDns ? "text" : false,
        message: "ACME contact email (Note that letsencrypt requires a valid email)",
        validate: v => typeof v === "string" && v.includes("@") && v.includes(".") && v.length >= 4
    }, {
        name: "acmeCertDir",
        type: (_, values) => values.enableAcme && values.enableDns ? "text" : false,
        message: "Local directory for caching ACME certificates (must be writable)",
        initial: "./cert-data"
    }], { onCancel: () => { cancelled = true; return false } }) as TunnelServiceConfig;

    if (cancelled) {
        throw new Error("Setup aborted by user");
    }
    // create new admin credentials
    return await resetAdminTokenAndPrint(conf);
}

