import { generateAlphaNum } from "../shared/random";

export type ProtocolDataType =
    "http-request-header" |
    "http-request-body" |
    "http-response-header" |
    "http-response-body";

export type ProtocolData = {
    id: string;
    type: ProtocolDataType;
    method: string;
    path: string;
    status: number;
    statusText: string;
    headers: HttpProtocolHeaders;
    content?: Buffer;
    startAt?: number;
    endAt?: number;
};

export type HttpProtocolHeaders = { name: string, value: string }[];

const MaxHeaderLen = 4096;
const CR = 0xd, LF = 0xa;
const ReqSig = new Uint8Array([0x48, 0x54, 0x54, 0x50, 0x2f, 0x31, 0x2e, 0x31, CR, LF]);
const ResSig = new Uint8Array([0x48, 0x54, 0x54, 0x50, 0x2f, 0x31, 0x2e, 0x31, 0x20]);

const UNKNOWN_PROTO = 0;
const EXPECT_HTTP_RES_HEADER = 1;
const EXPECT_HTTP_REQ_HEADER = 2;
const EXPECT_HTTP_BODY_CHUNK_HEADER = 3;
const EXPECT_HTTP_BODY_CHUNK_DATA = 4;
const EXPECT_HTTP_BODY_DATA = 5;

export class HttpParser {
    private state = UNKNOWN_PROTO;
    private id = "";
    private contentData: Buffer | undefined;

    private headers: HttpProtocolHeaders = [];
    private expectedBodyLen = 0;
    private isRequest = false;
    private method = "";
    private path = "";
    private status = 0;
    private statusText = "";
    private startAt = 0;

    public constructor(private onParsed: (pd: ProtocolData) => void) {
    }

    public onData(d: Buffer) {
        const MaxGuard = 100;
        let i = 0, guard = 0;

        while (i < d.length && i !== -1 && guard++ < MaxGuard) {
            if (this.state === UNKNOWN_PROTO || this.state === EXPECT_HTTP_RES_HEADER || this.state === EXPECT_HTTP_REQ_HEADER) {
                this.contentData = undefined;
                const p = i;
                // REQUEST HEADER
                if ((i = d.indexOf(ReqSig, p)) >= 0) {
                    for (let _ = 0; _ < 1; _++) {
                        const j = i + ReqSig.length;
                        while (i > 0 && d[i - 1] !== LF && d[i - 1] !== CR) i--;

                        const reqBanner = d.subarray(i, j).toString("ascii").split(" ");

                        if (reqBanner.length !== 3) { i = j; break; }

                        const hdr = findHeaderBlock(d, j);
                        if (hdr) {
                            i = j + hdr.length;
                            this.headers = parseHeaders(hdr);
                            const { nextState, len } = prepareBody(this.headers, true);
                            this.state = nextState;
                            this.expectedBodyLen = len;
                        }
                        else break;

                        this.isRequest = true;
                        this.id = generateAlphaNum(12);
                        this.method = reqBanner[0]!.toUpperCase();
                        this.path = decodeURI(reqBanner[1]!);

                        this.onParsed?.({
                            id: this.id,
                            type: "http-request-header",
                            headers: this.headers,
                            method: this.method,
                            path: this.path,
                            status: 0,
                            statusText: "",
                            startAt: this.startAt = new Date().valueOf()
                        });
                    }
                }
                // RESPONSE HEADER
                else if ((i = d.indexOf(ResSig, p)) >= 0) {
                    const j = i, L = d.length;
                    while (i < L && !(d[i + 1] === CR && d[i + 2] === LF)) i++;

                    for (let _ = 0; _ < 1; _++) {
                        const resBanner = d.subarray(j, i + 1).toString("ascii").split(" ");
                        if (resBanner.length < 3) { break; }

                        const hdr = findHeaderBlock(d, j);
                        if (hdr) {
                            i = j + hdr.length;
                            this.headers = parseHeaders(hdr);
                            const { nextState, len } = prepareBody(this.headers, false);
                            this.state = nextState;
                            this.expectedBodyLen = len;
                        }
                        else break;

                        const statusCode = Number.parseInt(resBanner[1]!);
                        if (!Number.isFinite(statusCode) || statusCode < 100 || statusCode > 999) break;

                        this.isRequest = false;
                        this.status = statusCode;
                        this.statusText = resBanner.slice(2).join(" ");

                        this.onParsed?.({
                            id: this.id,
                            type: "http-response-header",
                            headers: this.headers,
                            status: this.status,
                            statusText: this.statusText,
                            method: this.method,
                            path: this.path,
                            endAt: new Date().valueOf()
                        });
                    }
                }
            } else if (this.state === EXPECT_HTTP_BODY_CHUNK_HEADER) {
                const { ok, p, size } = nextChunkSize(d, i);
                i = p;
                if (size > 0) {
                    this.expectedBodyLen = size;
                    this.state = ok ? EXPECT_HTTP_BODY_CHUNK_DATA : UNKNOWN_PROTO;
                } else if (ok) {

                    if (this.isRequest) {
                        this.onParsed?.({
                            id: this.id,
                            type: "http-request-body",
                            headers: this.headers,
                            method: this.method,
                            path: this.path,
                            status: this.status,
                            statusText: this.statusText,
                            content: this.contentData!,
                            startAt: this.startAt,
                            endAt: new Date().valueOf()
                        });
                    } else {
                        this.onParsed?.({
                            id: this.id,
                            type: "http-response-body",
                            headers: this.headers,
                            method: this.method,
                            path: this.path,
                            status: this.status,
                            statusText: this.statusText,
                            content: this.contentData!,
                            startAt: this.startAt,
                            endAt: new Date().valueOf()
                        });
                    }

                    i += 2;
                    this.state = this.isRequest ? EXPECT_HTTP_REQ_HEADER : EXPECT_HTTP_RES_HEADER;
                }
            } else if (this.state === EXPECT_HTTP_BODY_CHUNK_DATA) {
                const chunkSize = Math.min(d.length - i, this.expectedBodyLen);
                const chunk = d.slice(i, i + this.expectedBodyLen);
                this.contentData = this.contentData ? Buffer.concat([this.contentData, chunk]) : Buffer.from(chunk);
                this.expectedBodyLen -= chunkSize;
                i += chunkSize;
                if (this.expectedBodyLen === 0) {
                    i += 2; // final CRLF
                    this.state = EXPECT_HTTP_BODY_CHUNK_HEADER;
                }
            } else if (this.state === EXPECT_HTTP_BODY_DATA) {
                const chunkSize = Math.min(d.length - i, this.expectedBodyLen);
                const chunk = d.slice(i, i + this.expectedBodyLen);
                this.contentData = this.contentData ? Buffer.concat([this.contentData, chunk]) : Buffer.from(chunk);
                this.expectedBodyLen -= chunkSize;
                i += chunkSize;
                if (this.expectedBodyLen === 0) {
                    if (this.isRequest) {
                        this.onParsed?.({
                            id: this.id,
                            type: "http-request-body",
                            headers: this.headers,
                            method: this.method,
                            path: this.path,
                            status: this.status,
                            statusText: this.statusText,
                            content: this.contentData!,
                            startAt: this.startAt,
                            endAt: new Date().valueOf()
                        });
                    } else {
                        this.onParsed?.({
                            id: this.id,
                            type: "http-response-body",
                            headers: this.headers,
                            method: this.method,
                            path: this.path,
                            status: this.status,
                            statusText: this.statusText,
                            content: this.contentData!,
                            startAt: this.startAt,
                            endAt: new Date().valueOf()
                        });
                    }
                    this.state = this.isRequest ? EXPECT_HTTP_REQ_HEADER : EXPECT_HTTP_RES_HEADER;
                }
            }
        }

        // too dumb to implement parser correctly
        if (guard >= MaxGuard) {
            throw new Error("Internal parser error: " + this.state);
        }
    }
}

