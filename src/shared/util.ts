export type Ref<T> = {
    current?: T;
};

// Deferred promise
export type Deferred<T> = Promise<T> & {
    resolve: (arg: T | PromiseLike<T>) => void;
    reject: (err?: Error) => void;
};

export function deferred<T = void>(): Deferred<T> {
    let t: Deferred<T>["resolve"], r: Deferred<T>["reject"];
    const d = new Promise<T>((res, rej) => {
        t = res; r = rej;
    }) as Deferred<T>;
    d.resolve = t!; d.reject = r!;
    return d;
}

// time helpers
export async function sleep(ms: number, weak?: boolean): Promise<void> {
    return new Promise(resolve => {
        const to = setTimeout(resolve, ms);
        if (weak && typeof to === "object") { to.unref(); }
    });
}

export function stopWatch(): bigint { return process.hrtime.bigint(); }

export function elapsed(stopwatch: bigint): number { return Math.round(Number(stopWatch() - stopwatch) / 1e6); }

export class Throttled<T> {
    private lastUpdated = 0;
    private updateTimer: ReturnType<typeof setTimeout> | undefined;

    public constructor(private interval: number,
        private func: (value: T) => void | Promise<void>) {
    }

    public update(value: T, force?: boolean): void {
        const now = new Date().valueOf();
        if (force || now - this.lastUpdated > this.interval) {
            clearTimeout(this.updateTimer);
            this.func(value);
            this.lastUpdated = now;
        } else {
            this.updateTimer = setTimeout(() => {
                this.func(value);
                this.updateTimer = undefined;
            }, this.interval - now + this.lastUpdated).unref();
        }
    }
}

export function formatDuration(s: number): string {
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    const pad = (v: number) => (v < 10 ? "0" : "") + v.toString();
    return `${d}.${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatNumber(v: number): string {
    return v.toLocaleString("en-US", { useGrouping: true })
}

export function unpackToken(token: string): { service: string; user: string; token: string } {
    if (token.length <= 24) return { service: "", user: "", token };
    const unpacked = Buffer.from(unshuffle(token), "base64")
        .toString("utf8")
        .split("#");
    return { service: unpacked[0], user: unpacked[1], token: unpacked[2] }
}

export function packToken(baseDomain: string, user: string, token: string) {
    const combined = shuffle(
        Buffer.from(`service.${baseDomain}#${user}#${token}`, "utf8")
            .toString("base64")
            .replaceAll("=", "")
    );
    return combined;
}

export function shuffle(v: string) {
    let s = ""; const h = (v.length + 1) >> 1;
    for (let i = 0; i < h; i++) {
        s = (v[h + i] ?? "") + v[i] + s
    }
    return s;
}

export function unshuffle(v: string) {
    let s = "", L = v.length;
    for (let j = 0; j < 2; j++, L--)
        for (let i = L - 1; i >= 0; i -= 2) {
            s += v[i]
        }
    return s;
}
