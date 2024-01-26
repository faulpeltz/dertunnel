import type { Server } from "http";
import { getHeapStatistics } from "v8";
import { LRUCache } from "lru-cache";

import express, { type Express, static as serveStatic } from "express";
import path from "path";

import { assertUserName } from "../shared/validate";
import { hashToken } from "../shared/hash";
import { generateToken } from "../shared/random";
import { ApiServerInfo, ApiTunnelClients } from "../shared/models";
import { packToken } from "../shared/util";

import { saveClientConfig, TunnelClientsConfig, TunnelServiceConfig } from "./config";
import { apiEndpoint, setupBasicAuth } from "./api-util";
import { ConnectionDispatcher } from "./dispatcher";
import { acmeGetCertificateInfo } from "./acme";
import { clearAuthCache } from "./auth";
import { type TaggedTLSSocket } from "./server";

const debug = !!process.env.DERTUNNEL_DEBUG;
const Local = "127.0.0.1";
const ApiServerDebugPort = 4042;

// for bundling/packaging
const PublicFolderName = "public";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pkgEntrypoint = (process as any)["pkg"]?.entrypoint;
pkgEntrypoint = pkgEntrypoint ? path.dirname(pkgEntrypoint) : pkgEntrypoint;
//

const serviceStartTime = new Date().valueOf();
const apiCache = new LRUCache<string, ApiServerInfo>({ max: 100, ttl: 2000 });

export async function setupAppServer(conf: TunnelServiceConfig, clientConfig: TunnelClientsConfig, dispatcher: ConnectionDispatcher)
    : Promise<{ app: Express; server: Server }> {
    const app = express();
    app.disable("x-powered-by");
    app.disable("etag");
    app.use(setupBasicAuth(conf));
    app.use(express.json());
    setupApiRoutes(app, conf, clientConfig, dispatcher);

    const publicDir = pkgEntrypoint ? path.join(pkgEntrypoint, "..", PublicFolderName)
        : path.join(process.cwd(), PublicFolderName);
    app.use(serveStatic(publicDir));

    const server = debug ? app.listen(ApiServerDebugPort, Local) : app.listen(0, Local);
    server.on("connection", socket => {
        // HAXX only allow forwarded TLS connections
        if (!debug && !(socket as TaggedTLSSocket)._dt_api_) { socket.destroy(); }
    });

    await new Promise(resolve => server.on("listening", resolve));
    server.unref();
    return { app, server };
}

function setupApiRoutes(app: Express, conf: TunnelServiceConfig, clientConfig: TunnelClientsConfig, dispatcher: ConnectionDispatcher) {
    apiEndpoint(app, "get", "info", async (req, res) => {
        let result: ApiServerInfo | undefined = apiCache.get("serverInfo");
        if (!result) {
            const hi = getHeapStatistics();
            result = {
                baseDomain: conf.baseDomain,
                enableAcme: conf.enableAcme,
                enableDns: conf.enableDns,
                usedHeap: hi.used_heap_size,
                totalHeap: hi.total_heap_size,
                uptime: Math.round(((new Date().valueOf()) - serviceStartTime) / 1000),
                certificateInfo: conf.enableAcme ? await acmeGetCertificateInfo(conf.acmeCertDir, conf.baseDomain) : undefined
            };
            apiCache.set("serverInfo", result);
        }
        res.send(result);
    });

    apiEndpoint(app, "get", "clients", async (req, res) => {
        const eps = dispatcher.getAllEndpoints();

        const result: ApiTunnelClients = {
            clients: clientConfig.clients.map(c => ({
                name: c.user,
                endpoints: eps.filter(ep => ep.clientConnection?.user === c.user)
                    .map(ep => ({
                        name: ep.name,
                        activeConnections: ep.endpointClients.size,
                        bytesSent: ep.clientConnection.bytesSent,
                        bytesReceived: ep.clientConnection.bytesReceived,
                    }))
            }))
        };
        res.send(result);
    });

    apiEndpoint(app, "post", "clients", async (req, res) => {
        const user = req.body.user;
        assertUserName(user);

        const newToken = generateToken();
        const client = clientConfig.clients.find(c => c.user === user);
        if (client) {
            client.tokenHash = await hashToken(newToken);
        } else {
            clientConfig.clients.push({
                user,
                tokenHash: await hashToken(newToken)
            });
        }

        await saveClientConfig(clientConfig);

        // remove all open connections because token changed
        closeAllConnectionsForUser(user);
        clearAuthCache();

        res.send({
            user,
            token: packToken(conf.baseDomain, user, newToken)
        });
    });

    apiEndpoint(app, "delete", "clients/:user", async (req, res) => {
        const user = req.params.user;
        assertUserName(user);

        const idx = clientConfig.clients.findIndex(c => c.user === user);
        if (idx >= 0) {
            clientConfig.clients.splice(idx, 1);
            await saveClientConfig(clientConfig);

            // remove all open connections because user was deleted
            closeAllConnectionsForUser(user!);
            clearAuthCache();

            res.send({
                user
            });
        } else {
            res.status(404).send({
                error: "User not found"
            });
        }
    });

    function closeAllConnectionsForUser(user: string) {
        const eps = dispatcher.getAllEndpoints();
        eps.filter(ep => ep.clientConnection.user === user)
            .forEach(ep => dispatcher.removeEndpoint(ep.name));
    }
}
