// Transfer state persistence for resume capability

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface TransferFile {
  localPath: string;
  remotePath: string;
  size: number;
  uploaded: boolean;
  checksum?: string;
}

export interface TransferState {
  id: string;
  type: "upload" | "download";
  startTime: number;
  directories?: string[];
  files: TransferFile[];
  currentIndex: number;
  totalSize: number;
  uploadedSize: number;
  status: "in_progress" | "paused" | "completed" | "failed";
  error?: string;
}

export interface TransferConfig {
  chunkSize?: number;
  verifyChecksum?: boolean;
  resume?: boolean;
}

export function getTransferStateDir(): string {
  return (
    process.env.BHPAN_TRANSFER_STATE ||
    (process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA || "", "bhpan", "state")
      : path.join(os.homedir(), ".local", "share", "bhpan", "state"))
  );
}

export function generateTransferId(): string {
  return `transfer_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function saveTransferState(state: TransferState): void {
  const stateDir = getTransferStateDir();

  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  }

  const stateFile = path.join(stateDir, `${state.id}.json`);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
}

export function loadTransferState(transferId: string): TransferState | null {
  const stateDir = getTransferStateDir();
  const stateFile = path.join(stateDir, `${transferId}.json`);

  if (!fs.existsSync(stateFile)) {
    return null;
  }

  const data = fs.readFileSync(stateFile, "utf8");
  return JSON.parse(data) as TransferState;
}

export function listTransferStates(): TransferState[] {
  const stateDir = getTransferStateDir();

  if (!fs.existsSync(stateDir)) {
    return [];
  }

  const files = fs.readdirSync(stateDir).filter((f) => f.endsWith(".json"));
  const states: TransferState[] = [];

  for (const file of files) {
    try {
      const data = fs.readFileSync(path.join(stateDir, file), "utf8");
      states.push(JSON.parse(data) as TransferState);
    } catch {
      // Skip malformed state files
    }
  }

  return states;
}

export function deleteTransferState(transferId: string): void {
  const stateDir = getTransferStateDir();
  const stateFile = path.join(stateDir, `${transferId}.json`);

  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }
}

export function cleanOldTransferStates(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const stateDir = getTransferStateDir();

  if (!fs.existsSync(stateDir)) {
    return 0;
  }

  const files = fs.readdirSync(stateDir);
  const now = Date.now();
  let cleaned = 0;

  for (const file of files) {
    const filePath = path.join(stateDir, file);
    const stats = fs.statSync(filePath);

    if (now - stats.mtimeMs > maxAgeMs) {
      fs.unlinkSync(filePath);
      cleaned++;
    }
  }

  return cleaned;
}
