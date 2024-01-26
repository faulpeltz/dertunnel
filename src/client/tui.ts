import chalk from "chalk";
import { formatNumber, Throttled } from "../shared/util";
import { Version } from "../version";
import { ClientEndpointStats } from "./client";
import { ProtocolData } from "./protocols";

export type UIState = {
    headerLines: string[];
    statusLines: string[];
    inspectedRequests: (ProtocolData & { cid: string })[];
    logLines: string[];
}

export const uiState: UIState = {
    headerLines: [`/__\\ DERTUNNEL v${Version} /__\\`, ""],
    logLines: [],
    inspectedRequests: [],
    statusLines: []
};

export function renderUI() {
    const o = process.stdout;
    const [W, H] = o.getWindowSize();

    if (uiState.inspectedRequests.length > H - 15) {
        const idx = uiState.inspectedRequests.findIndex(r => r.type === "http-response-body" || r.type === "http-response-header");
        uiState.inspectedRequests.splice(idx >= 0 ? idx : 0, 1);
    }

    const inspectLines = uiState.inspectedRequests.map(pd => {
        let status: string;
        if (pd.status === 0) {
            status = "...";
        } else if (pd.status < 400) {
            status = chalk.blue(pd.status);
        } else if (pd.status < 500) {
            status = chalk.yellow(pd.status);
        } else {
            status = chalk.redBright(pd.status);
        }

        const now = new Date(pd.startAt!).toISOString();
        const timeField = pd.endAt ? `${pd.endAt - pd.startAt!}ms` : "";
        const tsField = now.slice(0, 10) + " " + now.slice(11, 19);
        const contentType = pd.headers.find(h => h.name === "content-type")?.value ?? "(none)";
        const typeField = contentType.split(";")[0];
        const pathField = pd.path.slice(0, Math.min(W - 45 - (contentType ? contentType.length : 2), pd.path.length));
        const contentInfoField = chalk.white(pd.content ? " " + formatNumber(pd.content.length) + "b " : "");

        return `${chalk.cyan(`${tsField} -`)} ${status} ${chalk.green(pd.method)} ${chalk.white(pathField)}` +
            `  ${pd.content ? chalk.gray(typeField) : ""} ${contentInfoField} ${chalk.cyanBright(timeField)}`;
    });

    while (uiState.headerLines.length +
        uiState.statusLines.length +
        inspectLines.length +
        uiState.logLines.length + 2 > H &&
        uiState.logLines.length > 2) {
        uiState.logLines.splice(0, 1);
    }

    const lines = [
        ...uiState.headerLines,
        "",
        ...uiState.statusLines,
        ...inspectLines,
        "",
        ...uiState.logLines,
    ];

    o.cursorTo(0, 0);
    o.clearScreenDown();
    lines.forEach(l => {
        o.write(l ?? "");
        o.write("\n");
    });
}

export function logHeader(line: string, idx?: number) {
    if (process.stdout.isTTY) {
        if (idx !== undefined) {
            uiState.headerLines[idx] = line;
        } else {
            uiState.headerLines.push(line);
        }
        renderUI();
    } else {
        console.log(line);
    }
}

export function log(line: string) {
    if (process.stdout.isTTY) {
        uiState.logLines.push(line);
        if (uiState.logLines.length > 20) {
            uiState.logLines.splice(0, 1);
        }
        renderUI();
    } else {
        console.log(line);
    }
}

const protocolDataUpdater = new Throttled(200, () => renderUI());

// track request/response state and update
export function updateProtocolDataState(type: string, cid: string, data: ProtocolData) {
    if (type === "http-request-header") {
        const cur = uiState.inspectedRequests.find(r => r.cid === cid);
        if (cur) { cur.cid = ""; }
        uiState.inspectedRequests.push({ cid, ...data });
    } else {
        const ridx = uiState.inspectedRequests.findIndex(r => r.cid === cid);
        if (ridx >= 0) {
            const prev = uiState.inspectedRequests[ridx]!;
            uiState.inspectedRequests[ridx] = {
                id: prev.id,
                cid: prev.cid,
                type: data.type,
                headers: data.headers,
                method: data.method || prev.method,
                path: data.path || prev.path,
                status: data.status || prev.status,
                statusText: data.statusText || prev.statusText,
                content: data.content ?? prev.content,
                startAt: data.startAt || prev.startAt,
                endAt: data.endAt
            };
        }
    }

    protocolDataUpdater.update(undefined);
}

export function formatStatusLines(s: ClientEndpointStats): string[] {
    return [
        `STATS | SENT   chunks         bytes  | RECV   chunks         bytes  | CONN   active   total   errors |`,
        `      |${formatNumber(s.chunksSent).padStart(14)}${formatNumber(s.bytesSent).padStart(14)}  |` +
        `${formatNumber(s.chunksReceived).padStart(14)}${formatNumber(s.bytesReceived).padStart(14)}  |` +
        `${formatNumber(s.currentConnections).padStart(14)}${formatNumber(s.totalConnections).padStart(8)}` +
        `${formatNumber(s.connectionErrors).padStart(9)} |`,
        ""
    ];
}
