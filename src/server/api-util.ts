import { NextFunction, Request, Response, Express } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";

import { authenticateAdmin } from "./auth";
import { TunnelServiceConfig } from "./config";

export type ApiEndPointHandler = (req: Request, res: Response) => Promise<void>;

export function apiEndpoint(app: Express, method: "get" | "post" | "put" | "delete", path: string, func: ApiEndPointHandler): void {
    app[method].bind(app)(`/api/${path}`, function (req: Request, res: Response) {
        func(req, res).then(() => {
            if (!res.headersSent) {
                res.status(204).send();
            }
        }).catch(err => {
            if (err instanceof ApiError) {
                res.status(err.status ?? 500).json({
                    message: err.message
                });
            } else {
                res.status(500).json({
                    message: typeof err === "object" ? err.message : "Unknown error"
                });
            }
        });
    })
}

const limiter = new RateLimiterMemory({
    points: 10,
    duration: 60
});

export function setupBasicAuth(conf: TunnelServiceConfig) {
    return function adminBasicAuth(req: Request, res: Response, next: NextFunction): void {
        function sendBasicAuthChallenge() {
            // rate limit key is request ip for anon and userId for logged-in requests
            limiter.consume(req.ip)
                .then(() => {
                    res.header("www-authenticate", `Basic realm="DerTunnel Server Admin", charset="UTF-8"`)
                        .status(401).send();
                })
                .catch(() => {
                    res.status(429).send();
                });
        }
        const auth = req.header("authorization");
        if (auth) {
            const [t, cred] = auth.split(" ");
            if (t === "Basic") {
                const userPwd = Buffer.from(cred, "base64").toString("utf8");
                const i = userPwd.indexOf(":");
                if (i > 0) {
                    authenticateAdmin(conf, userPwd.slice(0, i), userPwd.slice(i + 1)).then(ok => {
                        if (ok) next(); else sendBasicAuthChallenge();
                    });
                    return;
                }
            }
        }
        sendBasicAuthChallenge();
    }
}

export function throwApiError(message: string, status = 500) {
    throw new ApiError(message, status);
}

class ApiError extends Error {
    public constructor(public override message: string, public status: number) {
        super(message);
    }
}