import LRUCache from "lru-cache";
import { verifyToken } from "../shared/hash";
import { unpackToken } from "../shared/util";
import { TunnelClientsConfig, TunnelServiceConfig } from "./config";

// cache 5min
const authCache = new LRUCache<string, boolean>({ max: 100, ttl: 300_000 });

export function clearAuthCache() { authCache.clear(); }

export async function authenticateUser(clients: TunnelClientsConfig, user: string, token: string): Promise<boolean> {
    // try to unwrap packed token
    if (token.length > 24 && !user) {
        try {
            const u = unpackToken(token);
            user = u.user;
            token = u.token;
        }
        catch (err) { return false; }
    }

    const luser = user.toLowerCase();
    const conf = clients.clients.find(c => c.user === luser);
    if (conf) {
        const ck = `${user}#${token}`;
        const ok = authCache.get(ck) ?? await verifyToken(conf.tokenHash, token);
        authCache.set(ck, ok);
        return ok;
    }
    return false;
}

export async function authenticateAdmin(conf: TunnelServiceConfig, user: string, token: string): Promise<boolean> {
    const ck = `$ADMIN$${token}`;
    const ok = authCache.get(ck) ?? (user === "admin" && await verifyToken(conf.adminTokenHash, token));
    authCache.set(ck, ok);
    return ok;
}
