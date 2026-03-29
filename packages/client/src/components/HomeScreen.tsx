import { useState } from "react";
import type { Role } from "../types";

interface HomeScreenProps {
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  initialCode: string;
  initialRole: Role | null;
  loading: boolean;
  error: string | null;
}

export function HomeScreen({
  onCreateRoom,
  onJoinRoom,
  initialCode,
  initialRole,
  loading,
  error,
}: HomeScreenProps) {
  const [joinCode, setJoinCode] = useState(initialCode);

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    onJoinRoom(code);
  };

  // Auto-join if URL has room + role=receiver
  // (handled in App.tsx, but we show the join UI pre-filled)

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <div className="text-5xl font-bold tracking-tight">
            P2P<span className="text-neutral-500">zip</span>
          </div>
          <p className="text-neutral-500 text-sm">
            Fast peer-to-peer .zip transfer. No uploads. No accounts.
          </p>
        </div>

        {/* Create Room */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
            Send a file
          </h2>
          <p className="text-xs text-neutral-500">
            Create a room and share the code with the receiver.
          </p>
          <button
            id="create-room-btn"
            onClick={onCreateRoom}
            disabled={loading}
            className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating…" : "Create Room"}
          </button>
        </div>

        {/* Join Room */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
            Receive a file
          </h2>
          <p className="text-xs text-neutral-500">
            Enter the room code shared by the sender.
          </p>
          <div className="flex gap-2">
            <input
              id="join-code-input"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="ROOM CODE"
              maxLength={10}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm font-mono text-center tracking-widest text-white placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors uppercase"
            />
            <button
              id="join-room-btn"
              onClick={handleJoin}
              disabled={loading || !joinCode.trim()}
              className="px-6 py-3 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-2xl p-4 text-center">
            <div className="text-red-400 text-sm">{error}</div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-neutral-600 text-xs">
          Files transfer directly between browsers via WebRTC.
          <br />
          Nothing is uploaded to any server.
        </p>
      </div>
    </div>
  );
}
