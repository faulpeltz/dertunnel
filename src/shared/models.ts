export const TunnelClientEndpointName = "service";
export const AdminEndpointName = "admin";
export const EndpointPrefix = TunnelClientEndpointName + ".";

export const KeepAliveTime = 5000;

export type ApiTunnelClient = {
    name: string;
    endpoints: {
        name: string;
        activeConnections: number;
        bytesSent: number;
        bytesReceived: number;
    }[]
};

export type ApiTunnelClients = {
    clients: ApiTunnelClient[];
};

export type AcmeCertInfo = {
    valid: boolean;
    expires?: Date;
    issuer?: string;
    error?: string
};

export type ApiServerInfo = {
    baseDomain: string;
    enableDns: boolean;
    enableAcme: boolean;
    totalHeap: number;
    usedHeap: number;
    uptime: number;
    certificateInfo?: AcmeCertInfo;
}

export type ApiClientInfo = {
    user: string;
    token: string;
}
