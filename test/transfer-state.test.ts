import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  generateTransferId,
  getTransferStateDir,
  saveTransferState,
  loadTransferState,
  listTransferStates,
  deleteTransferState,
  cleanOldTransferStates,
  type TransferState,
} from "../src/transfer-state.ts";

describe("transfer-state", () => {
  let tempDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhpan-test-"));
    originalEnv = process.env.BHPAN_TRANSFER_STATE;
    process.env.BHPAN_TRANSFER_STATE = tempDir;
  });

  afterEach(() => {
    process.env.BHPAN_TRANSFER_STATE = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getTransferStateDir", () => {
    it("returns BHPAN_TRANSFER_STATE env var when set", () => {
      assert.equal(getTransferStateDir(), tempDir);
    });
  });

  describe("generateTransferId", () => {
    it("generates unique IDs", () => {
      const id1 = generateTransferId();
      const id2 = generateTransferId();
      assert.notEqual(id1, id2);
    });

    it("starts with 'transfer_'", () => {
      const id = generateTransferId();
      assert.ok(id.startsWith("transfer_"));
    });

    it("includes timestamp", () => {
      const before = Date.now();
      const id = generateTransferId();
      const after = Date.now();
      const timestampMatch = id.match(/transfer_(\d+)_/);
      assert.ok(timestampMatch);
      const timestamp = parseInt(timestampMatch[1], 10);
      assert.ok(timestamp >= before && timestamp <= after);
    });
  });

  describe("saveTransferState and loadTransferState", () => {
    it("saves and loads state correctly", () => {
      const state: TransferState = {
        id: generateTransferId(),
        type: "upload",
        startTime: Date.now(),
        files: [
          { localPath: "/local/file.txt", remotePath: "/remote/file.txt", size: 100, uploaded: false },
        ],
        currentIndex: 0,
        totalSize: 100,
        uploadedSize: 0,
        status: "in_progress",
      };

      saveTransferState(state);
      const loaded = loadTransferState(state.id);

      assert.deepEqual(loaded, state);
    });

    it("returns null for non-existent state", () => {
      const loaded = loadTransferState("non_existent_id");
      assert.equal(loaded, null);
    });

    it("preserves all state fields", () => {
      const state: TransferState = {
        id: generateTransferId(),
        type: "download",
        startTime: 1234567890,
        files: [
          { localPath: "/a/b.txt", remotePath: "/x/y.txt", size: 500, uploaded: true, checksum: "abc123" },
          { localPath: "/c/d.txt", remotePath: "/z/w.txt", size: 300, uploaded: false },
        ],
        currentIndex: 1,
        totalSize: 800,
        uploadedSize: 500,
        status: "paused",
        error: "some error message",
      };

      saveTransferState(state);
      const loaded = loadTransferState(state.id);

      assert.equal(loaded?.id, state.id);
      assert.equal(loaded?.type, state.type);
      assert.equal(loaded?.startTime, state.startTime);
      assert.equal(loaded?.files.length, 2);
      assert.equal(loaded?.files[0].checksum, "abc123");
      assert.equal(loaded?.currentIndex, 1);
      assert.equal(loaded?.totalSize, 800);
      assert.equal(loaded?.uploadedSize, 500);
      assert.equal(loaded?.status, "paused");
      assert.equal(loaded?.error, "some error message");
    });

    it("creates state directory if it doesn't exist", () => {
      const newDir = path.join(tempDir, "subdir", "nested");
      process.env.BHPAN_TRANSFER_STATE = newDir;

      const state: TransferState = {
        id: generateTransferId(),
        type: "upload",
        startTime: Date.now(),
        files: [],
        currentIndex: 0,
        totalSize: 0,
        uploadedSize: 0,
        status: "in_progress",
      };

      saveTransferState(state);
      assert.ok(fs.existsSync(newDir));
    });
  });

  describe("listTransferStates", () => {
    it("returns empty array when no states exist", () => {
      const states = listTransferStates();
      assert.deepEqual(states, []);
    });

    it("lists all saved states", () => {
      const state1: TransferState = {
        id: generateTransferId(),
        type: "upload",
        startTime: Date.now(),
        files: [],
        currentIndex: 0,
        totalSize: 0,
        uploadedSize: 0,
        status: "in_progress",
      };
      const state2: TransferState = {
        id: generateTransferId(),
        type: "download",
        startTime: Date.now(),
        files: [],
        currentIndex: 0,
        totalSize: 0,
        uploadedSize: 0,
        status: "completed",
      };

      saveTransferState(state1);
      saveTransferState(state2);

      const states = listTransferStates();
      assert.equal(states.length, 2);
      const ids = states.map((s) => s.id);
      assert.ok(ids.includes(state1.id));
      assert.ok(ids.includes(state2.id));
    });
  });

  describe("deleteTransferState", () => {
    it("deletes existing state", () => {
      const state: TransferState = {
        id: generateTransferId(),
        type: "upload",
        startTime: Date.now(),
        files: [],
        currentIndex: 0,
        totalSize: 0,
        uploadedSize: 0,
        status: "in_progress",
      };

      saveTransferState(state);
      assert.ok(loadTransferState(state.id));

      deleteTransferState(state.id);
      assert.equal(loadTransferState(state.id), null);
    });

    it("does not throw for non-existent state", () => {
      assert.doesNotThrow(() => {
        deleteTransferState("non_existent_id");
      });
    });
  });

  describe("cleanOldTransferStates", () => {
    it("removes states older than maxAgeMs", async () => {
      const state: TransferState = {
        id: generateTransferId(),
        type: "upload",
        startTime: Date.now(),
        files: [],
        currentIndex: 0,
        totalSize: 0,
        uploadedSize: 0,
        status: "in_progress",
      };

      saveTransferState(state);
      
      // Set file mtime to 8 days ago
      const stateFile = path.join(tempDir, `${state.id}.json`);
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      fs.utimesSync(stateFile, new Date(eightDaysAgo), new Date(eightDaysAgo));

      const cleaned = cleanOldTransferStates(7 * 24 * 60 * 60 * 1000);
      assert.equal(cleaned, 1);
      assert.equal(loadTransferState(state.id), null);
    });

    it("keeps states newer than maxAgeMs", () => {
      const state: TransferState = {
        id: generateTransferId(),
        type: "upload",
        startTime: Date.now(),
        files: [],
        currentIndex: 0,
        totalSize: 0,
        uploadedSize: 0,
        status: "in_progress",
      };

      saveTransferState(state);

      const cleaned = cleanOldTransferStates(7 * 24 * 60 * 60 * 1000);
      assert.equal(cleaned, 0);
      assert.ok(loadTransferState(state.id));
    });

    it("returns 0 when state directory doesn't exist", () => {
      process.env.BHPAN_TRANSFER_STATE = path.join(tempDir, "non_existent");
      const cleaned = cleanOldTransferStates(7 * 24 * 60 * 60 * 1000);
      assert.equal(cleaned, 0);
    });
  });
});
