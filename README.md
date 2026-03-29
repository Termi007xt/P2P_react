# P2P File Transfer

**Production Link**: https://p2p-react.onrender.com

## The Problem

Sending large files over the internet can be a frustrating experience. Traditional file-sharing applications often place strict size limits on your uploads, require you to create an account, or deliberately throttle your transfer speeds unless you pay for a premium subscription. Additionally, these services require you to first upload your file to their centralized servers before the recipient can download it. This two-step process effectively doubles the transfer time and raises data privacy concerns. 

Our application offers a streamlined solution: direct, peer-to-peer file transfers that run as fast as your internet connection allows, completely free of restrictions and arbitrary limits.

## How It Works

This application utilizes a technology known as WebRTC (Web Real-Time Communication). Instead of acting as a middleman that stores your data, our server simply acts as a dispatcher introducing the sender and receiver to each other. Once the initial "handshake" is complete, our server steps out of the way.

The file is then transferred directly from the sender's device to the receiver's device. This approach provides several key benefits:

1. **Uncapped Speeds**: Because your data travels directly to the recipient, the transfer speed is limited only by your own internet bandwidth.
2. **Infinite File Sizes**: Bypassing centralized storage means there are no artificial limits on file sizes. Our implementation streams the data block-by-block, making multi-gigabyte transfers entirely feasible.
3. **Enhanced Privacy**: Your files are never uploaded to any third-party server or saved in a database. The data stays strictly between you and the recipient.
4. **Frictionless Experience**: Start sending files instantly without the need to sign up, log in, or provide personal information.

### The Transfer Process Step-by-Step

1. The sender creates a secure transfer room and is given a unique sharing link.
2. The sender shares this link with the intended recipient.
3. The recipient opens the link and joins the room.
4. The sender selects a `.zip` file from their computer and begins the transfer.
5. A secure, direct peer-to-peer connection is established between both browsers.
6. The file is streamed directly into the recipient's chosen download directory, ensuring high performance.

## Technical Stack

While the user experience is designed for the layman, the underlying implementation relies on modern web architecture:

* **Frontend**: Built with React, TypeScript, and Vite, styled using Tailwind CSS for a clean, responsive interface.
* **Signaling Server**: A Node.js backend utilizing WebSockets to securely relay connection information (SDP offers/answers and ICE candidates) between peers.
* **Transfer Engine**: WebRTC Data Channels are responsible for transmitting raw binary chunks over the peer-to-peer connection.
* **File System Streaming**: The receiver utilizes the modern File System Access API to stream incoming chunks directly to disk, preventing memory bloat and browser crashes during immense file transfers.

## Local Development Setup

To run this project locally, follow these commands:

1. Install project dependencies:
```bash
npm install
```

2. Start the development environment:
```bash
npm run dev
```

The React client will be available at `http://localhost:5173` and the WebSocket server will listen on `http://localhost:8787`.

## Production Build

To prepare the application for a production environment:

1. Build both the client and server codeframes:
```bash
npm run build
```

2. Start the consolidated production server:
```bash
npm run start
```

The Node.js server will serve the optimized frontend build directly from the `packages/client/dist` directory while maintaining the active WebSocket endpoints.
