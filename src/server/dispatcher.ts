import { RateLimiterMemory } from "rate-limiter-flexible";
import { TLSSocket } from "tls";

import { ClientCloseData, EndMsgData, HelloReqData, HelloRespData, MessageType, ServerCloseData, ServerOpenData, TunnelVersion } from "../shared/messages";
import { KeepAliveTime } from "../shared/models";
import { jsonData, MessageReceiver, sendMessage } from "../shared/msg-parser";
import { generateAlphaNum } from "../shared/random";
import { assertEndpoint, assertString, assertUserName } from "../shared/validate";

enum ClientState {
    NEW = 0,
    ACTIVE = 1,
    ENDED = 2
}

export type ClientConnection = {
    socket: TLSSocket;
    user: string;
    endpoint?: Endpoint;
    state: ClientState;
    receiver?: MessageReceiver;
    bytesReceived: number;
    bytesSent: number;
};

export type TaggedSocket = {
    channelId: number;
    bytesSent: number;
    bytesReceived: number;
} & TLSSocket;

export type Endpoint = {
    name: string;
    clientConnection: ClientConnection;
    endpointClients: Map<number, TaggedSocket>;
}

const log = console.log;
let channelIdCounter = 10000;

export class ConnectionDispatcher {
    private endpoints: Map<string, Endpoint> = new Map();

    private limiter = new RateLimiterMemory({
        points: 30,
        duration: 120
    });

    public constructor(private baseDomain: string, private authProvider: (user: string, token: string) => Promise<boolean>) {
    }

    public onClientConnect(socket: TLSSocket): void {
        const cc: ClientConnection = {
            socket,
            user: "",
            state: ClientState.NEW,
            bytesReceived: 0,
            bytesSent: 0
        };

        let pingTimer: NodeJS.Timer | undefined;
        let pongTimeout: NodeJS.Timeout | undefined;
        socket.setKeepAlive(true, KeepAliveTime);

        socket.on("close", () => {
            pingTimer && clearInterval(pingTimer);
            if (cc.user && cc.endpoint?.name) {
                log(`Client disconnected: ${cc.endpoint?.name}@${cc.user}`);
            }
            cc.endpoint && this.removeEndpoint(cc.endpoint.name);
        });

        cc.receiver = new MessageReceiver(async (type, channel, data) => {
            if (type === MessageType.HELLO_REQ) {
                try {
                    if (cc.state !== ClientState.NEW) {
                        throw new Error("Invalid state for HELLO_REQ");
                    }

                    // sanity check message
                    const hello = jsonData<HelloReqData>(data);
                    if (hello.version !== TunnelVersion) {
                        throw new Error("Invalid tunnel protocol version");
                    }
                    assertUserName(hello.user);

                    // throws if exceeded
                    await this.limiter.consume(`${socket.remoteAddress}:${hello.user}`);

                    assertString(hello.token, "token");
                    assertEndpoint(hello.endpoint ?? hello.endpointPrefix, "endpoint");
                    if (!await this.authProvider(hello.user, hello.token)) {
                        throw new Error("Invalid username or token");
                    }

                    cc.user = hello.user;

                    // check endpoint
                    let resolvedEndpoint: Endpoint;
                    if (hello.endpoint) {
                        if (!this.isEndpointNameAvailable(hello.endpoint, hello.user)) {
                            throw new Error("Endpoint with this name is already in use");
                        }
                        resolvedEndpoint = this.addEndpoint(hello.endpoint, cc);
                    } else if (hello.endpointPrefix) {
                        resolvedEndpoint = this.addEndpointPrefixed(hello.endpointPrefix, cc);
                    } else {
                        throw new Error("Internal error");
                    }

                    cc.endpoint = resolvedEndpoint;
                    cc.state = ClientState.ACTIVE;

                    log(`Client connected: ${resolvedEndpoint.name}@${hello.user}`);
                    // success
                    sendMessage<HelloRespData>(socket, MessageType.HELLO_RESP, 0, {
                        success: true,
                        endpoint: resolvedEndpoint.name + "." + this.baseDomain,
                        serverInfo: "DerTunnel"
                    });

                    pingTimer = setInterval(() => {
                        try { sendMessage(socket, MessageType.PING, 0); }
                        catch (err) {
                            pingTimer && clearInterval(pingTimer);
                        }
                        pongTimeout = setTimeout(() => {
                            log(`Client timed out: ${resolvedEndpoint.name}@${hello.user}`);
                            socket.destroy();
                        }, 7000).unref();
                    }, 15000).unref();
                }
                catch (err) {
                    sendMessage<HelloRespData>(socket, MessageType.HELLO_RESP, 0, {
                        success: false,
                        error: (err as Error)?.message ??
                            ((err as object)["remainingPoints"] ? "Too many connection attempts - Try again later" : "Error")
                    });
                    socket.destroy(err as Error);
                }
            }
            else if (type === MessageType.CLIENT_DATA) {
                if (cc.state !== ClientState.ACTIVE) {
                    sendMessage<EndMsgData>(socket, MessageType.END, 0, {
                        error: "Invalid client state for message type"
                    });
                    socket.destroy();
                    return;
                }

                const ep = cc.endpoint;
                if (ep) {
                    const ts = ep.endpointClients.get(channel);
                    if (ts) {
                        ts.bytesSent += data.length;
                        cc.bytesSent += data.length;
                        ts.write(data);
                        // TODO add SERVER_THROTTLE message for flowcontrol on this channel id
                    }
                }
            }
            else if (type === MessageType.CLIENT_CLOSE) {
                if (cc.state !== ClientState.ACTIVE) {
                    sendMessage<EndMsgData>(socket, MessageType.END, 0, {
                        error: "Invalid client state for message type"
                    });
                    socket.destroy();
                    return;
                }
                const msg = jsonData<ClientCloseData>(data);
                const ep = cc.endpoint;
                if (ep) {
                    const sock = ep.endpointClients.get(msg.channelId);
                    sock?.end(() => sock?.destroy());
                    ep.endpointClients.delete(msg.channelId);
                }
            }
            else if (type === MessageType.END) {
                cc.state = ClientState.ENDED;
                socket.destroy();
            } 
            else if (type === MessageType.PONG) {
                pongTimeout && clearTimeout(pongTimeout);
            }
            else if (type === MessageType.PING) {
                sendMessage(socket, MessageType.PONG, 0);
            }
        });

        socket.on("data", buf => {
            if (!cc.receiver?.receive(buf)) {
                // protocol violation
                socket.destroy();
            }
        });
        socket.on("error", err => {/* NOP */ });
    }

