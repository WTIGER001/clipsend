# ClipSend Development Rules

## Architecture Overview
- **Go Server (`server/`)**: A lightweight HTTP API running on port `8081`. Uses an in-memory struct backed by a local JSON file (`clipsend_db.json`) to persist state across restarts. Must NOT require external database installations.
- **VS Code Extension (`extension/`)**: Built with TypeScript. Utilizes Webviews for the UI (Send/Receive panels) and relies on polling for updates to prevent complex WebSocket setups.

## Design Constraints
- **One-Way Principle**: Data should flow *into* the secure environment. Do not introduce features that would allow bi-directional syncing or background exfiltration of the workspace.
- **Local Network Only**: Do not introduce third-party cloud services or external API dependencies. All traffic flows directly to the Go server on the local network or middle-box.

## Development Guidelines
- Always compile the extension using `npm run compile` in the `extension/` directory after making changes to the TypeScript files.
- The Go Server should be restarted (`go run main.go`) after making changes to the Go files to ensure changes take effect. 
- Extension Webview HTML UI logic is contained entirely inside `SidebarProvider.ts`. Take care when editing Javascript strings embedded in Webview HTML to properly escape template literals and quotes.
