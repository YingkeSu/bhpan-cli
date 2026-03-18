import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePrompt } from "../src/shell.ts";

describe("prompt rendering", () => {
  it("includes username and cwd in prompt", () => {
    const res = computePrompt({ username: "alice", cwd: "/home", lastStatus: true, tty: true, noColor: false });
    assert.equal(res, "bhpan<alice>:/home$ \x1b[32m✓\x1b[0m");
  });

  it("applies ANSI colors when TTY and NO_COLOR not set", () => {
    const res = computePrompt({ username: "alice", cwd: "/home", lastStatus: null, tty: true, noColor: false });
    assert.match(res, /^bhpan<alice>:\/home\$ \x1b\[33m\?/);
  });

  it("NO_COLOR env var disables colors", () => {
    const res = computePrompt({ username: "alice", cwd: "/home", lastStatus: true, tty: true, noColor: true });
    assert.equal(res, "bhpan<alice>:/home$ ✓");
  });
});
