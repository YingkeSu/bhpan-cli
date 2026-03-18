import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { takeMoveOptions, takeReadOptions, takeRmOptions } from "../src/cli-options.ts";
import { completeShellLine, printList } from "../src/shell.ts";
import { filterTree, calculateStats, type TreeNode } from "../src/tree-format.ts";

describe("cli option parsing", () => {
  it("parses rm flags before path", () => {
    const args = ["-r", "/home/code"];
    assert.deepEqual(takeRmOptions(args), {
      target: "/home/code",
      recursive: true,
    });
  });

  it("parses head flags before path", () => {
    const args = ["-n", "5", "/home/code/readme.txt"];
    assert.deepEqual(takeReadOptions(args, "head"), {
      target: "/home/code/readme.txt",
      lines: 5,
    });
  });

  it("parses mv flags before positional args", () => {
    const args = ["-f", "/home/code/a.txt", "/home/code/b.txt"];
    assert.deepEqual(takeMoveOptions(args, "mv"), {
      src: "/home/code/a.txt",
      dst: "/home/code/b.txt",
      overwrite: true,
    });
  });

  it("rejects rm without an operand after removing flags", () => {
    assert.throws(() => takeRmOptions(["-r"]), /用法: rm <remote_path> \[-r\]/);
  });

  it("rejects head without a target after removing flags", () => {
    assert.throws(() => takeReadOptions(["-n", "5"], "head"), /用法: head <remote_file> \[-n lines\]/);
  });

  it("rejects mv without a destination after removing flags", () => {
    assert.throws(() => takeMoveOptions(["-f", "/home/code/a.txt"], "mv"), /用法: mv <src> <dst> \[-f\]/);
  });
});

describe("mv -f overwrite behavior (mocked)", () => {
  it("should overwrite destination directory when -f is provided", async () => {
    // Import BhpanClient and create a test instance via bypassing constructor
    // and then override mustStat/stat/api to simulate a directory overwrite scenario.
    const { BhpanClient } = await import("../src/client.ts");

    // Prepare a minimal mock API (methods are overridden by the test)
    const mockApi: any = {
      ensureToken: async () => {},
      copy: async (...args: any[]) => ({ docid: "doc-move", name: "srcDir" }),
      move: async (...args: any[]) => ({ docid: "doc-move", name: "srcDir" }),
      rename: async () => {},
      rm: async () => {},
      list: async () => ({ dirs: [], files: [] }),
      listDir: async () => ({ dirs: [], files: [] }),
      getResourceInfoByPath: async () => null,
    };

    // Bypass constructor by casting to any and creating an instance
    const client: any = new (BhpanClient as any)({} as any, mockApi);

    // Monkey-patch mustStat/stat to simulate directory overwrite scenario
    client.mustStat = async (p: string) => {
      if (p === "/srcDir") return { docid: "doc-src", size: -1, name: "srcDir" };
      if (p === "/dstDir") return { docid: "doc-dst", size: -1, name: "dstDir" };
      throw new Error(`unexpected mustStat path ${p}`);
    };
    client.stat = async (p: string) => {
      if (p === "/dstDir") return { docid: "doc-dst", size: -1, name: "dstDir" };
      if (p === "/dstDir/srcDir") return { docid: "doc-dst-src", size: -1, name: "srcDir" };
      return null;
    };

    // Spy on rm calls by overriding rm to push into a log
    const log: string[] = [];
    client.rm = async (path: string, recursive: boolean) => {
      log.push(`rm:${path}:${recursive}`);
    };

    // Call mv with -f (overwrite = true) into an existing destination directory
    await client.mv("/srcDir", "/dstDir", true, false);

    // Expect that the code tried to remove the existing destination directory before moving
    const hasRm = log.find((l) => l.startsWith("rm:/dstDir/srcDir"));
    if (!hasRm) {
      throw new Error("Expected rm to be called on the existing destination directory when -f is used");
    }
  });
});

describe("printList", () => {
  it("includes the requested directory in recursive output so depth 0 and regex can match it", async () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.join(" "));
    };

    try {
      const client = {
        async list() {
          return {
            target: {
              docid: "dir-root",
              name: "code",
              size: -1,
              modified: undefined,
            },
            dirs: [],
            files: [],
          };
        },
        async listRecursive() {
          return [];
        },
        formatDirEntries() {
          return [];
        },
      };

      await printList(client as any, "/home/code", {
        recursive: true,
        maxDepth: 0,
        regex: /^\/home\/code$/,
      });
    } finally {
      console.log = originalLog;
    }

    assert.equal(lines.length, 1);
    assert.match(lines[0], /\/home\/code$/);
  });
});

