import { useCallback, useRef, useState } from "react";
import type { FileMeta, TransferStats } from "../types";
import {
  CHUNK_SIZE,
  DISK_READ_SIZE,
  HIGH_WATER_MARK,
  BUFFERED_AMOUNT_LOW_THRESHOLD,
  SPEED_UPDATE_INTERVAL,
  MAX_FILE_SIZE,
  formatBytes,
} from "../lib/constants";

const INITIAL_STATS: TransferStats = {
  progress: 0, bytesTransferred: 0, totalBytes: 0, speed: 0, completed: false,
};

export function useFileTransfer() {
  const [stats, setStats] = useState<TransferStats>(INITIAL_STATS);
  const [incomingMeta, setIncomingMeta] = useState<FileMeta | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveReady, setSaveReady] = useState(false);

  // Receiver: data channel ref (for sending control messages back)
  const dcRef = useRef<RTCDataChannel | null>(null);

  // Receiver: disk streaming
  const writableRef = useRef<FileSystemWritableFileStream | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]); // in-memory fallback
  const receivedBytesRef = useRef(0);
  const useStreamRef = useRef(false);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());

  // Speed tracking
  const startTimeRef = useRef(0);
  const lastSpeedUpdateRef = useRef(0);
  const lastBytesRef = useRef(0);
  const abortRef = useRef(false);

  const resetStats = useCallback(() => {
    setStats(INITIAL_STATS);
    setIncomingMeta(null);
    setDownloadUrl(null);
    setError(null);
    setSaveReady(false);
    dcRef.current = null;
    writableRef.current = null;
    chunksRef.current = [];
    receivedBytesRef.current = 0;
    useStreamRef.current = false;
    writeChainRef.current = Promise.resolve();
    startTimeRef.current = 0;
    lastSpeedUpdateRef.current = 0;
    lastBytesRef.current = 0;
    abortRef.current = false;
  }, []);

  // ────────────────── SENDER ──────────────────

  const sendFile = useCallback((file: File, dc: RTCDataChannel) => {
    if (file.size > MAX_FILE_SIZE) { setError(`File exceeds the maximum size limit.`); return; }

    const totalBytes = file.size;
    const meta: FileMeta = {
      type: "file-meta", fileName: file.name, fileSize: totalBytes,
      mimeType: file.type || "application/octet-stream", chunkSize: CHUNK_SIZE,
      totalChunks: Math.ceil(totalBytes / CHUNK_SIZE),
    };
    dc.send(JSON.stringify(meta));

    setStats({ progress: 0, bytesTransferred: 0, totalBytes, speed: 0, completed: false });

    abortRef.current = false;
    startTimeRef.current = performance.now();
    lastSpeedUpdateRef.current = performance.now();
    lastBytesRef.current = 0;
    dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;

    let fileOffset = 0;

    // ── Wait for receiver to signal ready ──
    const waitForReady = new Promise<void>((resolve, reject) => {
      const listener = (ev: MessageEvent) => {
        if (typeof ev.data === "string") {
          try {
            const parsed = JSON.parse(ev.data);
            if (parsed.type === "ready-to-receive") {
              dc.removeEventListener("message", listener);
              resolve();
            } else if (parsed.type === "abort-transfer") {
              dc.removeEventListener("message", listener);
              reject(new Error(parsed.reason === "file-too-large"
                ? "Receiver rejected the file: exceeds size limit."
                : `Transfer aborted by receiver: ${parsed.reason || "unknown reason"}`));
            }
          } catch { /* ignore */ }
        }
      };
      dc.addEventListener("message", listener);
    });

    const waitForDrain = (): Promise<void> => new Promise((resolve) => {
      if (dc.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) { resolve(); return; }
      const onLow = () => { dc.removeEventListener("bufferedamountlow", onLow); resolve(); };
      dc.addEventListener("bufferedamountlow", onLow);
    });

    const updateSendStats = (bytesSent: number) => {
      const now = performance.now();
      if (now - lastSpeedUpdateRef.current >= SPEED_UPDATE_INTERVAL) {
        const elapsed = (now - lastSpeedUpdateRef.current) / 1000;
        const speed = elapsed > 0 ? (bytesSent - lastBytesRef.current) / elapsed : 0;
        lastSpeedUpdateRef.current = now;
        lastBytesRef.current = bytesSent;
        setStats({ progress: Math.round((bytesSent / totalBytes) * 100),
          bytesTransferred: bytesSent, totalBytes, speed, completed: false });
      }
    };

    const sendLoop = async () => {
      try {
        await waitForReady; // ← sender blocks until receiver picks save location

        // Listen for mid-transfer abort (e.g. receiver's chunk-size cap)
        const abortListener = (ev: MessageEvent) => {
          if (typeof ev.data === "string") {
            try {
              const parsed = JSON.parse(ev.data);
              if (parsed.type === "abort-transfer") {
                abortRef.current = true;
                setError(parsed.reason === "file-too-large"
                  ? "Receiver rejected the file: exceeds size limit."
                  : `Transfer aborted by receiver: ${parsed.reason || "unknown reason"}`);
                dc.removeEventListener("message", abortListener);
              }
            } catch { /* ignore */ }
          }
        };
        dc.addEventListener("message", abortListener);

        while (fileOffset < totalBytes) {
          if (abortRef.current || dc.readyState !== "open") return;

          const blockStart = fileOffset;
          const blockEnd = Math.min(fileOffset + DISK_READ_SIZE, totalBytes);
          const blockBuf = await file.slice(blockStart, blockEnd).arrayBuffer();
          const blockLen = blockBuf.byteLength;

          let bOff = 0;
          while (bOff < blockLen) {
            if (abortRef.current || dc.readyState !== "open") return;
            while (dc.bufferedAmount >= HIGH_WATER_MARK) { await waitForDrain(); }

            const end = Math.min(bOff + CHUNK_SIZE, blockLen);
            dc.send(blockBuf.slice(bOff, end));
            bOff = end;
            updateSendStats(blockStart + bOff);
          }
          fileOffset = blockEnd;
        }

        await waitForDrain();
        if (dc.readyState === "open") dc.send(JSON.stringify({ type: "file-complete" }));

        const totalTime = (performance.now() - startTimeRef.current) / 1000;
        setStats({ progress: 100, bytesTransferred: totalBytes, totalBytes,
          speed: totalTime > 0 ? totalBytes / totalTime : 0, completed: true });
      } catch (err) {
        console.error("Send error:", err);
        setError(`Transfer failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    sendLoop();
  }, []);

  // ────────────────── RECEIVER ──────────────────

  /** Prompt user to pick save location, then signal sender to start */
  const promptSaveLocation = useCallback(async (meta: FileMeta): Promise<boolean> => {
    let streaming = false;

    // Extract extension from the incoming file name (e.g. ".png", ".mp4", ".zip")
    const dotIndex = meta.fileName.lastIndexOf(".");
    const ext = dotIndex !== -1 ? meta.fileName.slice(dotIndex) : "";
    const mimeType = meta.mimeType || "application/octet-stream";

    if ("showSaveFilePicker" in window) {
      try {
        const pickerOpts: Record<string, unknown> = { suggestedName: meta.fileName };
        // Only set types filter if we have a valid extension
        if (ext) {
          pickerOpts.types = [{ description: meta.fileName, accept: { [mimeType]: [ext] } }];
        }
        const handle = await (window as unknown as {
          showSaveFilePicker: (o: unknown) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker(pickerOpts);
        const writable = await handle.createWritable();
        writableRef.current = writable;
        useStreamRef.current = true;
        streaming = true;
      } catch {
        // User cancelled — fall back to in-memory
        useStreamRef.current = false;
      }
    }

    setSaveReady(true);

    // Signal sender: "I'm ready, start sending chunks"
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({ type: "ready-to-receive" }));
    }

    return streaming;
  }, []);

  /** Set up data channel handlers for receiving */
  const setupReceiver = useCallback((dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";
    dcRef.current = dc;

    let expectedBytes = 0;

    dc.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === "file-meta") {
            const meta = msg as FileMeta;

            // ── Clean up previous transfer's stream (if any) ──
            if (writableRef.current) {
              try { writableRef.current.close(); } catch { /* already closed */ }
              writableRef.current = null;
            }
            useStreamRef.current = false;

            // ── Reject files exceeding the size limit ──
            if (meta.fileSize > MAX_FILE_SIZE) {
              setError(`File is too large. Maximum allowed size is ${formatBytes(MAX_FILE_SIZE)}.`);
              if (dc.readyState === "open") {
                dc.send(JSON.stringify({ type: "abort-transfer", reason: "file-too-large" }));
              }
              return;
            }

            setIncomingMeta(meta);
            expectedBytes = meta.fileSize;
            chunksRef.current = [];
            receivedBytesRef.current = 0;
            writeChainRef.current = Promise.resolve();
            startTimeRef.current = performance.now();
            lastSpeedUpdateRef.current = performance.now();
            lastBytesRef.current = 0;
            // Store meta on the data channel so the blob fallback can use the correct MIME type
            (dc as unknown as { __incomingMeta?: FileMeta }).__incomingMeta = meta;
            setStats({ progress: 0, bytesTransferred: 0, totalBytes: meta.fileSize,
              speed: 0, completed: false });
            setDownloadUrl(null);
            setSaveReady(false);
            setError(null);
            return;
          }

          if (msg.type === "file-complete") {
            // Wait for all queued writes to finish, then finalize
            writeChainRef.current.then(async () => {
              const totalTime = (performance.now() - startTimeRef.current) / 1000;
              const finalBytes = receivedBytesRef.current;

              if (useStreamRef.current && writableRef.current) {
                try { await writableRef.current.close(); } catch (err) {
                  console.error("Error closing stream:", err);
                }
                writableRef.current = null;
                setDownloadUrl("saved-to-disk");
              } else {
                const inMeta = (dc as unknown as { __incomingMeta?: FileMeta }).__incomingMeta;
                const blobType = inMeta?.mimeType || "application/octet-stream";
                const blob = new Blob(chunksRef.current as unknown as BlobPart[],
                  { type: blobType });
                setDownloadUrl(URL.createObjectURL(blob));
                chunksRef.current = [];
              }

              setStats({ progress: 100, bytesTransferred: finalBytes,
                totalBytes: expectedBytes,
                speed: totalTime > 0 ? finalBytes / totalTime : 0, completed: true });
            });
            return;
          }
        } catch { /* ignore */ }
      } else {
        // Binary chunk — write to disk (queued) or memory
        const data = e.data as ArrayBuffer;
        receivedBytesRef.current += data.byteLength;

        // Enforce the size cap against malicious/buggy senders
        if (receivedBytesRef.current > MAX_FILE_SIZE) {
          setError(`Transfer exceeded the ${formatBytes(MAX_FILE_SIZE)} limit. Transfer aborted.`);
          if (dc.readyState === "open") {
            dc.send(JSON.stringify({ type: "abort-transfer", reason: "file-too-large" }));
          }
          // Cleanup: close stream, clear memory, remove handler
          if (writableRef.current) {
            try { writableRef.current.abort(); } catch { /* ignore */ }
            writableRef.current = null;
          }
          chunksRef.current = [];
          dc.onmessage = null;
          return;
        }

        if (useStreamRef.current && writableRef.current) {
          // Chain writes sequentially so they don't pile up as parallel promises
          const w = writableRef.current;
          writeChainRef.current = writeChainRef.current.then(() => w.write(data));
        } else {
          chunksRef.current.push(new Uint8Array(data));
        }

        // Update stats periodically
        const now = performance.now();
        if (now - lastSpeedUpdateRef.current >= SPEED_UPDATE_INTERVAL) {
          const elapsed = (now - lastSpeedUpdateRef.current) / 1000;
          const speed = elapsed > 0
            ? (receivedBytesRef.current - lastBytesRef.current) / elapsed : 0;
          lastSpeedUpdateRef.current = now;
          lastBytesRef.current = receivedBytesRef.current;
          setStats((prev: TransferStats) => ({ ...prev,
            progress: Math.round((receivedBytesRef.current / (expectedBytes || 1)) * 100),
            bytesTransferred: receivedBytesRef.current, speed }));
        }
      }
    };
  }, []);

  return {
    stats, incomingMeta, downloadUrl, error, saveReady, setError,
    sendFile, setupReceiver, promptSaveLocation, resetStats,
  };
}
