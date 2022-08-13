import type { ApiClientInfo, ApiServerInfo, ApiTunnelClients } from "../shared/models";

export async function apiGet(url: string) {
    const resp = await fetch("/api/" + url, {
        method: "GET",
        cache: "no-cache",
    });
    if (resp.status >= 400) {
        throw new Error(await resp.json());
    }
    return await resp.json();
}

export async function apiPost(url: string, body: object) {
    const resp = await fetch("/api/" + url, {
        method: "POST",
        cache: "no-cache",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(body)
    });
    if (resp.status >= 400) {
        throw new Error(await resp.json());
    }
    return await resp.json();
}

export async function apiDelete(url: string) {
    const resp = await fetch("/api/" + url, {
        method: "DELETE",
        cache: "no-cache",
    });
    if (resp.status >= 400) {
        throw new Error(await resp.json());
    }
    return await resp.json();
}


export async function apiGetClients(): Promise<ApiTunnelClients> {
    return await apiGet("clients") as ApiTunnelClients;
}

export async function apiGetServerInfo(): Promise<ApiServerInfo> {
    return await apiGet("info") as ApiServerInfo;
}

export async function apiCreateOrUpdateClient(user: string): Promise<ApiClientInfo> {
    return await apiPost("clients", { user }) as ApiClientInfo;
}

export async function apiDeleteClient(user: string): Promise<ApiClientInfo> {
    return await apiDelete(`clients/${user}`) as ApiClientInfo;
}
