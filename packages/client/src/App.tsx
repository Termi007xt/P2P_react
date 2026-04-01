import { useState, useCallback, useEffect, useRef } from "react";
import type { Role, RtcState, ServerMessage } from "./types";
import { getShareLink } from "./lib/constants";
import { useWebSocket } from "./hooks/useWebSocket";
import { useWebRTC } from "./hooks/useWebRTC";
import { useFileTransfer } from "./hooks/useFileTransfer";
import { HomeScreen } from "./components/HomeScreen";
import { SenderPanel } from "./components/SenderPanel";
import { ReceiverPanel } from "./components/ReceiverPanel";

function parseUrlParams(): { room: string; role: Role | null } {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room") || "";
  const rawRole = params.get("role");
  const role = rawRole === "sender" || rawRole === "receiver" ? rawRole : null;
  return { room, role };
}

export default function App() {
  const { room: urlRoom, role: urlRole } = parseUrlParams();

  const [role, setRole] = useState<Role | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [peerPresent, setPeerPresent] = useState(false);
  const [rtcState, setRtcState] = useState<RtcState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inRoom, setInRoom] = useState(false);

  // Track whether we've already auto-joined from URL params
  const autoJoinedRef = useRef(false);

  const ws = useWebSocket();
  const transfer = useFileTransfer();

  // Data channel ref for file transfer access
  const activeDcRef = useRef<RTCDataChannel | null>(null);
  
  // Current role ref so callbacks always see the latest value
  const roleRef = useRef<Role | null>(null);
  roleRef.current = role;

  const handleDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      activeDcRef.current = dc;

      dc.onopen = () => {
        setRtcState("connected");
      };

      dc.onclose = () => {
        activeDcRef.current = null;
      };

      dc.onerror = () => {
        setRtcState("failed");
      };

      // If receiver, set up receive handlers
      if (roleRef.current === "receiver") {
        transfer.setupReceiver(dc);
      }
    },
    [transfer]
  );

  const rtc = useWebRTC({
    role: role || "sender",
    roomCode,
    sendSignal: ws.sendSignal,
    onDataChannel: handleDataChannel,
  });

  // Sync RTC state from the hook
  useEffect(() => {
    setRtcState(rtc.rtcState);
  }, [rtc.rtcState]);

  // ── WebSocket message handler ──

  useEffect(() => {
    const unsub = ws.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case "room-joined":
          setRoomCode(msg.roomCode);
          setInRoom(true);
          setRtcState("waiting");
          if (msg.role === "sender") {
            setShareLink(getShareLink(msg.roomCode));
          }
          break;

        case "peer-ready":
          setPeerPresent(true);
          // Sender initiates WebRTC offer
          if (roleRef.current === "sender") {
            rtc.startAsOfferer();
          }
          break;

        case "signal":
          rtc.handleSignal(msg.payload as { type: string; sdp?: string; candidate?: RTCIceCandidateInit });
          break;

        case "peer-left":
          setPeerPresent(false);
          setRtcState("disconnected");
          activeDcRef.current = null;
          rtc.cleanup();

          if (msg.role === "sender") {
            setAppError("Sender disconnected. The room has been closed.");
            setInRoom(false);
          } else {
            setAppError("Receiver disconnected. Waiting for a new receiver…");
            transfer.resetStats();
            setSelectedFile(null);
            setRtcState("waiting");
          }
          break;

        case "error":
          setAppError(msg.message);
          setLoading(false);
          break;
      }
    });
    return unsub;
  }, [ws, rtc, transfer]);

  // ── Actions ──

  const handleCreateRoom = useCallback(async () => {
    setLoading(true);
    setAppError(null);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create room");
      const data = await res.json();
      
      setRole("sender");
      roleRef.current = "sender";
      setRoomCode(data.roomCode);
      setShareLink(getShareLink(data.roomCode));

      // Connect WebSocket, then join room
      await ws.connect();
      ws.joinRoom(data.roomCode, "sender");
      setLoading(false);
    } catch (err) {
      setAppError(err instanceof Error ? err.message : "Failed to create room");
      setLoading(false);
    }
  }, [ws]);

  const handleJoinRoom = useCallback(
    async (code: string) => {
      setLoading(true);
      setAppError(null);
      try {
        // Check room exists
        const res = await fetch(`/api/rooms/${code}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Room not found" }));
          throw new Error(data.error || "Room not found");
        }
        const roomInfo = await res.json();
        if (roomInfo.hasReceiver) {
          throw new Error("Room is full — a receiver is already connected.");
        }

        setRole("receiver");
        roleRef.current = "receiver";
        setRoomCode(code);

        // Connect WebSocket, then join room
        await ws.connect();
        ws.joinRoom(code, "receiver");
        setLoading(false);
      } catch (err) {
        setAppError(err instanceof Error ? err.message : "Failed to join room");
        setLoading(false);
      }
    },
    [ws]
  );

  const handleStartTransfer = useCallback(() => {
    if (!selectedFile || !activeDcRef.current) return;
    if (activeDcRef.current.readyState !== "open") {
      setAppError("Data channel is not open yet. Please wait.");
      return;
    }
    transfer.sendFile(selectedFile, activeDcRef.current);
  }, [selectedFile, transfer]);

  const handleSendAnother = useCallback(() => {
    transfer.resetStats();
    setSelectedFile(null);
  }, [transfer]);

  // ── Auto-join from URL params ──

  useEffect(() => {
    if (urlRoom && urlRole === "receiver" && !autoJoinedRef.current && !inRoom) {
      autoJoinedRef.current = true;
      handleJoinRoom(urlRoom.toUpperCase());
    }
  }, [urlRoom, urlRole, handleJoinRoom, inRoom]);

  // ── Back to home ──

  const handleBackToHome = useCallback(() => {
    ws.disconnect();
    rtc.cleanup();
    transfer.resetStats();
    setRole(null);
    roleRef.current = null;
    setRoomCode("");
    setShareLink("");
    setPeerPresent(false);
    setRtcState("idle");
    setSelectedFile(null);
    setAppError(null);
    setInRoom(false);
    activeDcRef.current = null;
    autoJoinedRef.current = false;
    // Clean URL params
    window.history.replaceState({}, "", window.location.pathname);
  }, [ws, rtc, transfer]);

  // ── Render ──

  if (!inRoom && !loading) {
    return (
      <HomeScreen
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        initialCode={urlRoom}
        initialRole={urlRole}
        loading={loading}
        error={appError}
      />
    );
  }

  const combinedError = appError || transfer.error;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBackToHome}
            className="text-neutral-500 hover:text-white text-xs transition-colors"
          >
            ← Back
          </button>
          <div className="text-sm font-bold tracking-tight">
            P2P<span className="text-neutral-500">zip</span>
          </div>
          <div className="text-xs text-neutral-600 font-mono uppercase">
            {role}
          </div>
        </div>

        {/* WebSocket status */}
        {!ws.connected && inRoom && (
          <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-2xl p-3 text-center">
            <div className="text-yellow-400 text-xs">Connecting to server…</div>
          </div>
        )}

        {/* Role-specific panel */}
        {role === "sender" && (
          <SenderPanel
            roomCode={roomCode}
            shareLink={shareLink}
            peerPresent={peerPresent}
            rtcState={rtcState}
            selectedFile={selectedFile}
            stats={transfer.stats}
            error={combinedError}
            onSelectFile={setSelectedFile}
            onStartTransfer={handleStartTransfer}
            onSendAnother={handleSendAnother}
          />
        )}

        {role === "receiver" && (
          <ReceiverPanel
            roomCode={roomCode}
            peerPresent={peerPresent}
            rtcState={rtcState}
            incomingMeta={transfer.incomingMeta}
            stats={transfer.stats}
            downloadUrl={transfer.downloadUrl}
            error={combinedError}
            saveReady={transfer.saveReady}
            onPromptSave={transfer.promptSaveLocation}
          />
        )}

        {loading && !inRoom && (
          <div className="text-center text-neutral-500 text-sm py-8">
            <div className="inline-block w-5 h-5 border-2 border-neutral-600 border-t-white rounded-full animate-spin mr-2 align-middle" />
            Connecting…
          </div>
        )}
      </div>
    </div>
  );
}
