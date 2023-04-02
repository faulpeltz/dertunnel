export enum MessageType {
    HELLO_REQ = 1,
    HELLO_RESP = 2,
    END = 3,
    SERVER_OPEN = 4,
    SERVER_CLOSE = 5,
    CLIENT_CLOSE = 6,
    PING = 7,
    PONG = 8,
    SERVER_DATA = 65,
    CLIENT_DATA = 66
}

export function msgTypeInfo(t: MessageType): { name: string, isBinary: boolean } {
    return {
        name: Object.keys(MessageType)
            .find(v => MessageType[v as keyof typeof MessageType] === t)
            ?? "UNKNOWN", isBinary: !!(t & 64)
    }
}

export const TunnelVersion = 1;

export type HelloReqData = {
    version: number;
    user: string;
    token: string;
    endpoint?: string;
    endpointPrefix?: string;
};

export type HelloRespData = {
    success: true;
    endpoint?: string;
    serverInfo?: string;
} | {
    success: false;
    error?: string;
};

export type EndMsgData = {
    error?: string;
};

export type ServerOpenData = {
    channelId: number;
    client: string;
};

export type ServerCloseData = {
    channelId: number;
};

export type ClientCloseData = {
    channelId: number;
};