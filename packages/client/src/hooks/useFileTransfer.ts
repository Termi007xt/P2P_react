import { useCallback, useRef, useState } from "react";
import type { FileMeta, TransferStats } from "../types";
import {
  CHUNK_SIZE, OFFSET_SIZE, DATA_PER_CHUNK, DISK_READ_SIZE,
  HIGH_WATER_MARK, BUFFERED_AMOUNT_LOW_THRESHOLD, SPEED_UPDATE_INTERVAL,
  MAX_CHANNELS, BOOST_BATCH, BOOST_TIMEOUT, SPEED_CHECK_INTERVAL, SPEED_TARGET,
  RTC_CONFIG,
} from "../lib/constants";

const INITIAL_STATS: TransferStats = {
  progress: 0,
  bytesTransferred: 0,
  totalBytes: 0,
  speed: 0,
  completed: false,
};

// ── Offset header helpers ──

function packChunk(offset: number, data: ArrayBuffer): ArrayBuffer {
  const buf = new ArrayBuffer(OFFSET_SIZE + data.byteLength);
  const v = new DataView(buf);
  v.setUint32(0, Math.floor(offset / 0x100000000));
  v.setUint32(4, offset >>> 0);
  new Uint8Array(buf).set(new Uint8Array(data), OFFSET_SIZE);
  return buf;
}

function unpackChunk(buf: ArrayBuffer): { offset: number; data: ArrayBuffer } {
  const v = new DataView(buf);
  const offset = v.getUint32(0) * 0x100000000 + v.getUint32(4);
  return { offset, data: buf.slice(OFFSET_SIZE) };
}

// ── Wait helpers ──

function waitDrain(dc: RTCDataChannel): Promise<void> {
  return new Promise((r) => {
    if (dc.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) { r(); return; }
    const h = () => { dc.removeEventListener("bufferedamountlow", h); r(); };
    dc.addEventListener("bufferedamountlow", h);
  });
}

function waitMsg(dc: RTCDataChannel, type: string): Promise<void> {
  return new Promise((r) => {
    const h = (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      try { if (JSON.parse(e.data).type === type) { dc.removeEventListener("message", h); r(); } }
      catch { /* ignore */ }
    };
    dc.addEventListener("message", h);
  });
}

// ── Hook ──

export function useFileTransfer() {
  const [stats, setStats] = useState<TransferStats>(INITIAL_STATS);
  const [incomingMeta, setIncomingMeta] = useState<FileMeta | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveReady, setSaveReady] = useState(false);

  // Receiver state — writable stream for disk-streaming, chunks for fallback
  const writableRef = useRef<FileSystemWritableFileStream | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const receivedBytesRef = useRef(0);
  const expectedBytesRef = useRef(0);
  const useStreamRef = useRef(false);

  // Speed tracking
