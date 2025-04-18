import { Packet, createServer, DnsAnswer } from "dns2";

export const dnsTextRecords: Map<string, string> = new Map();

export function startDnsServer(port: number, baseDomain: string, targetHost: string): ReturnType<typeof createServer> {
    const suffix = "." + baseDomain;

    const dnsServer = createServer({
        udp: true,
        handle: (request, send) => {
            const response = Packet.createResponseFromRequest(request);
            const [r] = request.questions as { name: string, type: number }[];
            if (!r) { return; }
            const canonName = r.name.toLowerCase();  // for 0x20 encoding support
            if (!canonName.endsWith(suffix) && canonName !== baseDomain) { return; }

            if (r.type === Packet.TYPE.A && !canonName.startsWith("_acme-challenge")) {
                response.answers.push({
                    name: r.name,
                    type: Packet.TYPE.CNAME,
                    class: Packet.CLASS.IN,
                    ttl: 120,
                    domain: targetHost
                });
            } else if (r.type === Packet.TYPE.TXT && dnsTextRecords.has(canonName)) {
                response.answers.push({
                    name: r.name,
                    type: Packet.TYPE.TXT,
                    class: Packet.CLASS.IN,
                    ttl: 30,
                    data: dnsTextRecords.get(canonName) ?? ""
                } as DnsAnswer);
            }
            send(response);
        }
    });
    dnsServer.listen({
        udp: port
    });
    return dnsServer;
}
