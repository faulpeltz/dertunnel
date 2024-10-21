import { existsSync } from "fs";
import fs from "fs/promises";

import { hashToken } from "../shared/hash";
import { assertArray, assertBool, assertHostname, assertNumber, assertString, assertUserName } from "../shared/validate";

const MinTokenLen = 48;
const DefaultServerConfigFileName = "./data/server.json";
const DefaultClientConfigFileName = "./data/clients.json";

export type TunnelServiceConfig = {
    // general settings
    baseDomain: string;
    port?: number;
    enableLogging: boolean;

    // non-acme
    customCertFile: string;
    customKeyFile: string;

    // dns-related settings
    enableDns: boolean;
    dnsPort?: number;
    dnsTargetHost: string;

    // acme settings
    enableAcme: boolean;
    acmeCertDir: string;
    acmeContactEmail?: string;

    // admin token hash for manging the server
    adminTokenHash: string;
};

export type TunnelClient = {
    user: string;
    tokenHash: string;
};

export type TunnelClientsConfig = {
    clients: TunnelClient[];
};

export async function isServerConfigAvailable(configFile?: string): Promise<boolean> {
    try {
        const conf = await fs.readFile(configFile ?? DefaultServerConfigFileName, { encoding: "utf8" });
        return JSON.parse(conf) && conf.length > 2;
    }
    catch (err) {
        return false;
    }
}

export async function loadConfig(configFile?: string): Promise<TunnelServiceConfig> {
    try {
        const resolvedFilename = configFile ?? DefaultServerConfigFileName;
        let config = Object.create(null) as TunnelServiceConfig;

        let unsaved = false;
        try {
            config = JSON.parse(await fs.readFile(resolvedFilename, { encoding: "utf8" })) as TunnelServiceConfig;
        }
        catch (err) {
            unsaved = true;
        }

        const E = process.env;

        config.baseDomain ??= E.DERTUNNEL_BASE_DOMAIN!;
        config.port ??= E.DERTUNNEL_PORT ? Number.parseInt(E.DERTUNNEL_PORT) : 443;
        config.enableLogging ??= E.DERTUNNEL_LOGGING_ENABLE !== undefined ? !!E.DERTUNNEL_LOGGING_ENABLE : false;

        config.enableDns ??= E.DERTUNNEL_DNS_ENABLE !== undefined ? !!E.DERTUNNEL_DNS_ENABLE : false;
        config.dnsPort ??= E.DERTUNNEL_DNS_PORT ? Number.parseInt(E.DERTUNNEL_DNS_PORT) : 53;
        config.dnsTargetHost ??= E.DERTUNNEL_DNS_TARGET_HOST!;

        config.enableAcme ??= E.DERTUNNEL_ACME_ENABLE !== undefined ? !!E.DERTUNNEL_ACME_ENABLE : false;
        config.acmeCertDir ??= E.DERTUNNEL_ACME_CERT_DIR!;
        config.acmeContactEmail ??= E.DERTUNNEL_ACME_EMAIL!;

        if (!config.adminTokenHash && E.DERTUNNEL_ADMIN_SECRET_TOKEN) {
            assertString(E.DERTUNNEL_ADMIN_SECRET_TOKEN, "adminToken", 8);
            config.adminTokenHash = await hashToken(E.DERTUNNEL_ADMIN_SECRET_TOKEN);
        }

        assertHostname(config.baseDomain, "baseDomain");
        assertNumber(config.port, "port", true, v => v > 0 && v < 0x10000);
        assertBool(config.enableLogging, "enableLogging");

        assertBool(config.enableDns, "enableDns");
        if (config.enableDns) { assertHostname(config.dnsTargetHost, "dnsTargetHost") }
        if (config.dnsPort) { assertNumber(config.dnsPort, "dnsPort"); }

        assertBool(config.enableAcme, "enableAcme");
        if (config.enableAcme) { assertString(config.acmeContactEmail, "acmeContactEmail"); }
        if (config.enableAcme) { assertString(config.acmeCertDir, "acmeCertDir"); }

        if (!config.enableAcme) { assertString(config.customCertFile, "customCertFile"); }
        if (!config.enableAcme) { assertString(config.customKeyFile, "customKeyFile"); }

        if (unsaved) {
            saveConfig(config, resolvedFilename);
        }
        return config;
    }
    catch (err) {
        throw new Error("Failed to load server config: " + err);
    }
}

export async function saveConfig(config: TunnelServiceConfig, configFile?: string): Promise<void> {
    await fs.writeFile(configFile ?? DefaultServerConfigFileName, JSON.stringify(config, undefined, 2));
}

let lastClientConfigFileName: string;

export async function loadClientConfig(configFile?: string): Promise<TunnelClientsConfig> {
    try {
        configFile ??= DefaultClientConfigFileName;
        const cc = JSON.parse(await fs.readFile(configFile, { encoding: "utf8" })) as TunnelClientsConfig;
        assertArray(cc.clients, "clients");
        for (const cl of cc.clients) {
            assertUserName(cl.user);
            assertString(cl.tokenHash, "tokenHash", MinTokenLen);
        }
        lastClientConfigFileName = configFile;
        return cc;
    }
    catch (err) {
        throw new Error("Failed to load client config: " + err);
    }
}

export async function saveClientConfig(config: TunnelClientsConfig, configFile?: string): Promise<void> {
    configFile ??= lastClientConfigFileName ?? DefaultClientConfigFileName;
    const text = JSON.stringify(config, undefined, 2);
    const tmpFile = configFile + ".save_temp";
    const oldFile = configFile + ".save_old";
    await fs.writeFile(tmpFile, text);
    await fs.rename(configFile, oldFile);
    await fs.rename(tmpFile, configFile);
    await fs.unlink(oldFile);
}

export async function createClientConfigIfNotExists(config: TunnelClientsConfig, configFile?: string): Promise<void> {
    configFile ??= lastClientConfigFileName ?? DefaultClientConfigFileName;
    if (!existsSync(configFile)) {
        const text = JSON.stringify(config, undefined, 2);
        await fs.writeFile(configFile, text);
    }
}
