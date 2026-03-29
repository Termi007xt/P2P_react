import { useCallback, useRef, useState } from "react";
import type { Role, RtcState } from "../types";
import { RTC_CONFIG } from "../lib/constants";

interface UseWebRTCOptions {
  role: Role;
  roomCode: string;
  sendSignal: (roomCode: string, targetRole: Role, payload: unknown) => void;
  onDataChannel: (dc: RTCDataChannel) => void;
}

export function useWebRTC({ role, roomCode, sendSignal, onDataChannel }: UseWebRTCOptions) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const [rtcState, setRtcState] = useState<RtcState>("idle");

  const targetRole: Role = role === "sender" ? "receiver" : "sender";

  const cleanup = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  /** Create peer connection and set up ICE + state tracking */
  const createPeerConnection = useCallback(() => {
    cleanup();

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal(roomCode, targetRole, {
          type: "ice-candidate",
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") setRtcState("connected");
      else if (state === "failed") setRtcState("failed");
      else if (state === "disconnected") setRtcState("disconnected");
      else if (state === "connecting") setRtcState("connecting");
    };

    return pc;
  }, [cleanup, roomCode, sendSignal, targetRole]);

  /** Sender: create offer and data channel */
  const startAsOfferer = useCallback(async () => {
    setRtcState("connecting");
    const pc = createPeerConnection();

    const dc = pc.createDataChannel("file-transfer", { ordered: true });
    dcRef.current = dc;
    onDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    sendSignal(roomCode, targetRole, {
      type: "offer",
      sdp: offer.sdp,
    });
  }, [createPeerConnection, onDataChannel, roomCode, sendSignal, targetRole]);

  /** Receiver: handle incoming offer, create answer */
  const handleOffer = useCallback(
    async (sdp: string) => {
      setRtcState("connecting");
      const pc = createPeerConnection();

      // Receiver listens for incoming data channel
      pc.ondatachannel = (e) => {
        dcRef.current = e.channel;
        onDataChannel(e.channel);
      };

      await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal(roomCode, targetRole, {
        type: "answer",
        sdp: answer.sdp,
      });
    },
    [createPeerConnection, onDataChannel, roomCode, sendSignal, targetRole]
  );

  /** Handle incoming answer (sender side) */
  const handleAnswer = useCallback(async (sdp: string) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
  }, []);

  /** Handle incoming ICE candidate */
  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Ignore ICE errors for candidates arriving before remote description
    }
  }, []);

  /** Handle incoming signal message from WebSocket */
  const handleSignal = useCallback(
    async (payload: { type: string; sdp?: string; candidate?: RTCIceCandidateInit }) => {
      switch (payload.type) {
        case "offer":
          if (payload.sdp) await handleOffer(payload.sdp);
          break;
        case "answer":
          if (payload.sdp) await handleAnswer(payload.sdp);
          break;
        case "ice-candidate":
          if (payload.candidate) await handleIceCandidate(payload.candidate);
          break;
      }
    },
    [handleOffer, handleAnswer, handleIceCandidate]
  );

  return {
    rtcState,
    setRtcState,
    startAsOfferer,
    handleSignal,
    cleanup,
    dcRef,
  };
}
