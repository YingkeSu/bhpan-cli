import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { takeMoveOptions, takeReadOptions, takeRmOptions } from "../src/cli-options.ts";
import { printList } from "../src/shell.ts";

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
