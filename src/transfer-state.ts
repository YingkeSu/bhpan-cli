// Transfer state persistence for resume capability

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

const STATE_DIR = ".bhpan_transfer";

/**
 * Get the transfer state directory
 */
export function getTransferStateDir(): string {
  const os = require("os");
  const path = require("path");
  
  const userDataDir = process.env.BHPAN_TRANSFER_STATE || 
    (process.platform === "win32" 
      ? path.join(process.env.LOCALAPPDATA || "", "bhpan", "state") 
      : path.join(os.homedir(), ".local", "share", "bhpan", "state"));
  
  return userDataDir;
}

/**
 * Generate a unique transfer ID
 */
export function generateTransferId(): string {
  return `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Save transfer state to disk
 */
export function saveTransferState(state: TransferState): void {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  
  const stateDir = getTransferStateDir();
  
  // Create state directory if it doesn't exist
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  }
  
  const stateFile = path.join(stateDir, `${state.id}.json`);
  
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch (error) {
    console.error(`Failed to save transfer state: ${error}`);
  }
}

/**
 * Load transfer state from disk
 */
export function loadTransferState(transferId: string): TransferState | null {
  const fs = require("fs");
  const path = require("path");
  
  const stateDir = getTransferStateDir();
  const stateFile = path.join(stateDir, `${transferId}.json`);
  
  try {
    if (!fs.existsSync(stateFile)) {
      return null;
    }
    
    const data = fs.readFileSync(stateFile, "utf8");
    return JSON.parse(data) as TransferState;
  } catch (error) {
    console.error(`Failed to load transfer state: ${error}`);
    return null;
  }
}

/**
 * List all transfer states
 */
export function listTransferStates(): TransferState[] {
  const fs = require("fs");
  const path = require("path");
  
  const stateDir = getTransferStateDir();
  
  try {
    if (!fs.existsSync(stateDir)) {
      return [];
    }
    
    const files = fs.readdirSync(stateDir).filter((f: string) => f.endsWith(".json"));
    const states: TransferState[] = [];
    
    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(stateDir, file), "utf8");
        states.push(JSON.parse(data) as TransferState);
      } catch (error) {
        console.error(`Failed to read state file ${file}: ${error}`);
      }
    }
    
    return states;
  } catch (error) {
    console.error(`Failed to list transfer states: ${error}`);
    return [];
  }
}

/**
 * Delete transfer state
 */
export function deleteTransferState(transferId: string): void {
  const fs = require("fs");
  const path = require("path");
  
  const stateDir = getTransferStateDir();
  const stateFile = path.join(stateDir, `${transferId}.json`);
  
  try {
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
    }
  } catch (error) {
    console.error(`Failed to delete transfer state: ${error}`);
  }
}

/**
 * Clean old transfer states (older than 7 days)
 */
export function cleanOldTransferStates(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const fs = require("fs");
  const path = require("path");
  
  const stateDir = getTransferStateDir();
  
  try {
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
  } catch (error) {
    console.error(`Failed to clean old transfer states: ${error}`);
    return 0;
  }
}
