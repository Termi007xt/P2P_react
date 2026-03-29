import { useCallback, useRef, useState } from "react";
import type { FileMeta, TransferStats } from "../types";
import { CHUNK_SIZE, BUFFERED_AMOUNT_LOW_THRESHOLD, SPEED_UPDATE_INTERVAL } from "../lib/constants";

const INITIAL_STATS: TransferStats = {
  progress: 0,
  bytesTransferred: 0,
  totalBytes: 0,
  speed: 0,
  completed: false,
};

export function useFileTransfer() {
  const [stats, setStats] = useState<TransferStats>(INITIAL_STATS);
  const [incomingMeta, setIncomingMeta] = useState<FileMeta | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Receiver state
  const chunksRef = useRef<Uint8Array[]>([]);
  const receivedBytesRef = useRef(0);

  // Speed tracking
  const startTimeRef = useRef(0);
  const lastSpeedUpdateRef = useRef(0);
  const lastBytesRef = useRef(0);

  const resetStats = useCallback(() => {
    setStats(INITIAL_STATS);
    setIncomingMeta(null);
    setDownloadUrl(null);
    setError(null);
    chunksRef.current = [];
    receivedBytesRef.current = 0;
    startTimeRef.current = 0;
    lastSpeedUpdateRef.current = 0;
    lastBytesRef.current = 0;
  }, []);

  // ── SENDER ──

  const sendFile = useCallback((file: File, dc: RTCDataChannel) => {
    if (!file.name.endsWith(".zip")) {
      setError("Only .zip files are allowed.");
      return;
    }

    const totalBytes = file.size;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

    // Send metadata as JSON string
    const meta: FileMeta = {
      type: "file-meta",
      fileName: file.name,
      fileSize: totalBytes,
      mimeType: "application/zip",
      chunkSize: CHUNK_SIZE,
      totalChunks,
    };
    dc.send(JSON.stringify(meta));

    setStats({
      progress: 0,
      bytesTransferred: 0,
      totalBytes,
      speed: 0,
      completed: false,
    });

    startTimeRef.current = performance.now();
    lastSpeedUpdateRef.current = performance.now();
    lastBytesRef.current = 0;

    let offset = 0;

    dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;

    const sendNextChunks = () => {
      while (offset < totalBytes) {
        if (dc.bufferedAmount > BUFFERED_AMOUNT_LOW_THRESHOLD) {
          // Wait for buffer to drain
          return;
        }

        const end = Math.min(offset + CHUNK_SIZE, totalBytes);
        const slice = file.slice(offset, end);

        slice.arrayBuffer().then((buf) => {
          if (dc.readyState !== "open") return;
          dc.send(buf);
        });

        offset = end;

        // Update stats periodically
        const now = performance.now();
        if (now - lastSpeedUpdateRef.current >= SPEED_UPDATE_INTERVAL) {
          const elapsed = (now - lastSpeedUpdateRef.current) / 1000;
          const bytesDelta = offset - lastBytesRef.current;
          const speed = elapsed > 0 ? bytesDelta / elapsed : 0;
          lastSpeedUpdateRef.current = now;
          lastBytesRef.current = offset;

          setStats({
            progress: Math.round((offset / totalBytes) * 100),
            bytesTransferred: offset,
            totalBytes,
            speed,
            completed: false,
          });
        }
      }

      // All chunks queued
      // We need to wait until bufferedAmount drains to 0 before sending file-complete
      const waitForDrain = () => {
        if (dc.bufferedAmount === 0) {
          dc.send(JSON.stringify({ type: "file-complete" }));
          const totalTime = (performance.now() - startTimeRef.current) / 1000;
          setStats({
            progress: 100,
            bytesTransferred: totalBytes,
            totalBytes,
            speed: totalTime > 0 ? totalBytes / totalTime : 0,
            completed: true,
          });
        } else {
          setTimeout(waitForDrain, 50);
        }
      };
      waitForDrain();
    };

    dc.onbufferedamountlow = () => {
      sendNextChunks();
    };

    sendNextChunks();
  }, []);

  // ── RECEIVER ──

  /** Set up data channel handlers for receiving */
  const setupReceiver = useCallback((dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";

    dc.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === "file-meta") {
            const meta = msg as FileMeta;
            setIncomingMeta(meta);
            chunksRef.current = [];
            receivedBytesRef.current = 0;
            startTimeRef.current = performance.now();
            lastSpeedUpdateRef.current = performance.now();
            lastBytesRef.current = 0;

            setStats({
              progress: 0,
              bytesTransferred: 0,
              totalBytes: meta.fileSize,
              speed: 0,
              completed: false,
            });
            setDownloadUrl(null);
            setError(null);
            return;
          }

          if (msg.type === "file-complete") {
            // Assemble blob
            const blob = new Blob(chunksRef.current, { type: "application/zip" });
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);

            const totalTime = (performance.now() - startTimeRef.current) / 1000;
            setStats((prev) => ({
              ...prev,
              progress: 100,
              bytesTransferred: receivedBytesRef.current,
              speed: totalTime > 0 ? receivedBytesRef.current / totalTime : 0,
              completed: true,
            }));
            return;
          }
        } catch {
          // Not JSON, ignore
        }
      } else {
        // Binary chunk
        const chunk = new Uint8Array(e.data as ArrayBuffer);
        chunksRef.current.push(chunk);
        receivedBytesRef.current += chunk.byteLength;

        const now = performance.now();
        if (now - lastSpeedUpdateRef.current >= SPEED_UPDATE_INTERVAL) {
          const elapsed = (now - lastSpeedUpdateRef.current) / 1000;
          const bytesDelta = receivedBytesRef.current - lastBytesRef.current;
          const speed = elapsed > 0 ? bytesDelta / elapsed : 0;
          lastSpeedUpdateRef.current = now;
          lastBytesRef.current = receivedBytesRef.current;

          const totalBytes = stats.totalBytes || 1;
          setStats((prev) => ({
            ...prev,
            progress: Math.round((receivedBytesRef.current / prev.totalBytes) * 100),
            bytesTransferred: receivedBytesRef.current,
            speed,
          }));
        }
      }
    };
  }, [stats.totalBytes]);

  return {
    stats,
    incomingMeta,
    downloadUrl,
    error,
    setError,
    sendFile,
    setupReceiver,
    resetStats,
  };
}
