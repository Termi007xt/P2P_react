# P2P Zip Transfer

Fast peer-to-peer `.zip` file transfer between two browsers using WebRTC. No accounts, no uploads, no server-side storage — files go directly from sender to receiver.

## What It Does

1. **Sender** creates a room and gets a shareable code/link
2. **Receiver** joins using the code or link
3. Sender selects a `.zip` file and initiates transfer
4. File transfers directly between browsers via WebRTC `RTCDataChannel`
5. Receiver downloads the completed file

## Stack

| Layer     | Technology                      |
| --------- | ------------------------------- |
| Frontend  | React + Vite + TypeScript + Tailwind CSS |
| Backend   | Node.js + Express + ws          |
| Signaling | WebSocket (JSON protocol)       |
| Transfer  | WebRTC RTCDataChannel           |
| Storage   | In-memory `Map` only            |
| Monorepo  | npm workspaces                  |

## Local Setup

```bash
# 1. Install all dependencies (workspaces)
npm install

# 2. Start both client and server in dev mode
npm run dev
```

- Client runs on Vite default port (usually `http://localhost:5173`)
- Server runs on `http://localhost:8787`
- Vite proxies `/api/*` and `/ws` to the server automatically

## Production Build

```bash
# Build both client and server
npm run build

# Start the production server (serves client static files + API)
npm run start
```

The server serves the built frontend from `packages/client/dist` and exposes the same `/api` and `/ws` endpoints.

## How Rooms Work

- `POST /api/rooms` creates a new room with a short code (6-char nanoid)
- Room state is stored in a `Map` in server memory — no database
- Each room holds at most 1 sender and 1 receiver
- Stale rooms (>30 min old with no sockets) are cleaned up every 10 minutes
- When the sender disconnects, the room is deleted

## How Signaling Works

1. Both peers connect via WebSocket to `/ws`
2. They send `join-room` messages identifying their role
3. When both peers are present, the server sends `peer-ready` to both
4. Sender creates an `RTCPeerConnection` + `RTCDataChannel`, generates an SDP offer
5. Offer is relayed via WebSocket → receiver creates answer → relayed back
6. ICE candidates are exchanged through the same relay
7. Once connected, file data flows directly between browsers — the server is out of the loop

## File Transfer Protocol

1. Sender sends JSON metadata: `{ type: "file-meta", fileName, fileSize, mimeType, chunkSize, totalChunks }`
2. Binary chunks (64 KB each) are sent sequentially over the data channel
3. Backpressure: sender monitors `bufferedAmount` and pauses when buffer exceeds 512 KB
4. Final message: `{ type: "file-complete" }`
5. Receiver assembles chunks into a `Blob` and offers download

## Why No Database

This is an MVP for ephemeral transfers. Rooms exist only while sockets are connected. There's nothing to persist — no user data, no file data, no session history.

## Known Limitations

- **Only `.zip` files** — file type is restricted on sender side
- **Only 1 sender + 1 receiver** per room — no multi-user support
- **No pause/resume** — if the connection drops, transfer must restart
- **No TURN server** — only STUN (`stun:stun.l.google.com:19302`), so transfers may fail on restrictive NATs/firewalls
- **Receiver holds file in memory** — large files may cause browser memory issues
- **No persistence** — refresh = lose everything
- **No encryption beyond WebRTC's built-in DTLS** — no additional E2E encryption layer
