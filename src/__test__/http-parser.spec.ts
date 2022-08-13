import { HttpParser, ProtocolData } from "../client/protocols";

describe("HTTP inspector", () => {
    test("Request - no body", async () => {
        let result: ProtocolData[] = [];
        const p = new HttpParser(pd => result.push(pd));

        // GET+HEAD request no body
        p.onData(Buffer.from(
            "GET /fubar%20spaces HTTP/1.1\r\n" +
            "Host: server.io\r\n" +
            "Cookie: om=nomnom\r\n" +
            "\r\n" +
            "HEAD /another HTTP/1.1\r\n" +
            "Host: server.io\r\n" +
            "\r\n",
            "ascii"));

        expect(result).toMatchObject([{
            type: "http-request-header",
            method: "GET",
            path: "/fubar spaces",
            headers: [
                { name: "host", value: "server.io" },
                { name: "cookie", value: "om=nomnom" }
            ]
        }, {
            type: "http-request-header",
            method: "HEAD",
            path: "/another",
            headers: [{ name: "host", value: "server.io" }]
        }]);
    });

    test("Request - ld body", async () => {
        let result: ProtocolData[] = [];
        const p = new HttpParser(pd => result.push(pd));

        // POST with length-delimited body
        p.onData(Buffer.from(
            "POST /push/it HTTP/1.1\r\n" +
            "Host: server.io\r\n" +
            "Content-Type: text/plain\r\n" +
            "Content-Length: 19\r\n" +
            "\r\n" +
            "THIS_IS",
            "ascii"));
        p.onData(Buffer.from("_THE_CONTENT"));

        expect(result).toMatchObject([{
            type: "http-request-header",
            method: "POST",
            path: "/push/it",
            headers: [
                { name: "host", value: "server.io" },
                { name: "content-type", value: "text/plain" },
                { name: "content-length", value: "19" }
            ]
        }, {
            type: "http-request-body",
            method: "POST",
            path: "/push/it",
            headers: [
                { name: "host", value: "server.io" },
                { name: "content-type", value: "text/plain" },
                { name: "content-length", value: "19" }
            ],
            content: Buffer.from("THIS_IS_THE_CONTENT")
        }]);
    });

    test("Response - chunk body", async () => {
        let result: ProtocolData[] = [];
        const p = new HttpParser(pd => result.push(pd));

        // POST with chunked body
        p.onData(Buffer.from(
            "HTTP/1.1 200 OK\r\n" +
            "Content-Type: text/plain\r\n" +
            "Transfer-Encoding: chunked\r\n" +
            "\r\n" +
            "7\r\n" +
            "THIS_IS\r\n",
            "ascii"));

        p.onData(Buffer.from("c\r\n_THE_CONTENT\r\n0\r\n\r\n"));

        expect(result).toMatchObject([{
            type: "http-response-header",
            status: 200,
            headers: [
                { name: "content-type", value: "text/plain" },
                { name: "transfer-encoding", value: "chunked" }
            ]
        }, {
            type: "http-response-body",
            status: 200,
            headers: [
                { name: "content-type", value: "text/plain" },
                { name: "transfer-encoding", value: "chunked" }
            ],
            content: Buffer.from("THIS_IS_THE_CONTENT")
        }]);
    });
});
