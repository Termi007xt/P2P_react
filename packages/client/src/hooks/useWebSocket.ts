import { useCallback, useEffect, useRef, useState } from "react";
import type { Role, ServerMessage } from "../types";
import { getWsUrl } from "../lib/constants";

type MessageHandler = (msg: ServerMessage) => void;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());

  /** Connect and return a promise that resolves when the WebSocket is open */
  const connect = useCallback((): Promise<void> => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        resolve();
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
      };

      ws.onerror = () => {
        reject(new Error("WebSocket connection failed"));
        ws.close();
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as ServerMessage;
          handlersRef.current.forEach((h) => h(msg));
        } catch {
          // ignore non-JSON
        }
      };
    });
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const joinRoom = useCallback(
    (roomCode: string, role: Role) => {
      send({ type: "join-room", roomCode, role });
    },
    [send]
  );

  const sendSignal = useCallback(
    (roomCode: string, targetRole: Role, payload: unknown) => {
      send({ type: "signal", roomCode, targetRole, payload });
    },
    [send]
  );

  const onMessage = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return { connected, connect, disconnect, joinRoom, sendSignal, onMessage, send };
}
