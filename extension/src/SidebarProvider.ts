import * as vscode from 'vscode';
import { ClipSendApi } from './api';
import * as path from 'path';
import * as fs from 'fs';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'clipsend.panel';
    private _view?: vscode.WebviewView;
    private api: ClipSendApi;
    private userId: string;
    private lastDataItems: any[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        userId: string
    ) {
        this.api = new ClipSendApi();
        this.userId = userId;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            try {
                switch (data.type) {
                    case 'requestPair':
                        await this.api.pairRequest(this.userId, data.value);
                        vscode.window.showInformationMessage('Pairing request sent!');
                        await this.refreshState();
                        break;
                    case 'acceptPair':
                        await this.api.pairAccept(data.value);
                        vscode.window.showInformationMessage('Pairing request accepted!');
                        await this.refreshState();
                        break;
                    case 'rejectPair':
                        await this.api.pairReject(data.value);
                        await this.refreshState();
                        break;
                    case 'deletePair':
                        await this.api.pairReject(data.value);
                        vscode.window.showInformationMessage('Pairing deleted.');
                        await this.refreshState();
                        break;
                    case 'sendText':
                        await this.api.sendText(this.userId, data.receiverId, data.value);
                        vscode.window.showInformationMessage('Text sent successfully!');
                        break;
                    case 'sendFile':
                        // data.filePath, data.fileName
                        await this.api.sendFile(this.userId, data.receiverId, data.filePath, data.fileName);
                        vscode.window.showInformationMessage('File sent successfully!');
                        break;
                    case 'refreshState':
                        await this.refreshState();
                        break;
                    case 'ackData':
                        await this.api.dataAck(data.value);
                        await this.refreshState();
                        break;
                    case 'insertText':
                        const dataItem = this.lastDataItems.find(i => i.id === data.id);
                        if (!dataItem) {
                            vscode.window.showErrorMessage('Data item not found in memory.');
                            break;
                        }
                        const textContent = dataItem.content;
                        
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            editor.edit(editBuilder => {
                                editBuilder.insert(editor.selection.active, textContent);
                            });
                        } else {
                            vscode.env.clipboard.writeText(textContent);
                            vscode.window.showInformationMessage('Text copied to clipboard (no active editor).');
                        }
                        await this.api.dataAck(data.id);
                        await this.refreshState();
                        break;
                    case 'downloadFile':
                        await this.handleDownloadFile(data.id, data.filename);
                        await this.api.dataAck(data.id);
                        await this.refreshState();
                        vscode.window.showInformationMessage(`Downloaded ${data.filename}`);
                        break;
                    case 'selectFile':
                        const uris = await vscode.window.showOpenDialog({ canSelectMany: false });
                        if (uris && uris.length > 0) {
                            webviewView.webview.postMessage({ type: 'fileSelected', path: uris[0].fsPath, name: path.basename(uris[0].fsPath) });
                        }
                        break;
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`ClipSend Error: ${err.message}`);
            }
        });

        // Initial fetch
        this.refreshState();
        
        // Polling
        setInterval(() => this.refreshState(), 5000);
    }

    private async handleDownloadFile(id: string, filename: string) {
        const config = vscode.workspace.getConfiguration('clipsend');
        const downloadFolder = config.get<string>('downloadFolder') || 'one-way-downloads';
        
        let workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace open to save the file.');
            return;
        }

        const targetDir = path.join(workspaceFolder, downloadFolder);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetPath = path.join(targetDir, filename);
        await this.api.downloadFile(id, targetPath);
    }

    private async refreshState() {
        if (!this._view) return;
        try {
            const pending = await this.api.pairPending(this.userId);
            const accepted = await this.api.pairAccepted(this.userId);
            const dataItems = await this.api.dataList(this.userId);
            this.lastDataItems = dataItems || [];
            
            this._view.webview.postMessage({
                type: 'updateState',
                pending,
                accepted,
                dataItems,
                userId: this.userId
            });
        } catch (err) {
            console.error(err);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ClipSend</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
                .panel { display: none; }
                .panel.active { display: block; }
                .tabs { display: flex; margin-bottom: 15px; border-bottom: 1px solid var(--vscode-panel-border); }
                .tab { cursor: pointer; padding: 5px 10px; border-bottom: 2px solid transparent; }
                .tab.active { border-bottom-color: var(--vscode-button-background); font-weight: bold; }
                input, select, textarea { width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 5px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
                button { width: 100%; padding: 5px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; margin-bottom: 5px; }
                button:hover { background: var(--vscode-button-hoverBackground); }
                .item-card { border: 1px solid var(--vscode-panel-border); padding: 10px; margin-bottom: 10px; }
                hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 15px 0; }
                .action-btn { background: transparent; color: var(--vscode-button-background); border: 1px solid var(--vscode-button-background); }
            </style>
        </head>
        <body>
            <h3>My ID: <span id="my-id"></span></h3>
            
            <div class="tabs">
                <div class="tab active" onclick="switchTab('send')">Send</div>
                <div class="tab" onclick="switchTab('receive')">Receive</div>
            </div>

            <!-- SEND PANEL -->
            <div id="send-panel" class="panel active">
                <h4>Pairing</h4>
                <input type="text" id="target-id" placeholder="Enter Destination ID">
                <button onclick="requestPair()">Send Pair Request</button>
                
                <hr>
                
                <h4>Send Data</h4>
                <select id="peer-select">
                    <option value="">Select a paired peer...</option>
                </select>
                
                <textarea id="text-input" rows="4" placeholder="Paste text here..."></textarea>
                <button onclick="sendText()">Send Text</button>
                
                <p>OR</p>
                <input type="hidden" id="selected-file-path">
                <input type="hidden" id="selected-file-name">
                <div id="file-label" style="margin-bottom:10px; font-style:italic;">No file selected</div>
                <button onclick="selectFile()">Select File</button>
                <button onclick="sendFile()" style="margin-top:5px;">Send File</button>
            </div>

            <!-- RECEIVE PANEL -->
            <div id="receive-panel" class="panel">
                <h4>Pending Pair Requests</h4>
                <div id="pending-list"></div>
                
                <hr>
                
                <h4>Available Data</h4>
                <div id="data-list"></div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let myId = '';
                
                function switchTab(tab) {
                    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.getElementById(tab + '-panel').classList.add('active');
                    event.target.classList.add('active');
                }

                function requestPair() {
                    const val = document.getElementById('target-id').value;
                    if(val) vscode.postMessage({ type: 'requestPair', value: val });
                }

                function acceptPair(id) {
                    vscode.postMessage({ type: 'acceptPair', value: id });
                }

                function rejectPair(id) {
                    vscode.postMessage({ type: 'rejectPair', value: id });
                }

                function sendText() {
                    const text = document.getElementById('text-input').value;
                    const peer = document.getElementById('peer-select').value;
                    if(text && peer) {
                        vscode.postMessage({ type: 'sendText', receiverId: peer, value: text });
                        document.getElementById('text-input').value = '';
                    }
                }

                function selectFile() {
                    vscode.postMessage({ type: 'selectFile' });
                }

                function sendFile() {
                    const peer = document.getElementById('peer-select').value;
                    const fpath = document.getElementById('selected-file-path').value;
                    const fname = document.getElementById('selected-file-name').value;
                    if(peer && fpath) {
                        vscode.postMessage({ type: 'sendFile', receiverId: peer, filePath: fpath, fileName: fname });
                        document.getElementById('selected-file-path').value = '';
                        document.getElementById('selected-file-name').value = '';
                        document.getElementById('file-label').innerText = 'No file selected';
                    }
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'fileSelected') {
                        document.getElementById('selected-file-path').value = message.path;
                        document.getElementById('selected-file-name').value = message.name;
                        document.getElementById('file-label').innerText = 'Selected: ' + message.name;
                    }
                    if (message.type === 'updateState') {
                        myId = message.userId;
                        document.getElementById('my-id').innerText = myId;
                        
                        // Update pending requests
                        const pendingDiv = document.getElementById('pending-list');
                        pendingDiv.innerHTML = '';
                        const pendingList = message.pending || [];
                        if(pendingList.length === 0) pendingDiv.innerHTML = '<i>No pending requests</i>';
                        pendingList.forEach(p => {
                            pendingDiv.innerHTML += \`
                                <div class="item-card">
                                    From: \${p.sender_id}<br>
                                    <button class="action-btn" onclick="acceptPair('\${p.id}')">Accept</button>
                                    <button class="action-btn" style="color:red;border-color:red" onclick="rejectPair('\${p.id}')">Reject</button>
                                </div>
                            \`;
                        });

                        // Update peers dropdown
                        const peerSelect = document.getElementById('peer-select');
                        const currentVal = peerSelect.value;
                        
                        if (!message.accepted || message.accepted.length === 0) {
                            peerSelect.innerHTML = '<option value="">Select a paired peer... (Debug: 0 accepted pairings from server)</option>';
                        } else {
                            peerSelect.innerHTML = '<option value="">Select a paired peer... (Debug: ' + message.accepted.length + ' pairings found)</option>';
                        }
                        
                        // Keep track of unique peers to avoid duplicates if paired both ways
                        const addedPeers = new Set();
                        
                        if (message.accepted && message.accepted.length > 0) {
                            message.accepted.forEach(p => {
                                const peerId = (p.sender_id === myId) ? p.receiver_id : p.sender_id;
                                if (!addedPeers.has(peerId)) {
                                    addedPeers.add(peerId);
                                    const option = document.createElement('option');
                                    option.value = peerId;
                                    option.text = peerId + " (Added)";
                                    peerSelect.appendChild(option);
                                }
                            });
                        }
                        
                        if (currentVal && addedPeers.has(currentVal)) {
                            peerSelect.value = currentVal;
                        } else if (addedPeers.size === 1) {
                            // Auto-select the only available peer for convenience
                            peerSelect.selectedIndex = 1;
                        } else {
                            peerSelect.value = "";
                        }

                        // Update data items
                        const dataDiv = document.getElementById('data-list');
                        dataDiv.innerHTML = '';
                        const itemsList = message.dataItems || [];
                        if(itemsList.length === 0) dataDiv.innerHTML = '<i>No data waiting</i>';
                        itemsList.forEach(d => {
                            if (d.type === 'text') {
                                dataDiv.innerHTML += \`
                                    <div class="item-card">
                                        <b>Text from \${d.sender_id}</b>
                                        <p style="background:var(--vscode-editor-background);padding:5px;max-height:100px;overflow-y:auto;">\${d.content}</p>
                                        <button class="action-btn" onclick="vscode.postMessage({type:'insertText', id:'\${d.id}'})">Insert / Copy</button>
                                        <button class="action-btn" style="color:red;border-color:red" onclick="vscode.postMessage({type:'ackData', value:'\${d.id}'})">Dismiss</button>
                                    </div>
                                \`;
                            } else if (d.type === 'file') {
                                dataDiv.innerHTML += \`
                                    <div class="item-card">
                                        <b>File from \${d.sender_id}</b>
                                        <p>\${d.content}</p>
                                        <button class="action-btn" onclick="vscode.postMessage({type:'downloadFile', id:'\${d.id}', filename:'\${d.content}'})">Download</button>
                                        <button class="action-btn" style="color:red;border-color:red" onclick="vscode.postMessage({type:'ackData', value:'\${d.id}'})">Dismiss</button>
                                    </div>
                                \`;
                            }
                        });
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
