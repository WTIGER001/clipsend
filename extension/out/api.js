"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClipSendApi = void 0;
const vscode = require("vscode");
class ClipSendApi {
    getServerUrl() {
        const config = vscode.workspace.getConfiguration('clipsend');
        return config.get('serverUrl') || 'http://localhost:8081';
    }
    async pairRequest(senderId, receiverId) {
        const res = await fetch(`${this.getServerUrl()}/pair/request`, {
            method: 'POST',
            body: JSON.stringify({ sender_id: senderId, receiver_id: receiverId })
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to request pairing: ${res.status} ${errText}`);
        }
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }
    async pairPending(receiverId) {
        const res = await fetch(`${this.getServerUrl()}/pair/pending?receiver_id=${receiverId}`);
        if (!res.ok)
            return [];
        return res.json();
    }
    async pairAccepted(userId) {
        const res = await fetch(`${this.getServerUrl()}/pair/accepted?user_id=${userId}`);
        if (!res.ok)
            return [];
        return res.json();
    }
    async pairAccept(id) {
        await fetch(`${this.getServerUrl()}/pair/accept`, {
            method: 'POST',
            body: JSON.stringify({ id })
        });
    }
    async pairReject(id) {
        await fetch(`${this.getServerUrl()}/pair/reject`, {
            method: 'POST',
            body: JSON.stringify({ id })
        });
    }
    async sendText(senderId, receiverId, text) {
        const formData = new FormData();
        formData.append('sender_id', senderId);
        formData.append('receiver_id', receiverId);
        formData.append('type', 'text');
        formData.append('text_content', text);
        const res = await fetch(`${this.getServerUrl()}/data/send`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok)
            throw new Error('Failed to send text');
    }
    async sendFile(senderId, receiverId, filePath, fileName) {
        const fs = require('fs');
        const blob = new Blob([fs.readFileSync(filePath)]);
        const formData = new FormData();
        formData.append('sender_id', senderId);
        formData.append('receiver_id', receiverId);
        formData.append('type', 'file');
        formData.append('file', blob, fileName);
        const res = await fetch(`${this.getServerUrl()}/data/send`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok)
            throw new Error('Failed to send file');
    }
    async dataList(receiverId) {
        const res = await fetch(`${this.getServerUrl()}/data/list?receiver_id=${receiverId}`);
        if (!res.ok)
            return [];
        return res.json();
    }
    async dataAck(id) {
        await fetch(`${this.getServerUrl()}/data/ack`, {
            method: 'POST',
            body: JSON.stringify({ id })
        });
    }
    async downloadFile(id, destination) {
        const res = await fetch(`${this.getServerUrl()}/data/download?id=${id}`);
        if (!res.ok)
            throw new Error('Failed to download file');
        const buffer = await res.arrayBuffer();
        const fs = require('fs');
        fs.writeFileSync(destination, Buffer.from(buffer));
    }
}
exports.ClipSendApi = ClipSendApi;
//# sourceMappingURL=api.js.map