>>>>>>> parent of bdd681c (ram_check)
  const startTimeRef = useRef(0);
  const lastSpeedUpdateRef = useRef(0);
  const lastBytesRef = useRef(0);

  // Abort handle
  const abortRef = useRef(false);

  const resetStats = useCallback(() => {
<<<<<<< HEAD
    setStats(INITIAL_STATS); setIncomingMeta(null); setDownloadUrl(null);
    setError(null); setSaveReady(false);
    dcRef.current = null; writableRef.current = null; chunksRef.current = [];
    receivedBytesRef.current = 0; expectedBytesRef.current = 0;
    useStreamRef.current = false; writeChainRef.current = Promise.resolve();
    fileCompleteRef.current = false;
    boostPcsRef.current.forEach(pc => pc.close()); boostPcsRef.current = new Map();
    startTimeRef.current = 0; lastSpeedUpdateRef.current = 0;
    lastBytesRef.current = 0; abortRef.current = false;
  }, []);

  // ════════════════════ SENDER ════════════════════

  const sendFile = useCallback((file: File, dc: RTCDataChannel) => {
    if (!file.name.endsWith(".zip")) { setError("Only .zip files are allowed."); return; }
    const totalBytes = file.size;
    dc.send(JSON.stringify({
      type: "file-meta", fileName: file.name, fileSize: totalBytes,
      mimeType: "application/zip", chunkSize: CHUNK_SIZE,
      totalChunks: Math.ceil(totalBytes / DATA_PER_CHUNK),
    } as FileMeta));

    setStats({ progress: 0, bytesTransferred: 0, totalBytes, speed: 0, completed: false });
=======
    setStats(INITIAL_STATS);
    setIncomingMeta(null);
    setDownloadUrl(null);
    setError(null);
    setSaveReady(false);
    writableRef.current = null;
    chunksRef.current = [];
    receivedBytesRef.current = 0;
    useStreamRef.current = false;
    startTimeRef.current = 0;
    lastSpeedUpdateRef.current = 0;
    lastBytesRef.current = 0;
    abortRef.current = false;
  }, []);

  // ── SENDER ──

  const sendFile = useCallback((file: File, dc: RTCDataChannel) => {
    if (!file.name.endsWith(".zip")) {
      setError("Only .zip files are allowed.");
      return;
    }

    const totalBytes = file.size;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

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

>>>>>>> parent of bdd681c (ram_check)
    abortRef.current = false;
    startTimeRef.current = performance.now();
    lastSpeedUpdateRef.current = performance.now();
    lastBytesRef.current = 0;

    dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;

    let fileOffset = 0;

    const waitForDrain = (): Promise<void> => {
      return new Promise((resolve) => {
        if (dc.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) {
          resolve();
          return;
        }
        const onLow = () => {
          dc.removeEventListener("bufferedamountlow", onLow);
          resolve();
        };
        dc.addEventListener("bufferedamountlow", onLow);
      });
    };

    const updateSendStats = (bytesSent: number) => {
      const now = performance.now();
      if (now - lastSpeedUpdateRef.current >= SPEED_UPDATE_INTERVAL) {
        const elapsed = (now - lastSpeedUpdateRef.current) / 1000;
        const bytesDelta = bytesSent - lastBytesRef.current;
        const speed = elapsed > 0 ? bytesDelta / elapsed : 0;
        lastSpeedUpdateRef.current = now;
        lastBytesRef.current = bytesSent;

        setStats({
          progress: Math.round((bytesSent / totalBytes) * 100),
          bytesTransferred: bytesSent,
          totalBytes,
          speed,
          completed: false,
        });
      }
    };

    // ── Stats helper ──
    const updateStats = (sent: number) => {
      const now = performance.now();
      if (now - lastSpeedUpdateRef.current >= SPEED_UPDATE_INTERVAL) {
        const elapsed = (now - lastSpeedUpdateRef.current) / 1000;
        const speed = elapsed > 0 ? (sent - lastBytesRef.current) / elapsed : 0;
        lastSpeedUpdateRef.current = now; lastBytesRef.current = sent;
        setStats({ progress: Math.round((sent / totalBytes) * 100),
          bytesTransferred: sent, totalBytes, speed, completed: false });
      }
    };

    // ── Main send loop ──
    const sendLoop = async () => {
      try {
        while (fileOffset < totalBytes) {
          if (abortRef.current || dc.readyState !== "open") return;

          // Log active channel count periodically
          const openCount = channels.filter(c => c.readyState === "open").length;
          if (openCount !== lastChannelLog) {
            console.log(`[P2P] Active channels: ${openCount}`);
            lastChannelLog = openCount;
          }

          // Adaptive scaling check
          const now = performance.now();
          if (!scalingDone && now - lastScaleCheck >= SPEED_CHECK_INTERVAL) {
            lastScaleCheck = now;
            const elapsed = (now - startTimeRef.current) / 1000;
            const currentSpeed = elapsed > 0 ? fileOffset / elapsed : 0;
            console.log(`[P2P] Speed: ${(currentSpeed / 1024 / 1024).toFixed(1)} MB/s, channels: ${openCount}`);
            if (currentSpeed < SPEED_TARGET && channels.length < MAX_CHANNELS) {
              addBatch(BOOST_BATCH);
            } else if (channels.length >= MAX_CHANNELS || currentSpeed >= SPEED_TARGET) {
              scalingDone = true;
            }
          }

          // Read block from disk
          const blockStart = fileOffset;
          const blockEnd = Math.min(fileOffset + DISK_READ_SIZE, totalBytes);
          const blockBuf = await file.slice(blockStart, blockEnd).arrayBuffer();
          const blockLen = blockBuf.byteLength;

          let blockOffset = 0;
          while (blockOffset < blockLen) {
            if (abortRef.current || dc.readyState !== "open") return;

            while (dc.bufferedAmount >= HIGH_WATER_MARK) {
              await waitForDrain();
            }

            const chunkEnd = Math.min(blockOffset + CHUNK_SIZE, blockLen);
            const chunk = blockBuf.slice(blockOffset, chunkEnd);
            dc.send(chunk);

            blockOffset = chunkEnd;
            updateSendStats(blockStart + blockOffset);
          }

          fileOffset = blockEnd;
        }

        await waitForDrain();

        if (dc.readyState === "open") {
          dc.send(JSON.stringify({ type: "file-complete" }));
        }

        const totalTime = (performance.now() - startTimeRef.current) / 1000;
        setStats({
          progress: 100,
          bytesTransferred: totalBytes,
          totalBytes,
          speed: totalTime > 0 ? totalBytes / totalTime : 0,
          completed: true,
        });
      } catch (err) {
        boostPcs.forEach(pc => pc.close());
        console.error("Send error:", err);
        setError(`Transfer failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    sendLoop();
  }, []);

  // ── RECEIVER ──

  /**
   * Prompt the user to pick a save location using File System Access API.
   * Called by ReceiverPanel when file-meta arrives.
   * Returns true if streaming is set up, false if falling back to in-memory.
   */
  const promptSaveLocation = useCallback(async (meta: FileMeta): Promise<boolean> => {
    // Check if File System Access API is available
    if (!("showSaveFilePicker" in window)) {
      // Fallback: use in-memory chunks
      useStreamRef.current = false;
      setSaveReady(true);
      return false;
    }

    try {
      const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> })
        .showSaveFilePicker({
          suggestedName: meta.fileName,
          types: [
            {
              description: "ZIP Archive",
              accept: { "application/zip": [".zip"] },
            },
          ],
        });

      const writable = await handle.createWritable();
      writableRef.current = writable;
      useStreamRef.current = true;
      setSaveReady(true);
      return true;
    } catch (err) {
      // User cancelled the picker — fall back to in-memory
      console.warn("Save picker cancelled, using in-memory fallback:", err);
      useStreamRef.current = false;
      setSaveReady(true);
      return false;
    }
  }, []);

  const setupReceiver = useCallback((dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";

    let expectedBytes = 0;

    dc.onmessage = async (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === "file-meta") {
            const meta = msg as FileMeta;
            setIncomingMeta(meta);
            expectedBytes = meta.fileSize;
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
            setSaveReady(false);
            setError(null);
            return;
          }

          if (msg.type === "file-complete") {
            const totalTime = (performance.now() - startTimeRef.current) / 1000;
            const finalBytes = receivedBytesRef.current;

            if (useStreamRef.current && writableRef.current) {
              // Streaming mode — close the writable stream, file is saved
              try {
                await writableRef.current.close();
              } catch (err) {
                console.error("Error closing writable stream:", err);
              }
              writableRef.current = null;

              setStats({
                progress: 100,
                bytesTransferred: finalBytes,
                totalBytes: expectedBytes,
                speed: totalTime > 0 ? finalBytes / totalTime : 0,
                completed: true,
              });
              // No downloadUrl needed — file is already saved to disk
              setDownloadUrl("saved-to-disk");
            } else {
              // In-memory fallback — assemble blob
              const blob = new Blob(chunksRef.current as unknown as BlobPart[], { type: "application/zip" });
              const url = URL.createObjectURL(blob);
              setDownloadUrl(url);

              setStats({
                progress: 100,
                bytesTransferred: finalBytes,
                totalBytes: expectedBytes,
                speed: totalTime > 0 ? finalBytes / totalTime : 0,
                completed: true,
              });

              chunksRef.current = [];
            }
            return;
          }
        } catch {
          // Not JSON, ignore
        }
      } else {
        // Binary chunk
        const data = e.data as ArrayBuffer;
        receivedBytesRef.current += data.byteLength;

        if (useStreamRef.current && writableRef.current) {
          // Stream directly to disk — no memory buildup
          try {
            await writableRef.current.write(new Uint8Array(data));
          } catch (err) {
            console.error("Disk write error:", err);
            setError(`Disk write failed: ${err instanceof Error ? err.message : String(err)}`);
            return;
          }
        } else {
          // In-memory fallback
          chunksRef.current.push(new Uint8Array(data));
        }

        // Update stats periodically
        const now = performance.now();
        if (now - lastSpeedUpdateRef.current >= SPEED_UPDATE_INTERVAL) {
          const elapsed = (now - lastSpeedUpdateRef.current) / 1000;
          const bytesDelta = receivedBytesRef.current - lastBytesRef.current;
          const speed = elapsed > 0 ? bytesDelta / elapsed : 0;
          lastSpeedUpdateRef.current = now;
          lastBytesRef.current = receivedBytesRef.current;

          setStats((prev: TransferStats) => ({
            ...prev,
            progress: Math.round((receivedBytesRef.current / (expectedBytes || 1)) * 100),
            bytesTransferred: receivedBytesRef.current,
            speed,
          }));
        }
      } catch { /* ignore */ }
    };
  }, [handleBinaryChunk, finalizeReceive]);

  return {
    stats,
    incomingMeta,
    downloadUrl,
    error,
    saveReady,
    setError,
    sendFile,
    setupReceiver,
    promptSaveLocation,
    resetStats,
  };
}
