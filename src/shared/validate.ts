export const HostnameValidator = /^(([a-z0-9]|[a-z0-9][a-z0-9\-]*[a-z0-9])\.)*([a-z0-9]|[a-z0-9][a-z0-9\-]*[a-z0-9])$/i;
export const EndpointValidator = /^[a-z0-9][a-z0-9\-]*[a-z0-9]$/i;

export const isPortNumber = function (v: unknown) { return typeof v === "number" && v > 0 && v < 0x10000 }

export function assertHostname(value: unknown, label: string): void {
    if (typeof (value) !== "string" || !HostnameValidator.test(value)) {
        throw new Error(`Invalid host name '${value}' for '${label}'`);
    }
}

export function assertEndpoint(value: unknown, label: string): void {
    if (typeof (value) !== "string" || !EndpointValidator.test(value)) {
        throw new Error(`Invalid endpoint name '${value} for '${label}''`);
    }
}

export function assertUserName(value: unknown): void {
    assertString(value, "username", 3);
    if (!/^[a-z0-9_\-\.]{3,}$/i.test(value as string)) {
        throw new Error(`Value must be a valid user name`);
    }
}

export function assertString(value: unknown, label: string, minLen = 0): void {
    if (typeof value !== "string" || value.length < minLen) {
        throw new Error(`Value must be a string of at least len ${minLen} for '${label}'`);
    }
}

export function assertBool(value: unknown, label: string): void {
    if (typeof value !== "boolean") {
        throw new Error(`Value must be a boolean for '${label}'`);
    }
}

export function assertArray(value: unknown, label: string): void {
    if (!Array.isArray(value)) {
        throw new Error(`Value must be an array for '${label}'`);
    }
}

export function assertNumber(value: unknown, label: string, isInteger = false, cond?: (v: number) => boolean): void {
    if (typeof value !== "number") {
        throw new Error(`Value must be a number for '${label}'`);
    }
    if (!Number.isFinite(value)) {
        throw new Error(`Value must be a finite number '${label}'`);
    }
    if (isInteger && !Number.isInteger(value)) {
        throw new Error(`Value must be an integer '${label}'`);
    }
    if (cond && !cond(value)) {
        throw new Error(`Value outside of allowed values '${label}'`);
    }
}
