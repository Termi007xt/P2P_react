import { WebSocket } from "ws";

export interface Room {
  roomCode: string;
  sender: WebSocket | null;
  receiver: WebSocket | null;
  createdAt: number;
  status: "waiting" | "paired" | "transferring";
}

/** In-memory room store */
const rooms = new Map<string, Room>();

export function createRoom(roomCode: string): Room {
  const room: Room = {
    roomCode,
    sender: null,
    receiver: null,
    createdAt: Date.now(),
    status: "waiting",
  };
  rooms.set(roomCode, room);
  return room;
}

export function getRoom(roomCode: string): Room | undefined {
  return rooms.get(roomCode);
}

export function deleteRoom(roomCode: string): void {
  rooms.delete(roomCode);
}

export function getRooms(): Map<string, Room> {
  return rooms;
}

/**
 * Clean up stale rooms older than maxAge (ms) with no connected sockets.
 * Runs every `interval` ms.
 */
export function startRoomCleanup(intervalMs = 10 * 60 * 1000, maxAgeMs = 30 * 60 * 1000): void {
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const age = now - room.createdAt;
      if (age > maxAgeMs && !room.sender && !room.receiver) {
        rooms.delete(code);
        console.log(`[cleanup] removed stale room ${code}`);
      }
    }
  }, intervalMs);
}
