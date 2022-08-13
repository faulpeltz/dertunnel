import { Writable } from "stream";
import { MessageType } from "../shared/messages";
import { MessageReceiver, sendMessage } from "../shared/msg-parser";

describe("Message Parser", () => {
    test("Parse", async () => {
        const messages: { t: number, c: number, d: string }[] = [];
        const r = new MessageReceiver(async (t, c, d) => {
            messages.push({ t, c, d: d.toString("ascii") });
        });

        // empty chunk
        expect(await r.receive(Buffer.from([]))).toBe(true);

        // exactly one message in the bufer
        expect(await r.receive(Buffer.from([70, 80, 7, 0, 1, 0, 0, 0, 4, 0, 0, 0, 68, 69, 82, 69]))).toBe(true);

        // message sliced into three chunks - first chunk is smaller than header
        expect(await r.receive(Buffer.from([70, 80, 8]))).toBe(true);
        expect(await r.receive(Buffer.from([0, 2, 0, 0, 0, 4, 0, 0, 0, 68, 69]))).toBe(true);
        expect(await r.receive(Buffer.from([82, 69]))).toBe(true);

        // multiple messages spread over multiple buffers
        expect(await r.receive(Buffer.from([
            70, 80, 9, 0, 2, 0, 0, 0, 4, 0, 0, 0, 68, 69, 82, 69,
            70, 80, 0xa, 0, 3, 0, 0, 0, 5, 0, 0, 0
        ]))).toBe(true);
        expect(await r.receive(Buffer.from([
            82, 82, 69, 69, 69, 70, 80, 0xB, 0, 4, 0, 0, 0, 4, 0, 0, 0, 68, 69, 82, 69
        ]))).toBe(true);

        expect(messages).toEqual([
            { t: 7, c: 1, d: "DERE" },
            { t: 8, c: 2, d: "DERE" },
            { t: 9, c: 2, d: "DERE" },
            { t: 10, c: 3, d: "RREEE" },
            { t: 11, c: 4, d: "DERE" },
        ]);
    });

    test("Send", async () => {
        const buf = createWritableBuffer();
        sendMessage(buf.stream, MessageType.HELLO_REQ, 42069, { foo: "bar" });
        expect(Array.from(buf.buffer)).toEqual([
            70, 80, 1, 0, 0x55, 0xa4, 0, 0, 13, 0, 0, 0, // header
            0x7B, 0x22, 0x66, 0x6F, 0x6F, 0x22, 0x3A, 0x22, 0x62, 0x61, 0x72, 0x22, 0x7D // payload
        ]);
    });

    test("Send & Parse", async () => {
        const messages: { t: number, c: number, d: string, l: number }[] = [];
        const r = new MessageReceiver(async (t, c, d) => {
            messages.push({ t, c, d: d.toString("ascii"), l: d.length });
        });

        const buf = createWritableBuffer();
        sendMessage(buf.stream, MessageType.HELLO_REQ, 42069, { foo: "bar" });
        sendMessage(buf.stream, MessageType.CLIENT_DATA, 1234, Buffer.alloc(1024 * 1024, 42));
        await r.receive(buf.buffer);

        expect(messages).toMatchObject([
            { t: MessageType.HELLO_REQ, c: 42069, d: '{"foo":"bar"}' },
            { t: MessageType.CLIENT_DATA, c: 1234, l: 1024 * 1024 }
        ]);
    });

    test("Multiple chunks per message", async () => {
        let receivedData = 0, receivedMessageCount = 0;
        const r = new MessageReceiver(async (t, c, d) => {
            receivedMessageCount++;
            receivedData += d.length;
        });

        const buf = createWritableBuffer();
        sendMessage(buf.stream, MessageType.CLIENT_DATA, 0, Buffer.alloc(1000, 0));
        sendMessage(buf.stream, MessageType.CLIENT_DATA, 1, Buffer.alloc(100000, 1));
        sendMessage(buf.stream, MessageType.CLIENT_DATA, 2, Buffer.alloc(150000, 2));

        for (let i = 0; i < buf.buffer.length; i += 16384) {
            await r.receive(buf.buffer.slice(i, i + 16384));
        }

        expect(receivedMessageCount).toBe(3);
        expect(receivedData).toBe(251000);
    });
});

function createWritableBuffer(): { stream: Writable, buffer: Buffer } {
    const result = {
        buffer: Buffer.alloc(0),
        stream: new Writable({
            write: (chunk, _, next) => {
                result.buffer = Buffer.concat([result.buffer, chunk])
                next();
            }
        })
    };
    return result;
}
