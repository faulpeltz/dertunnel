import { scrypt } from "crypto";
import { generateToken } from "./random";

// password helpers
const KeyLen = 32;
const SaltLen = 32;

export async function hashToken(token: string): Promise<string> {
    return new Promise(resolve => {
        const salt = generateToken(SaltLen);
        scrypt(token ?? "", salt, KeyLen, (_, buf) => resolve(`${salt}:${buf?.toString("base64")}`));
    });
}

export async function verifyToken(hash: string, token: string): Promise<boolean> {
    return new Promise(resolve => {
        const [salt, hashed] = hash.split(":");
        scrypt(token, salt, KeyLen, (_, buf) => resolve(safeEquals(buf.toString("base64"), hashed)));
    });
}

export function safeEquals(a: string, b: string): boolean {
    let sum = 0;
    let l = a + "";
    const r = b + "";

    if (l.length !== r.length) { l = r; sum = 1; }

    for (let i = 0; i < l.length; i++) {
        sum |= (l.charCodeAt(i) ^ r.charCodeAt(i));
    }
    return sum === 0;
}
