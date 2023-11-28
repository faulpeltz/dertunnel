import { Socket, createConnection } from "net";
import tls, { TLSSocket } from "tls";

import { ClientCloseData, EndMsgData, HelloReqData, HelloRespData, MessageType, ServerOpenData, TunnelVersion } from "../shared/messages";
import { EndpointPrefix, KeepAliveTime } from "../shared/models";
import { jsonData, MessageReceiver, sendMessage } from "../shared/msg-parser";
import { generateAlphaNum } from "../shared/random";
import { deferred, Throttled, unpackToken } from "../shared/util";
import { HttpParser, ProtocolDataType, type ProtocolData } from "./protocols";

export type ClientEndpointStats = {
    currentConnections: number;
    totalConnections: number;
    connectionErrors: number;
    chunksReceived: number;
    chunksSent: number;
    bytesReceived: number;
    bytesSent: number;
};

type ClientEndpointEvent =
    "connect" |
    "disconnect" |
    "data" |
    "error";

export type ClientOptions = {
    serviceHost?: string;
    servicePort?: number;
    clientToken: string;
    localServer?: string;
    localPort?: number;
    localUrl?: string;
    endpoint?: string;
    endpointPrefix?: string;
    ignoreCertErrors?: boolean;
    waitForInitialConnection?: boolean;
    protocols?: {
        inspect: boolean;
    },
    onConnected?: (assignedEndpoint: string) => void | Promise<void>;
    onError?: (err: string) => void | Promise<void>;
    onProtocolData?: (type: ProtocolDataType, cid: string, data: ProtocolData) => void | Promise<void>;
    onEndpoint?: (event: ClientEndpointEvent, stats: ClientEndpointStats, message: string) => void | Promise<void>;
};

type LocalTunnelSocket = Socket & {
    channelId: number;
    bytesReceived: number;
    bytesSent: number;
    parserIn?: HttpParser;
    parserOut?: HttpParser;
    wasConnected: boolean;
};

