# ClipSend

ClipSend is a secure, one-way clipboard sync system designed to push text and small files into restricted environments (like VDIs) without allowing data to leave the secure environment. 

It consists of two parts:
1. **Go Server (`/server`)**: A lightweight HTTP server that acts as a middleman. It stores pairing requests and data items in-memory (and persists them locally) without relying on any third-party cloud services.
2. **VS Code Extension (`/extension`)**: A sidebar extension that provides a UI to initiate pairing requests, send data, and receive data. 

## Features
- **One-Way Design**: Send text and files from one VS Code instance to another. 
- **Friend Request Pairing**: Peer endpoints must be paired securely via simple IDs before data can be sent.
- **Offline Capable**: The Go server can be run entirely on-prem or on a middle-box. No internet connection to third-party sync services is required.

## Getting Started

### 1. Run the Go Server
1. Navigate to the `server` directory.
2. Run `go run main.go`.
3. The server runs on port `8081` by default.

### 2. Install the VS Code Extension
1. Open the `extension` directory in VS Code.
2. Run `npm install` to install dependencies.
3. Run `npm run compile` to build the extension.
4. Press `F5` to launch a new VS Code Extension Development Host with the extension installed, or package the extension using `vsce package` and install it manually via the `.vsix` file.

### 3. Usage
1. Open the **ClipSend** view from the VS Code sidebar.
2. The UI will automatically generate a unique **My ID** for your VS Code instance.
3. **Pairing**: Enter the ID of a destination instance into the "Enter Destination ID" box and click "Send Pair Request". On the destination instance, switch to the "Receive" tab and click "Accept".
4. **Sending Data**: Select your paired peer from the dropdown, paste text (or select a file), and click Send.
5. **Receiving Data**: Switch to the "Receive" tab. The incoming text or file will appear. Click "Insert / Copy" to inject text directly into your active editor or copy it to your clipboard. For files, click "Download" to save them directly to a `.one-way-downloads` folder in your active workspace.
