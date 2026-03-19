import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  buildUploadPlan,
  buildDownloadPlan,
  type ListDirFn,
  type UploadPlanFile,
  type DownloadPlanFile,
} from "../src/transfer-plan.ts";

describe("buildUploadPlan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhpan-upload-plan-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty plan for non-existent path", () => {
    const plan = buildUploadPlan(path.join(tempDir, "nonexistent"), "/remote");
    assert.equal(plan.files.length, 0);
    assert.equal(plan.totalSize, 0);
  });

  it("creates plan for single file", () => {
    const filePath = path.join(tempDir, "test.txt");
    fs.writeFileSync(filePath, "hello world");

    const plan = buildUploadPlan(filePath, "/remote");

    assert.equal(plan.files.length, 1);
    assert.equal(plan.files[0].localPath, filePath);
    assert.equal(plan.files[0].remotePath, "/remote/test.txt");
    assert.equal(plan.files[0].size, 11);
    assert.equal(plan.totalSize, 11);
  });

  it("creates plan for directory with files", () => {
    const dirPath = path.join(tempDir, "mydir");
    fs.mkdirSync(path.join(dirPath, "subdir"), { recursive: true });
    fs.writeFileSync(path.join(dirPath, "file1.txt"), "content1");
    fs.writeFileSync(path.join(dirPath, "subdir", "file2.txt"), "content22");

    const plan = buildUploadPlan(dirPath, "/remote");

    assert.equal(plan.files.length, 2);
    assert.equal(plan.totalSize, 8 + 9);

    const paths = plan.files.map((f) => f.remotePath);
    assert.ok(paths.includes("/remote/mydir/file1.txt"));
    assert.ok(paths.includes("/remote/mydir/subdir/file2.txt"));
  });

  it("sorts files by local path", () => {
    fs.writeFileSync(path.join(tempDir, "zebra.txt"), "z");
    fs.writeFileSync(path.join(tempDir, "alpha.txt"), "a");
    fs.writeFileSync(path.join(tempDir, "middle.txt"), "m");

    const plan = buildUploadPlan(tempDir, "/remote");

    assert.ok(plan.files[0].localPath.endsWith("alpha.txt"));
    assert.ok(plan.files[1].localPath.endsWith("middle.txt"));
    assert.ok(plan.files[2].localPath.endsWith("zebra.txt"));
  });

  it("applies filter function", () => {
    fs.writeFileSync(path.join(tempDir, "include.txt"), "yes");
    fs.writeFileSync(path.join(tempDir, "exclude.log"), "no");

    const plan = buildUploadPlan(tempDir, "/remote", {
      filter: (p) => p.endsWith(".txt"),
    });

    assert.equal(plan.files.length, 1);
    assert.equal(plan.files[0].localPath.endsWith("include.txt"), true);
  });

  it("calculates total size correctly", () => {
    fs.writeFileSync(path.join(tempDir, "small.txt"), "x");
    fs.writeFileSync(path.join(tempDir, "large.txt"), "xxxxx");

    const plan = buildUploadPlan(tempDir, "/remote");

    assert.equal(plan.totalSize, 6);
  });

  it("normalizes remote dir path", () => {
    const filePath = path.join(tempDir, "test.txt");
    fs.writeFileSync(filePath, "content");

    const plan = buildUploadPlan(filePath, "/remote/dir/");

    assert.equal(plan.files[0].remotePath, "/remote/dir/test.txt");
  });

  it("preserves source directory name in remote path", () => {
    const srcDir = path.join(tempDir, "photos");
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, "image.jpg"), "binary");

    const plan = buildUploadPlan(srcDir, "/backup");

    assert.equal(plan.files.length, 1);
    assert.equal(plan.files[0].remotePath, "/backup/photos/image.jpg");
  });
});

describe("buildDownloadPlan", () => {
  it("returns empty plan for empty directory", async () => {
    const listDir: ListDirFn = async () => ({ dirs: [], files: [] });

    const plan = await buildDownloadPlan("/remote", "/local", listDir, {
      getRootInfo: async () => ({ docid: "root-doc", size: -1 }),
    });

    assert.equal(plan.files.length, 0);
    assert.equal(plan.totalSize, 0);
  });

  it("creates plan for single file", async () => {
    const listDir: ListDirFn = async () => ({ dirs: [], files: [] });

    const plan = await buildDownloadPlan("/remote/file.txt", "/local", listDir, {
      getRootInfo: async () => ({ docid: "file-doc", size: 100 }),
    });

    assert.equal(plan.files.length, 1);
    assert.equal(plan.files[0].docid, "file-doc");
    assert.equal(plan.files[0].remotePath, "/remote/file.txt");
    assert.ok(plan.files[0].localPath.endsWith("file.txt"));
    assert.equal(plan.files[0].size, 100);
    assert.equal(plan.totalSize, 100);
  });

  it("creates plan for directory with nested files", async () => {
    const listDir: ListDirFn = async (docid: string) => {
      if (docid === "root-doc") {
        return {
          dirs: [{ name: "subdir", docid: "subdir-doc", size: -1 }],
          files: [{ name: "file1.txt", docid: "file1-doc", size: 50 }],
        };
      }
      if (docid === "subdir-doc") {
        return {
          dirs: [],
          files: [{ name: "file2.txt", docid: "file2-doc", size: 75 }],
        };
      }
      return { dirs: [], files: [] };
    };

    const plan = await buildDownloadPlan("/remote", "/local", listDir, {
      getRootInfo: async () => ({ docid: "root-doc", size: -1 }),
    });

    assert.equal(plan.files.length, 2);
    assert.equal(plan.totalSize, 125);

    const paths = plan.files.map((f) => f.remotePath);
    assert.ok(paths.includes("/remote/file1.txt"));
    assert.ok(paths.includes("/remote/subdir/file2.txt"));
  });

  it("sorts files by remote path", async () => {
    const listDir: ListDirFn = async () => ({
      dirs: [],
      files: [
        { name: "zebra.txt", docid: "z-doc", size: 1 },
        { name: "alpha.txt", docid: "a-doc", size: 1 },
        { name: "middle.txt", docid: "m-doc", size: 1 },
      ],
    });

    const plan = await buildDownloadPlan("/remote", "/local", listDir, {
      getRootInfo: async () => ({ docid: "root-doc", size: -1 }),
    });

    assert.equal(plan.files[0].remotePath, "/remote/alpha.txt");
    assert.equal(plan.files[1].remotePath, "/remote/middle.txt");
    assert.equal(plan.files[2].remotePath, "/remote/zebra.txt");
  });

  it("applies filter function", async () => {
    const listDir: ListDirFn = async () => ({
      dirs: [],
      files: [
        { name: "include.txt", docid: "txt-doc", size: 10 },
        { name: "exclude.log", docid: "log-doc", size: 20 },
      ],
    });

    const plan = await buildDownloadPlan("/remote", "/local", listDir, {
      getRootInfo: async () => ({ docid: "root-doc", size: -1 }),
      filter: (p) => p.endsWith(".txt"),
    });

    assert.equal(plan.files.length, 1);
    assert.equal(plan.files[0].remotePath, "/remote/include.txt");
    assert.equal(plan.totalSize, 10);
  });

  it("returns empty plan when getRootInfo returns null", async () => {
    const listDir: ListDirFn = async () => ({ dirs: [], files: [] });

    const plan = await buildDownloadPlan("/remote", "/local", listDir, {
      getRootInfo: async () => null,
    });

    assert.equal(plan.files.length, 0);
  });
});