export async function connectTunnel(opts: ClientOptions): Promise<() => void> {
    let authenticated = false;
    let closing = false;
    let tunnelSocket: TLSSocket | undefined;

    const initialReconnectTime = 300;
    const reconnectBackoff = 1.4;
    const maxReconnectTime = 10000;

    const reconnectTimer = {
        reconnectTime: initialReconnectTime
    };

    if (!opts.endpoint && !opts.endpointPrefix) {
        throw new Error("Must either define 'endpoint' or 'endpointPrefix'");
    }

    if (!opts.clientToken || (!opts.localPort && !opts.localUrl)) {
        throw new Error("Missing required options");
    }

    const unpacked = unpackToken(opts.clientToken);
    opts.serviceHost ??= unpacked.service;
    const user = unpacked.user;
    const token = unpacked.token;

    let localServer: string, localPort: number;
    if (opts.localPort) {
        localServer = opts.localServer ?? "127.0.0.1";
        localPort = opts.localPort;
    } else {
        const url = new URL(opts.localUrl || "http://localhost");
        if (url.protocol !== "http:") {
            throw new Error("Local endpoints only support http protocol");
        }
        localServer = url.hostname;
        localPort = Number.parseInt(url.port ?? "80");
    }

    const connected = deferred();
    let serviceHost = opts.serviceHost;

    if (!serviceHost.startsWith(EndpointPrefix)) {
        serviceHost = EndpointPrefix + serviceHost;
    }

    const reconnect = () => {
        const clientStatsUpdater = new Throttled(200, () => invokeEndpointCallback("data"));
        const clientStats: ClientEndpointStats = {
            bytesReceived: 0,
            bytesSent: 0,
            chunksReceived: 0,
            chunksSent: 0,
            currentConnections: 0,
            totalConnections: 0,
            connectionErrors: 0
        };

        function invokeEndpointCallback(event: ClientEndpointEvent, message?: string) {
            try {
                opts.onEndpoint?.(event, clientStats, message ?? "")
            } catch (err) {/* ignored */ }
        }

        tunnelSocket?.destroy();
        if (opts.ignoreCertErrors) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        }
        tunnelSocket = tls.connect({
            timeout: 10_000,
            host: serviceHost,
            port: opts.servicePort || 443,
            servername: serviceHost,
            ...(opts.ignoreCertErrors ? { checkServerIdentity: () => undefined } : {})
        }, () => {
            if (!tunnelSocket) return;
            tunnelSocket.setKeepAlive(true, KeepAliveTime);
            sendMessage<HelloReqData>(tunnelSocket, MessageType.HELLO_REQ, 0, {
                version: TunnelVersion,
                user,
                token,
                endpoint: opts.endpoint,
                endpointPrefix: opts.endpointPrefix
            });
        })

        tunnelSocket.setMaxListeners(0);

        const localSockets = new Map<number, LocalTunnelSocket>();
        let pingTimer: NodeJS.Timeout | undefined;
        let pongTimeout: NodeJS.Timeout | undefined;

        // messages from server
        const receiver = new MessageReceiver(async (type, channel, data) => {
            if (!authenticated && type === MessageType.HELLO_RESP) {
                const msg = jsonData<HelloRespData>(data);
                if (!msg.success) {
                    tunnelSocket?.destroy();
                    const errMsg = "Server connection error: " + (msg.error ?? "Unknown error");
                    connected.reject(new Error(errMsg));
                    void opts.onError?.(errMsg);
                    return;
                }
                void opts.onConnected?.(msg.endpoint || "");
                clientStatsUpdater.update(undefined, true);
                connected.resolve();
                authenticated = true;
                reconnectTimer.reconnectTime = initialReconnectTime;

                pingTimer = setInterval(() => {
                    if (!tunnelSocket) {
                        pingTimer && clearInterval(pingTimer);
                        pongTimeout && clearTimeout(pongTimeout);
                        return;
                    }
                    try {
                        sendMessage(tunnelSocket, MessageType.PING, 0);
                    }
                    catch (err) {
                        pingTimer && clearInterval(pingTimer);
                    }
                    pongTimeout = setTimeout(() => {
                        void opts.onError?.("Server pong timeout");
                        tunnelSocket?.destroy();
                    }, 7000).unref();
                }, 15000).unref();
            }

            if (type === MessageType.END) {
                tunnelSocket?.destroy();
                const msg = jsonData<EndMsgData>(data);
                if (msg.error) {
                    void opts.onError?.(msg.error);
                }
                return;
            }

            if (authenticated) {
                if (type === MessageType.PING) {
                    sendMessage(tunnelSocket!, MessageType.PONG, 0);
                }
                else if (type === MessageType.PONG) {
                    pongTimeout && clearTimeout(pongTimeout);
                }
                else if (type === MessageType.SERVER_DATA) {
                    const localSocket = localSockets.get(channel);
                    if (localSocket) {
                        clientStats.bytesSent += data.length;
                        clientStats.chunksSent++;
                        localSocket.bytesSent += data.length;

                        if (localSocket.parserOut) {
                            try {
                                localSocket.parserOut.onData(data);
                            }
                            catch (err) {
                                invokeEndpointCallback("error", (err as Error)?.message);
                            }
                        }

                        localSocket.write(data);
                        clientStatsUpdater.update(undefined, false);
                    }
                }
                else if (type === MessageType.SERVER_OPEN) {
                    const msg = jsonData<ServerOpenData>(data);
                    const localSocket = createConnection({
                        host: localServer,
                        port: localPort,
                        allowHalfOpen: false,
                    }) as LocalTunnelSocket;

                    localSocket.channelId = msg.channelId;
                    localSocket.wasConnected = false;

                    const cid = generateAlphaNum();
                    const parserCallback = (pd: ProtocolData) => {
                        try {
                            opts.onProtocolData?.(pd.type, cid, pd);
                        } catch (err) {/* ignore */ }
                    };
                    if (opts.protocols?.inspect) {
                        localSocket.parserIn = new HttpParser(parserCallback);
                        localSocket.parserOut = new HttpParser(parserCallback);
                    }
                    localSocket.bytesReceived = localSocket.bytesSent = 0;
                    localSockets.set(msg.channelId, localSocket);

                    localSocket.on("connect", () => {
                        localSocket.wasConnected = true;
                        clientStats.currentConnections++;
                        clientStats.totalConnections++;
                        invokeEndpointCallback("connect");
                        clientStatsUpdater.update(undefined, true);
                    });

                    localSocket.on("close", () => {
                        if (localSocket.wasConnected) {
                            clientStats.currentConnections = Math.max(0, clientStats.currentConnections - 1);
                        }
                        localSockets.delete(msg.channelId);
                        sendMessage<ClientCloseData>(tunnelSocket!, MessageType.CLIENT_CLOSE, 0,
                            { channelId: localSocket.channelId });
                        invokeEndpointCallback("disconnect");
                        clientStatsUpdater.update(undefined, true);
                    });

                    localSocket.on("data", buf => {
                        localSocket.bytesReceived += buf.length;
                        clientStats.bytesReceived += buf.length;
                        clientStats.chunksReceived++;

                        if (localSocket.parserIn) {
                            try {
                                localSocket.parserIn.onData(buf);
                            }
                            catch (err) {
                                invokeEndpointCallback("error", (err as Error)?.message);
                            }
                        }

                        const ok = sendMessage(tunnelSocket!, MessageType.CLIENT_DATA, localSocket.channelId, buf);
                        if (!ok && !localSocket.isPaused()) {
                            localSocket.pause();
                            tunnelSocket!.once("drain", () => {
                                localSocket.resume();
                            });
                        }
                        clientStatsUpdater.update(undefined, false);
                    });

                    localSocket.on("error", err => {
                        /* handled by close */
                        clientStats.connectionErrors++;
                        invokeEndpointCallback("error", (err as Error)?.message);
                        clientStatsUpdater.update(undefined, true);
                    });
                }
                else if (type === MessageType.SERVER_CLOSE) {
                    const msg = jsonData<ServerOpenData>(data);
                    const localSocket = localSockets.get(msg.channelId);
                    if (localSocket) {
                        localSockets.delete(msg.channelId);
                        localSocket.end(() => localSocket.destroy());
                    }
                }
            }
        });

        tunnelSocket.on("error", err => {
            authenticated = false;
            if (closing) { return; }
            connected.reject(err);
            void opts.onError?.("Server connection error: " + err["message"]);
        });
        tunnelSocket.on("close", () => {
            authenticated = false;
            pingTimer && clearInterval(pingTimer);
            pongTimeout && clearTimeout(pongTimeout);
            localSockets.forEach(s => s.destroy());
            if (closing) { return; }
            setTimeout(reconnect, reconnectTimer.reconnectTime);
            reconnectTimer.reconnectTime = Math.min(maxReconnectTime, reconnectTimer.reconnectTime * reconnectBackoff);
        });
        tunnelSocket.on("data", (data: Buffer) => {
            if (closing) { return; }
            if (!receiver.receive(data)) {
                // protocol violation
                tunnelSocket?.destroy();
            }
        });
    };

    reconnect();
    if (opts.waitForInitialConnection !== false) {
        await connected;
    }
    return () => { closing = true; tunnelSocket?.destroy(); };
}
