import type { Writable } from "stream";
import { MessageType, msgTypeInfo } from "./messages";

const MaxSize = 1 * 1024 * 1024;
const HeaderLen = 12;
const Magic0 = 70, Magic1 = 80;
const Magic0Offset = 0;
const Magic1Offset = 1;
const TypeOffset = 2;
const ChannelOffset = 4;
const LenOffset = 8;

const debug = !!process.env.DERTUNNEL_DEBUG;

export class MessageReceiver {
    private buffer: Buffer | undefined = undefined;

    public constructor(private onMessage: (type: number, channel: number, data: Buffer) => Promise<void>) {
    }

    public async receive(chunk: Buffer): Promise<boolean> {
        const buf = this.buffer ? Buffer.concat([this.buffer, chunk]) : chunk;
        let i = 0;
        while (i < buf.length) {
            if (buf.length < i + HeaderLen) {
                this.buffer = buf.subarray(i);
                return true;
            }
            if (buf[i + Magic0Offset] != Magic0 || buf[i + Magic1Offset] != Magic1) {
                this.reset();
                return false;
            }
            const type = buf.readUint16LE(i + TypeOffset);
            const channel = buf.readUint32LE(i + ChannelOffset);
            const len = buf.readUint32LE(i + LenOffset);
            const mlen = len + HeaderLen;
            const end = mlen + i;
            if (len > MaxSize) {
                this.reset();
                return false;
            }
            if (buf.length >= end) {
                try {
                    const data = buf.subarray(i + HeaderLen, end);
                    if (debug) {
                        logMessage(type, channel, data, false);
                    }
                    await this.onMessage(type, channel, data);
                }
                catch (err) {
                    this.reset();
                    return false;
                }
            } else break;
            i = end;
        }
        this.buffer = buf.length > i ? buf.subarray(i) : undefined;
        return true;
    }

    public reset(): void {
        this.buffer = undefined;
    }
}

export function sendMessage<T extends object>(writable: Writable, type: MessageType, channel: number, data?: Buffer | T): boolean {
    const buf = Buffer.isBuffer(data) ? data : (data ? Buffer.from(JSON.stringify(data)) : undefined);
    
    const packet = Buffer.allocUnsafe(HeaderLen + (buf ? buf.length : 0));
    packet.writeUint8(Magic0, Magic0Offset); packet.writeUint8(Magic1, Magic1Offset);
    packet.writeUint16LE(type, TypeOffset);
    packet.writeUint32LE(channel, ChannelOffset);
    packet.writeUint32LE(buf ? buf.length : 0, LenOffset);
    buf?.copy(packet, HeaderLen, 0);

    const ok = writable.write(packet);
    debug && logMessage(type, channel, buf, true);
    return ok;
}

export function jsonData<T extends object>(data: Buffer): T {
    return JSON.parse(data.toString("utf8"));
}

function logMessage(type: MessageType, channel: number, data: Buffer | undefined, outbound: boolean) {
    const { name, isBinary } = msgTypeInfo(type);
    console.debug(`[msg-${outbound ? "out" : "in"} ${name} ${channel > 0 ? channel : ""}] `
        + `${data ? (isBinary ? `- ${data.length} payload bytes` : data.toString("utf8")) : "- empty"}`);
}
