import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';
import { v4 as uuidv4 } from 'uuid';

export function activate(context: vscode.ExtensionContext) {
    let userId = context.globalState.get<string>('clipsend.userId');
    if (!userId) {
        // Generate a simple readable UUID fragment or a full UUID
        userId = uuidv4().split('-')[0];
        context.globalState.update('clipsend.userId', userId);
    }

    const sidebarProvider = new SidebarProvider(context.extensionUri, userId);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidebarProvider.viewType,
            sidebarProvider
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('clipsend.start', () => {
            vscode.commands.executeCommand('workbench.view.extension.clipsend-explorer');
        })
    );
}

export function deactivate() {}
