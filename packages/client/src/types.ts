export type Role = "sender" | "receiver";

export type RtcState =
  | "idle"
  | "waiting"
  | "connecting"
  | "connected"
  | "failed"
  | "disconnected"
  | "completed";

export interface FileMeta {
  type: "file-meta";
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
}

export interface TransferStats {
  progress: number;       // 0–100
  bytesTransferred: number;
  totalBytes: number;
  speed: number;          // bytes per second
  completed: boolean;
}

// WebSocket messages from server
export interface WsRoomJoined {
  type: "room-joined";
  roomCode: string;
  role: Role;
}

export interface WsPeerReady {
  type: "peer-ready";
  roomCode: string;
}

export interface WsSignal {
  type: "signal";
  payload: {
    type: "offer" | "answer" | "ice-candidate";
    sdp?: string;
    candidate?: RTCIceCandidateInit;
  };
}

export interface WsPeerLeft {
  type: "peer-left";
  roomCode: string;
  role: Role;
}

export interface WsError {
  type: "error";
  message: string;
}

export type ServerMessage = WsRoomJoined | WsPeerReady | WsSignal | WsPeerLeft | WsError;
