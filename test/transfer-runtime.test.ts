import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BhpanClient } from "../src/client.ts";
import { ApiError } from "../src/network.ts";
import { loadTransferState, saveTransferState, type TransferState } from "../src/transfer-state.ts";

describe("transfer runtime", () => {
  let tempDir: string;
  let originalTransferStateDir: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhpan-transfer-runtime-"));
    originalTransferStateDir = process.env.BHPAN_TRANSFER_STATE;
    process.env.BHPAN_TRANSFER_STATE = path.join(tempDir, "state");
  });

  afterEach(() => {
    process.env.BHPAN_TRANSFER_STATE = originalTransferStateDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("recreates planned upload directories even when they are empty", async () => {
    const sourceDir = path.join(tempDir, "archive");
    fs.mkdirSync(path.join(sourceDir, "empty", "nested"), { recursive: true });

    const mkdirCalls: string[] = [];
    const client: any = new (BhpanClient as any)({} as any, {});
    client.mustStat = async () => ({ docid: "dir-doc", size: -1, name: "remote" });
    client.mkdir = async (remotePath: string) => {
      mkdirCalls.push(remotePath);
    };

    const result = await client.upload(sourceDir, "/remote", { persistState: false });

    assert.deepEqual(result.results, []);
    assert.deepEqual(mkdirCalls, [
      "/remote/archive",
      "/remote/archive/empty",
      "/remote/archive/empty/nested",
    ]);
  });

  it("resumes upload from saved state and skips completed files", async () => {
    const sourceDir = path.join(tempDir, "photos");
    fs.mkdirSync(sourceDir);
    const firstFile = path.join(sourceDir, "a.txt");
    const secondFile = path.join(sourceDir, "b.txt");
    fs.writeFileSync(firstFile, "a");
    fs.writeFileSync(secondFile, "b");

    const state: TransferState = {
      id: "transfer_upload_resume",
      type: "upload",
      startTime: Date.now(),
      directories: ["/remote/photos"],
      files: [
        { localPath: firstFile, remotePath: "/remote/photos/a.txt", size: 1, uploaded: true },
        { localPath: secondFile, remotePath: "/remote/photos/b.txt", size: 1, uploaded: false },
      ],
      currentIndex: 1,
      totalSize: 2,
      uploadedSize: 1,
      status: "failed",
      error: "temporary failure",
    };
    saveTransferState(state);

    const uploadCalls: Array<{ docid: string; name: string; localPath: string }> = [];
    const client: any = new (BhpanClient as any)({} as any, {
      uploadFile: async (docid: string, name: string, localPath: string) => {
        uploadCalls.push({ docid, name, localPath });
        return { docid: `uploaded-${name}`, name };
      },
    });
    client.mkdir = async () => {};
    client.mustStat = async (remotePath: string) => ({
      docid: `docid:${remotePath}`,
      size: -1,
      name: path.posix.basename(remotePath) || "/",
    });

    const result = await client.resumeUpload(state.id);

    assert.equal(result.transferId, state.id);
    assert.deepEqual(result.results, [{ docid: "uploaded-b.txt", name: "b.txt" }]);
    assert.deepEqual(uploadCalls, [{
      docid: "docid:/remote/photos",
      name: "b.txt",
      localPath: secondFile,
    }]);
    assert.equal(loadTransferState(state.id), null);
  });

  it("stores absolute local paths in saved upload state", async () => {
    const workDir = path.join(tempDir, "cwd");
    fs.mkdirSync(workDir);
    const localFile = path.join(workDir, "report.pdf");
    fs.writeFileSync(localFile, "content");

    const client: any = new (BhpanClient as any)({} as any, {
      uploadFile: async () => {
        throw new Error("upload failed");
      },
    });
    client.mustStat = async () => ({ docid: "dir-doc", size: -1, name: "remote" });
    client.mkdir = async () => {};

    const previousCwd = process.cwd();
    let errorMessage = "";
    try {
      process.chdir(workDir);
      await client.upload("./report.pdf", "/remote");
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      process.chdir(previousCwd);
    }

    const transferId = errorMessage.match(/--resume (\S+)/)?.[1];
    assert.ok(transferId);
    const state = loadTransferState(transferId!);
    assert.ok(state);
    assert.equal(state?.files[0].localPath, localFile);
  });

  it("falls back to non-resumable mode when state persistence fails", async () => {
    const stateBlocker = path.join(tempDir, "state-blocker");
    fs.writeFileSync(stateBlocker, "blocked");
    process.env.BHPAN_TRANSFER_STATE = stateBlocker;

    const localFile = path.join(tempDir, "note.txt");
    fs.writeFileSync(localFile, "hello");

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(" "));
    };

    try {
      const uploadCalls: Array<{ docid: string; name: string; localPath: string }> = [];
      const client: any = new (BhpanClient as any)({} as any, {
        uploadFile: async (docid: string, name: string, uploadPath: string) => {
          uploadCalls.push({ docid, name, localPath: uploadPath });
          return { docid: "uploaded-doc", name };
        },
      });
      client.mustStat = async () => ({ docid: "dir-doc", size: -1, name: "remote" });
      client.mkdir = async () => {};

      const result = await client.upload(localFile, "/remote");

      assert.deepEqual(result.results, [{ docid: "uploaded-doc", name: "note.txt" }]);
      assert.deepEqual(uploadCalls, [{
        docid: "dir-doc",
        name: "note.txt",
        localPath: localFile,
      }]);
      assert.ok(warnings.some((warning) => warning.includes("无法保存传输状态")));
    } finally {
      console.warn = originalWarn;
    }
  });

  it("stores absolute local paths in saved download state", async () => {
    const workDir = path.join(tempDir, "download-cwd");
    fs.mkdirSync(workDir);

    const client: any = new (BhpanClient as any)({} as any, {
      downloadFile: async () => {
        throw new Error("download failed");
      },
    });
    client.mustStat = async () => ({ docid: "file-doc", size: 7, name: "report.pdf" });

    const previousCwd = process.cwd();
    let errorMessage = "";
    try {
      process.chdir(workDir);
      await client.download("/remote/report.pdf", ".");
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      process.chdir(previousCwd);
    }

    const transferId = errorMessage.match(/--resume (\S+)/)?.[1];
    assert.ok(transferId);
    const state = loadTransferState(transferId!);
    assert.ok(state);
    assert.equal(state?.files[0].localPath, path.join(workDir, "report.pdf"));
  });

  it("deletes stale state after a later persistence write failure", async () => {
    const localFile = path.join(tempDir, "resume-note.txt");
    fs.writeFileSync(localFile, "hello");

    const originalWriteFileSync = fs.writeFileSync;
    let stateWriteCount = 0;
    fs.writeFileSync = ((...args: any[]) => {
      const [filePath] = args;
      if (typeof filePath === "string" && filePath.endsWith(".json")) {
        stateWriteCount += 1;
        if (stateWriteCount === 2) {
          throw new Error("state write failed");
        }
      }
      return (originalWriteFileSync as any)(...args);
    }) as any;

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(" "));
    };

    try {
      const client: any = new (BhpanClient as any)({} as any, {
        uploadFile: async (docid: string, name: string) => ({ docid: `uploaded-${docid}`, name }),
      });
      client.mustStat = async () => ({ docid: "dir-doc", size: -1, name: "remote" });
      client.mkdir = async () => {};

      const result = await client.upload(localFile, "/remote");

      assert.ok(result.transferId);
      assert.equal(loadTransferState(result.transferId!), null);
      assert.ok(warnings.some((warning) => warning.includes("无法保存传输状态")));
    } finally {
      fs.writeFileSync = originalWriteFileSync;
      console.warn = originalWarn;
    }
  });

  it("retries download operations and deletes saved state after success", async () => {
    const destinationDir = path.join(tempDir, "downloads");
    let downloadCalls = 0;

    const client: any = new (BhpanClient as any)({} as any, {
      listDir: async (docid: string) => {
        if (docid === "root-doc") {
          return {
            dirs: [],
            files: [{ name: "file.txt", docid: "file-doc", size: 5 }],
          };
        }
        return { dirs: [], files: [] };
      },
      downloadFile: async (docid: string, localPath: string) => {
        assert.equal(docid, "file-doc");
        downloadCalls += 1;
        if (downloadCalls === 1) {
          throw new ApiError("Service Unavailable", 503, {});
        }
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, "hello");
      },
    });
    client.mustStat = async (remotePath: string) => {
      if (remotePath === "/remote") {
        return { docid: "root-doc", size: -1, name: "remote" };
      }
      if (remotePath === "/remote/file.txt") {
        return { docid: "file-doc", size: 5, name: "file.txt" };
      }
      throw new Error(`unexpected path: ${remotePath}`);
    };

    const result = await client.download("/remote", destinationDir);

    assert.equal(downloadCalls, 2);
    assert.equal(fs.readFileSync(path.join(destinationDir, "remote", "file.txt"), "utf8"), "hello");
    assert.ok(result.transferId);
    assert.equal(loadTransferState(result.transferId!), null);
  });
});