function prepareBody(headers: HttpProtocolHeaders, isRequest: boolean): { nextState: number; isChunked: boolean; len: number } {
    const contentLength = Number.parseInt(headers.find(h => h.name === "content-length")?.value ?? "0");

    if (headers.find(h => h.name === "transfer-encoding")?.value.includes("chunked")) {
        return { nextState: EXPECT_HTTP_BODY_CHUNK_HEADER, isChunked: true, len: 0 };
    } else if (contentLength > 0) {
        return { nextState: EXPECT_HTTP_BODY_DATA, isChunked: false, len: contentLength };
    } else {
        return { nextState: isRequest ? EXPECT_HTTP_REQ_HEADER : EXPECT_HTTP_RES_HEADER, isChunked: false, len: 0 }
    }
}

function findHeaderBlock(d: Buffer, from: number): Buffer | undefined {
    let i = from; const L = Math.min(d.length - 3, from + MaxHeaderLen);
    while (i < L &&
        !(d[i] === CR && d[i + 1] === LF && d[i + 2] === CR && d[i + 3] === LF)) {
        i++;
    }
    return i < L ? d.slice(from, i + 4) : undefined;
}

function parseHeaders(d: Buffer): HttpProtocolHeaders {
    const h: HttpProtocolHeaders = [];
    const hdrLines = d.toString("ascii").split("\r\n");
    for (const line of hdrLines) {
        const namePart = line.indexOf(":");
        if (namePart < 0) continue;
        const name = line.substring(0, namePart).toLowerCase().trim();
        const value = line.substring(namePart + 1).trim();
        if (name.length > 0 && value.length > 0) {
            h.push({ name, value });
        }
    }
    return h;
}

function nextChunkSize(d: Buffer, from: number): { ok: boolean; p: number, size: number } {
    let size = 0, p = from, ok = false;
    const chunkSizeStr = nextLine(d, from);
    if (chunkSizeStr !== undefined &&
        (size = Number.parseInt(chunkSizeStr, 16)) >= 0 &&
        Number.isFinite(size)) {
        p = from + chunkSizeStr.length + 2;
        ok = true;
    }
    return { ok, p, size };
}

function nextLine(d: Buffer, from: number): string | undefined {
    let i = from; const L = Math.min(d.length - 1, from + MaxHeaderLen);
    while (i < L && !(d[i] === CR && d[i + 1] === LF)) { i++ }
    return i < L ? d.slice(from, i).toString("ascii") : undefined;
}
