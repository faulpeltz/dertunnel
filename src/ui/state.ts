import type { ApiServerInfo, ApiTunnelClient } from "../shared/models";

export type RenderState = {
    clients: ApiTunnelClient[];
    serverInfo?: ApiServerInfo;
    alert: {
        visible: boolean;
        text: string;
        tokenText?: string;
    };
};

export const initialState: RenderState = {
    clients: [],
    alert: {
        visible: false,
        text: ""
    }
}
