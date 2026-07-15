"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const SidebarProvider_1 = require("./SidebarProvider");
const uuid_1 = require("uuid");
function activate(context) {
    let userId = context.globalState.get('clipsend.userId');
    if (!userId) {
        // Generate a simple readable UUID fragment or a full UUID
        userId = (0, uuid_1.v4)().split('-')[0];
        context.globalState.update('clipsend.userId', userId);
    }
    const sidebarProvider = new SidebarProvider_1.SidebarProvider(context.extensionUri, userId);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(SidebarProvider_1.SidebarProvider.viewType, sidebarProvider));
    context.subscriptions.push(vscode.commands.registerCommand('clipsend.start', () => {
        vscode.commands.executeCommand('workbench.view.extension.clipsend-explorer');
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map