    public onEndpointConnect(ep: string, epSocket: TLSSocket): void {
        const endpoint = this.endpoints.get(ep);
        if (!endpoint) {
            epSocket.destroy();
            return;
        }
        epSocket!.setKeepAlive(true, KeepAliveTime);

        const ts = epSocket as TaggedSocket;
        ts.channelId = channelIdCounter++;
        endpoint.endpointClients.set(ts.channelId, ts);

        ts.bytesReceived = ts.bytesSent = 0;

        epSocket.on("close", () => {
            sendMessage<ServerCloseData>(endpoint.clientConnection.socket, MessageType.SERVER_CLOSE, 0, { channelId: ts.channelId });
            endpoint.endpointClients.delete(ts.channelId);
        });
        epSocket.on("data", (data: Buffer) => {
            ts.bytesReceived += data.length;
            endpoint.clientConnection.bytesReceived += data.length;
            const ok = sendMessage(endpoint.clientConnection.socket, MessageType.SERVER_DATA, ts.channelId, data);
            // flow control
            if (!ok && !epSocket.isPaused()) {
                epSocket.pause();
                ts.once("drain", () => epSocket.resume());
            }
        });
        epSocket.on("error", err => {
            // no difference to close
        });
        sendMessage<ServerOpenData>(endpoint.clientConnection.socket, MessageType.SERVER_OPEN, 0, {
            channelId: ts.channelId,
            client: epSocket.remoteAddress?.toString() ?? ""
        });
    }

    public getAllEndpoints(): Endpoint[] {
        return Array.from(this.endpoints.values());
    }

    public isEndpointNameAvailable(name: string, user: string): boolean {
        const ep = this.endpoints.get(name.toLowerCase());
        return !ep || ep.clientConnection.user === user;
    }

    public addEndpointPrefixed(epp: string, cc: ClientConnection): Endpoint {
        const name = epp.toLowerCase() || "custom";
        let i = 0;
        while (i++ < 42) {
            const cand = `${name}-${generateAlphaNum()}`;
            if (!this.endpoints.has(cand)) {
                const ep = {
                    name: cand,
                    clientConnection: cc,
                    endpointClients: new Map()
                };
                this.endpoints.set(cand, ep);
                return ep;
            }
        }
        throw new Error("Internal error");
    }

    public addEndpoint(name: string, cc: ClientConnection): Endpoint {
        const ep = {
            name: name.toLowerCase(),
            clientConnection: cc,
            endpointClients: new Map()
        };

        this.endpoints.get(name)?.clientConnection.socket.destroy();
        this.endpoints.set(name, ep);
        return ep;
    }

    public removeEndpoint(ep: string) {
        const lep = ep.toLowerCase();
        const uep = this.endpoints.get(lep);
        if (uep) {
            uep.clientConnection.socket.destroy();
            uep.endpointClients.forEach(ec => ec.destroy());
            this.endpoints.delete(lep);
        }
    }
};
