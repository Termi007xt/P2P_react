import { WebSocket } from "ws";
import { getRoom, deleteRoom, type Room } from "./rooms.js";

type Role = "sender" | "receiver";

interface JoinRoomMsg {
  type: "join-room";
  roomCode: string;
  role: Role;
}

interface SignalMsg {
  type: "signal";
  roomCode: string;
  targetRole: Role;
  payload: unknown;
}

interface LeaveRoomMsg {
  type: "leave-room";
  roomCode: string;
  role: Role;
}

type ClientMessage = JoinRoomMsg | SignalMsg | LeaveRoomMsg;

/** Map a socket to its current room/role so we can clean up on disconnect */
const socketMeta = new WeakMap<WebSocket, { roomCode: string; role: Role }>();

function send(ws: WebSocket, data: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: "error", message });
}

function handleJoinRoom(ws: WebSocket, msg: JoinRoomMsg): void {
  const { roomCode, role } = msg;
  const room = getRoom(roomCode);

  if (!room) {
    sendError(ws, `Room "${roomCode}" does not exist.`);
    return;
  }

  if (role === "sender") {
    if (room.sender) {
      sendError(ws, "Room already has a sender.");
      return;
    }
    room.sender = ws;
  } else if (role === "receiver") {
    if (room.receiver) {
      sendError(ws, "Room is full — a receiver is already connected.");
      return;
    }
    room.receiver = ws;
  } else {
    sendError(ws, `Invalid role "${role}".`);
    return;
  }

  socketMeta.set(ws, { roomCode, role });
  send(ws, { type: "room-joined", roomCode, role });

  // If both peers are now present, notify them
  if (room.sender && room.receiver) {
    room.status = "paired";
    send(room.sender, { type: "peer-ready", roomCode });
    send(room.receiver, { type: "peer-ready", roomCode });
  }
}

function handleSignal(ws: WebSocket, msg: SignalMsg): void {
  const { roomCode, targetRole, payload } = msg;
  const room = getRoom(roomCode);

  if (!room) {
    sendError(ws, `Room "${roomCode}" does not exist.`);
    return;
  }

  const target = targetRole === "sender" ? room.sender : room.receiver;
  if (!target) {
    sendError(ws, `Target peer (${targetRole}) is not connected.`);
    return;
  }

  send(target, { type: "signal", payload });
}

function handleLeaveRoom(_ws: WebSocket, msg: LeaveRoomMsg): void {
  const { roomCode, role } = msg;
  const room = getRoom(roomCode);
  if (!room) return;

  cleanupPeerFromRoom(room, role);
}

function cleanupPeerFromRoom(room: Room, role: Role): void {
  if (role === "sender") {
    room.sender = null;
    // Sender leaving kills the room — notify receiver, then delete
    if (room.receiver) {
      send(room.receiver, { type: "peer-left", roomCode: room.roomCode, role: "sender" });
    }
    deleteRoom(room.roomCode);
    console.log(`[ws] sender left, room ${room.roomCode} deleted`);
  } else {
    room.receiver = null;
    room.status = "waiting";
    if (room.sender) {
      send(room.sender, { type: "peer-left", roomCode: room.roomCode, role: "receiver" });
    }
    console.log(`[ws] receiver left room ${room.roomCode}`);
  }
}

export function handleConnection(ws: WebSocket): void {
  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      sendError(ws, "Invalid JSON message.");
      return;
    }

    switch (msg.type) {
      case "join-room":
        handleJoinRoom(ws, msg);
        break;
      case "signal":
        handleSignal(ws, msg);
        break;
      case "leave-room":
        handleLeaveRoom(ws, msg);
        break;
      default:
        sendError(ws, `Unknown message type "${(msg as { type: string }).type}".`);
    }
  });

  ws.on("close", () => {
    const meta = socketMeta.get(ws);
    if (!meta) return;
    const room = getRoom(meta.roomCode);
    if (room) {
      cleanupPeerFromRoom(room, meta.role);
    }
    socketMeta.delete(ws);
  });
}
