import { AcmeCertInfo } from "../shared/models";
import { formatDuration } from "../shared/util";
import { Version } from "../version";
import { apiCreateOrUpdateClient, apiDeleteClient, apiGetClients, apiGetServerInfo } from "./api";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CV, render, StateFunc } from "./cervelat";
import { initialState, RenderState } from "./state";

let S: StateFunc<RenderState>;

(window as unknown as { _startUi: () => Promise<void> })["_startUi"] = async function () {
    try {
        console.info("Starting UI");
        S = render(document.getElementById("root")!, MainPanel, initialState);
    }
    catch (err) {
        console.error("Failed to start UI components", err);
    }
    updateInfoAndClients();
}

async function updateInfoAndClients() {
    const [clientResult, infoResult] = await Promise.all([apiGetClients(), apiGetServerInfo()]);
    S(cur => { cur.clients = clientResult.clients; cur.serverInfo = infoResult });
}

export const MainPanel = ({ clients, serverInfo, alert }: RenderState) => {
    return <div>
        <div className="top-bar">
            <img className="logo" src="./favicon.svg" width="32" height="32" />
            <h4 class="title">DER TUNNEL</h4>
            <div className="ver-label">v{Version}</div>
        </div>
        <div className="content">
            <div className="panel">
                <ServerInfoPanel serverInfo={serverInfo} />
            </div>
            <div className="panel">
                <ClientsPanel clients={clients} />
            </div>
            <div className="panel">
                <Alert alert={alert} />
            </div>
        </div>
    </div>;
}

export const ServerInfoPanel = ({ serverInfo }: Pick<RenderState, "serverInfo">) => {
    return <div>
        <h2>Server Info</h2>
        {serverInfo ?
            <table className="server-info">
                <tbody>
                    <tr><td>Domain:</td><td>{serverInfo.baseDomain}</td></tr>
                    <tr><td>ACME:</td><td>{serverInfo.enableAcme ? "enabled" : "disabled"}</td></tr>
                    <tr><td>DNS:</td><td>{serverInfo.enableDns ? "enabled" : "disabled"}</td></tr>
                    <tr><td>Memory:</td><td>{MiB(serverInfo.usedHeap)}/{MiB(serverInfo.totalHeap)}MiB used/total heap</td></tr>
                    <tr><td>Uptime:</td><td>{formatDuration(serverInfo.uptime)}</td></tr>
                    <tr><td>Certificate:</td><td>{serverInfo.certificateInfo ? formatCertInfo(serverInfo.certificateInfo) : "n/a"}</td></tr>
                </tbody>
            </table> : null
        }
    </div>
}

export const ClientsPanel = ({ clients }: Pick<RenderState, "clients">) => {
    return <div>
        <h2>Clients</h2>
        <table className="client-table">
            <thead>
                <td><strong>User</strong></td>
                <td><strong>Endpoints</strong></td><td></td>
            </thead>
            <tbody> {clients.map((client) => {
                return <tr>
                    <td>{client.name}</td>
                    <td>{client.endpoints.length > 0 ? client.endpoints.map(ep => {
                        return <div>{ep.name} ({ep.activeConnections.toString()})&nbsp;
                            <span class="arrow">↓</span>{MiB(ep.bytesSent)} MiB <span class="arrow">↑</span>{MiB(ep.bytesReceived)} MiB<br />
                        </div>;
                    }) : <span><em>None</em></span>}
                    </td>
                    <td>
                        <button className="btn btn-sm"
                            onClick={() => {
                                apiCreateOrUpdateClient(client.name).then(result => {
                                    showAlert(`Created a new token for user ${result.user}:`, result.token);
                                });
                            }}>
                            New Token
                        </button>
                        &nbsp;
                        <button className="btn btn-sm btn-primary"
                            onClick={() => {
                                apiDeleteClient(client.name).then(result => {
                                    updateInfoAndClients();
                                    showAlert(`User ${result.user} has been DELETED`);
                                });
                            }}>
                            Delete
                        </button>
                    </td>
                </tr>
            })}
                <tr>
                    <td><input id="input-new-user" type="text" placeholder="Create New User"></input></td>
                    <td>
                        <button className="btn btn-primary"
                            onClick={() => {
                                const value = (document.getElementById("input-new-user") as HTMLInputElement).value.trim();
                                value && apiCreateOrUpdateClient(value).then(result => {
                                    updateInfoAndClients();
                                    showAlert(`Created new user ${result.user} with token:`, result.token);
                                });
                            }}>
                            Create
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
}

function showAlert(message: string, token: string = "") {
    S(cur => {
        cur.alert.visible = true;
        cur.alert.text = message;
        cur.alert.tokenText = token;
    })
}

export const Alert = ({ alert }: Pick<RenderState, "alert">) => {
    return alert.visible ? <div className="alert">
        <div>
            <span>{alert.text}</span>
            <strong><span>{alert.tokenText}</span></strong>
        </div>
        <div>
            <a href="" onClick={(evt: Event) => { evt.preventDefault(); S(cur => { cur.alert.visible = false }); }}>
                Dismiss
            </a>
        </div>
    </div > : null;
}

function MiB(bytes: number) { return `${(bytes / (1024 * 1024)).toFixed(1)}` }

function formatCertInfo(certificateInfo: AcmeCertInfo) {
    return certificateInfo.valid ?
        `valid to ${new Date(certificateInfo.expires!).toLocaleString()}, issued by: ${certificateInfo.issuer}` :
        `invalid - error: ${certificateInfo.error}`;
}
