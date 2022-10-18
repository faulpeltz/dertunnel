import fs from "fs";
import tls from "tls";
import chalk from "chalk";

import { TunnelClientsConfig, TunnelServiceConfig } from "./config";
import { setupAppServer } from "./api-server";
import { ConnectionDispatcher } from "./dispatcher";
import { acmeLoadOrCreateCertificates } from "./acme";
import { authenticateUser } from "./auth";
import { Ref } from "../shared/util";
import { TunnelClientEndpointName, AdminEndpointName } from "../shared/models";

const ReservedEndpointNames = [TunnelClientEndpointName, AdminEndpointName, "app", "api"];
export type ServerCloseFunc = () => void;

export async function startTunnelServer(config: TunnelServiceConfig, clientConfig: TunnelClientsConfig): Promise<Ref<ServerCloseFunc>> {
    const log = config.enableLogging === false ? () => { /* */ } : console.log;

    // main connection dispatcher
    const theDispatcher = new ConnectionDispatcher(config.baseDomain, (u, t) => authenticateUser(clientConfig, u, t));

    // dummy HTTP server getting fed sockets from the TLS server
    const { server: localAppServer } = await setupAppServer(config, clientConfig, theDispatcher);
    const serverRef: Ref<ServerCloseFunc> = { current: undefined };

    const tlsSocketListener = (socket: tls.TLSSocket) => {
        try {
            const srvName = socket["servername"]?.toString().toLowerCase() ?? "";

            // requires SNI and sane server name
            const srvNames = srvName.split(".");
            const [ep, ...suffix] = srvNames;
            if (!srvName || !(suffix.join(".") === config.baseDomain)) {
                socket.destroy();
                return;
            }
            socket.unref();
            // connections for tunnel clients - uses tunnel message protocol
            if (ep === TunnelClientEndpointName) {
                theDispatcher.onClientConnect(socket);
            }
            // connections to  HTTP admin json api and static serve
            else if (ep === AdminEndpointName) {
                socket["_dt_api_"] = true;
                localAppServer.emit("connection", socket);
            }
            // connections to exposed endpoints - forwarded to clients
            else if (!ReservedEndpointNames.includes(ep)) {
                theDispatcher.onEndpointConnect(ep, socket);
            }
            // reject everything elese
            else {
                socket.destroy();
            }
        } catch (err) {
            log("Unexpected server error: " + err);
        }
    };

    let theServer: tls.Server | undefined = undefined;
    await startOrRestartTlsServer();

    if (config.enableAcme) {
        setInterval(() => {
            log("Running scheduled certificate check");
            startOrRestartTlsServer().catch(err => {
                log(`Failed to restart TLS server: ${(err as Error).message}`);
            });
        }, 86400_000);
    }

    log(`Listening on port ${chalk.blueBright(config.port)}`);
    return serverRef;

    async function startOrRestartTlsServer() {
        if (config.enableAcme) {
            const certs = await acmeLoadOrCreateCertificates(config.acmeCertDir, config.baseDomain, config.acmeContactEmail || "");
            if (certs.wasChanged || !theServer) {
                if (theServer) {
                    log("Restarting TLS server because ACME certificates were updated");
                } else {
                    log("Starting TLS server");
                }
                theServer?.close();
                theServer = tls.createServer({
                    key: certs.privateKey,
                    cert: certs.cert,
                }, tlsSocketListener);
            } else {
                log(`ACME certificate check resulted in no changes`);
            }
        } else {
            theServer?.close();
            theServer = tls.createServer({
                key: fs.readFileSync("./data/cert.key"),
                cert: fs.readFileSync("./data/cert.crt"),
            }, tlsSocketListener);
        }
        serverRef.current = () => theServer?.close();
        await new Promise<void>(resolve => !theServer?.listening ? theServer!.listen(config.port, resolve) : resolve());
    }
}
