export type ProtocolDataType =
    "http-request-header" |
    "http-request-body" |
    "http-response-header" |
    "http-response-body";

export type ProtocolData = {
    id: string;
    type: ProtocolDataType;
    method: string;
    path: string;
    status: number;
    statusText: string;
    headers: HttpProtocolHeaders;
    content?: Buffer;
    startAt?: number;
    endAt?: number;
};

export type HttpProtocolHeaders = { name: string, value: string }[];

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

export declare function connectTunnel(opts: ClientOptions): Promise<() => void>;
