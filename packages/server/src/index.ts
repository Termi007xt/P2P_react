import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import { createRoom, getRoom, startRoomCleanup } from "./rooms.js";
import { handleConnection } from "./ws-handler.js";

const PORT = parseInt(process.env.PORT || "8787", 10);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// ── HTTP Routes ──

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/rooms", (_req, res) => {
  const roomCode = nanoid(6).toUpperCase();
  createRoom(roomCode);
  console.log(`[http] room created: ${roomCode}`);
  res.json({ roomCode, role: "sender" });
});

// Validate room existence (used by receiver before WebSocket connect)
app.get("/api/rooms/:code", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({
    roomCode: room.roomCode,
    hasSender: !!room.sender,
    hasReceiver: !!room.receiver,
  });
});

// ── Serve static client build in production ──

const clientDist = path.resolve(__dirname, "../../client/dist");

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));

  // SPA fallback: non-API routes serve index.html
  app.get(/^\/(?!api|health|ws).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  console.log("[server] client/dist not found — skipping static file serving (dev mode)");
}

// ── HTTP + WebSocket Server ──

const server = createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", handleConnection);

// ── Room Cleanup ──

startRoomCleanup();

// ── Start ──

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`);
});