describe("shell completion", () => {
  it("completes command names for the first token", async () => {
    const [matches, token] = await completeShellLine("l", {
      cwd: "/home",
      listRemote: async () => ({ target: null, dirs: [], files: [] }),
    });

    assert.equal(token, "l");
    assert.deepEqual(matches, ["ls", "link", "logout"]);
  });

  it("completes remote paths using directory listing and appends slash for directories", async () => {
    const calls: string[] = [];
    const [matches, token] = await completeShellLine("ls /hom", {
      cwd: "/home",
      listRemote: async (remotePath) => {
        calls.push(remotePath);
        if (remotePath === "/") {
          return {
            target: { size: -1 },
            dirs: [{ name: "home" }],
            files: [{ name: "hosts" }],
          };
        }
        return { target: null, dirs: [], files: [] };
      },
    });

    assert.equal(token, "/hom");
    assert.deepEqual(calls, ["/"]);
    assert.deepEqual(matches, ["/home/"]);
  });

  it("returns file and directory candidates for relative path completion", async () => {
    const [matches, token] = await completeShellLine("ls do", {
      cwd: "/home",
      listRemote: async (remotePath) => {
        assert.equal(remotePath, "/home");
        return {
          target: { size: -1 },
          dirs: [{ name: "docs" }],
          files: [{ name: "docker.txt" }, { name: "readme.md" }],
        };
      },
    });

    assert.equal(token, "do");
    assert.deepEqual(matches, ["docker.txt", "docs/"]);
  });

  it("completes paths when flags precede the path argument", async () => {
    const [matches, token] = await completeShellLine("head -n 5 /hom", {
      cwd: "/home",
      listRemote: async (remotePath) => {
        assert.equal(remotePath, "/");
        return {
          target: { size: -1 },
          dirs: [{ name: "home" }],
          files: [],
        };
      },
    });

    assert.equal(token, "/hom");
    assert.deepEqual(matches, ["/home/"]);
  });

  it("completes second path for mv/cp commands", async () => {
    const [matches, token] = await completeShellLine("mv /src /ds", {
      cwd: "/home",
      listRemote: async (remotePath) => {
        assert.equal(remotePath, "/");
        return {
          target: { size: -1 },
          dirs: [{ name: "dst" }, { name: "home" }],
          files: [],
        };
      },
    });

    assert.equal(token, "/ds");
    assert.deepEqual(matches, ["/dst/"]);
  });
});

describe("tree enhancements", () => {
  it("should filter by type - files only", () => {
    const nodes: TreeNode[] = [
      { name: "dir1", dir: true, fullPath: "/dir1", children: [
        { name: "file1.txt", dir: false, fullPath: "/dir1/file1.txt" },
      ]},
      { name: "file2.txt", dir: false, fullPath: "/file2.txt" },
    ];
    const filtered = filterTree(nodes, { type: "f" });
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].name, "dir1");
    assert.equal(filtered[0].children?.length, 1);
    assert.equal(filtered[0].children?.[0].name, "file1.txt");
    assert.equal(filtered[1].name, "file2.txt");
  });

  it("should filter by type - dirs only", () => {
    const nodes: TreeNode[] = [
      { name: "dir1", dir: true, fullPath: "/dir1", children: [
        { name: "file1.txt", dir: false, fullPath: "/dir1/file1.txt" },
      ]},
      { name: "file2.txt", dir: false, fullPath: "/file2.txt" },
    ];
    const filtered = filterTree(nodes, { type: "d" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, "dir1");
    assert.equal(filtered[0].children?.length, 0);
  });

  it("should filter by exclude regex", () => {
    const nodes: TreeNode[] = [
      { name: "file1.pdf", dir: false, fullPath: "/file1.pdf", size: 100 },
      { name: "file2.txt", dir: false, fullPath: "/file2.txt", size: 200 },
    ];
    const filtered = filterTree(nodes, { excludeRegex: /\.pdf$/ });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, "file2.txt");
  });

  it("should apply both include and exclude regex", () => {
    const nodes: TreeNode[] = [
      { name: "file1.pdf", dir: false, fullPath: "/file1.pdf", size: 100 },
      { name: "file2.txt", dir: false, fullPath: "/file2.txt", size: 200 },
      { name: "file3.log", dir: false, fullPath: "/file3.log", size: 50 },
    ];
    const filtered = filterTree(nodes, {
      includeRegex: /file[123]/,
      excludeRegex: /\.pdf$/,
    });
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].name, "file2.txt");
    assert.equal(filtered[1].name, "file3.log");
  });

  it("should calculate stats correctly", () => {
    const nodes: TreeNode[] = [
      { name: "dir1", dir: true, fullPath: "/dir1", children: [
        { name: "file1.txt", dir: false, fullPath: "/dir1/file1.txt", size: 100 },
        { name: "file2.txt", dir: false, fullPath: "/dir1/file2.txt", size: 200 },
      ]},
      { name: "file3.txt", dir: false, fullPath: "/file3.txt", size: 50 },
    ];
    const stats = calculateStats(nodes);
    assert.equal(stats.dirs, 1);
    assert.equal(stats.files, 3);
    assert.equal(stats.totalSize, 350);
  });

  it("should calculate stats with type filter", () => {
    const nodes: TreeNode[] = [
      { name: "dir1", dir: true, fullPath: "/dir1", children: [
        { name: "file1.txt", dir: false, fullPath: "/dir1/file1.txt", size: 100 },
      ]},
      { name: "file2.pdf", dir: false, fullPath: "/file2.pdf", size: 200 },
    ];
    const filtered = filterTree(nodes, { type: "f" });
    const stats = calculateStats(filtered);
    assert.equal(stats.dirs, 1);
    assert.equal(stats.files, 2);
    assert.equal(stats.totalSize, 300);
  });
});
