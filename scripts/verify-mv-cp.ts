import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BhpanClient } from "../src/client.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量: ${name}`);
  }
  return value;
}

async function readText(client: BhpanClient, remotePath: string): Promise<string> {
  const info = await client.mustStat(remotePath);
  const buffer = await client.api.readFileBuffer(info.docid);
  return buffer.toString("utf8");
}

async function assertText(client: BhpanClient, remotePath: string, expected: string): Promise<void> {
  const actual = await readText(client, remotePath);
  if (actual !== expected) {
    throw new Error(`文件内容不符合预期: ${remotePath}`);
  }
}

async function assertMissing(client: BhpanClient, remotePath: string): Promise<void> {
  const info = await client.stat(remotePath);
  if (info) {
    throw new Error(`路径应不存在: ${remotePath}`);
  }
}

async function main(): Promise<void> {
  const username = process.env.BHPAN_USERNAME || process.env.NetID || requireEnv("NetID");
  const password = process.env.BHPAN_PASSWORD || process.env.Password || requireEnv("Password");
  const remoteBase = process.env.BHPAN_VERIFY_BASE || "/home/code";
  const client = await BhpanClient.create({ username, password, validate: true });
  await client.persist();

  const unique = `bhpan_mv_cp_${Date.now()}`;
  const remoteRoot = path.posix.join(remoteBase, unique);
  const localRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bhpan-mvcp-"));
  const files = {
    alpha: path.join(localRoot, "alpha.txt"),
    oldConflict: path.join(localRoot, "old-conflict.txt"),
    newConflict: path.join(localRoot, "new-conflict.txt"),
    oldMove: path.join(localRoot, "old-move.txt"),
    newMove: path.join(localRoot, "new-move.txt"),
  };

  fs.writeFileSync(files.alpha, "alpha\n", "utf8");
  fs.writeFileSync(files.oldConflict, "old-conflict\n", "utf8");
  fs.writeFileSync(files.newConflict, "new-conflict\n", "utf8");
  fs.writeFileSync(files.oldMove, "old-move\n", "utf8");
  fs.writeFileSync(files.newMove, "new-move\n", "utf8");

  try {
    await client.mkdir(remoteRoot);
    await client.mkdir(`${remoteRoot}/src`);
    await client.mkdir(`${remoteRoot}/dst`);

    await client.upload(files.alpha, remoteRoot);

    await client.upload(files.oldConflict, `${remoteRoot}/dst`);
    await client.mv(`${remoteRoot}/dst/${path.basename(files.oldConflict)}`, `${remoteRoot}/dst/conflict.txt`, false, false);
    await client.upload(files.newConflict, `${remoteRoot}/src`);
    await client.mv(`${remoteRoot}/src/${path.basename(files.newConflict)}`, `${remoteRoot}/src/conflict.txt`, false, false);

    await client.upload(files.oldMove, `${remoteRoot}/dst`);
    await client.mv(`${remoteRoot}/dst/${path.basename(files.oldMove)}`, `${remoteRoot}/dst/move.txt`, false, false);
    await client.upload(files.newMove, `${remoteRoot}/src`);
    await client.mv(`${remoteRoot}/src/${path.basename(files.newMove)}`, `${remoteRoot}/src/move.txt`, false, false);

    await client.mv(`${remoteRoot}/alpha.txt`, `${remoteRoot}/alpha-copy.txt`, false, true);
    await assertText(client, `${remoteRoot}/alpha.txt`, "alpha\n");
    await assertText(client, `${remoteRoot}/alpha-copy.txt`, "alpha\n");

    await client.mv(`${remoteRoot}/alpha-copy.txt`, `${remoteRoot}/dst/renamed.txt`, false, false);
    await assertMissing(client, `${remoteRoot}/alpha-copy.txt`);
    await assertText(client, `${remoteRoot}/dst/renamed.txt`, "alpha\n");

    await client.mv(`${remoteRoot}/src/conflict.txt`, `${remoteRoot}/dst`, true, true);
    await assertText(client, `${remoteRoot}/dst/conflict.txt`, "new-conflict\n");
    await assertText(client, `${remoteRoot}/src/conflict.txt`, "new-conflict\n");
    const copiedList = await client.list(`${remoteRoot}/dst`);
    const conflictNames = copiedList.files.map((entry) => entry.name).filter((name) => name.startsWith("conflict"));
    if (conflictNames.length !== 1 || conflictNames[0] !== "conflict.txt") {
      throw new Error(`复制覆盖结果异常: ${conflictNames.join(", ")}`);
    }

    await client.mv(`${remoteRoot}/src/move.txt`, `${remoteRoot}/dst`, true, false);
    await assertMissing(client, `${remoteRoot}/src/move.txt`);
    await assertText(client, `${remoteRoot}/dst/move.txt`, "new-move\n");

    let sameMoveError = "";
    try {
      await client.mv(`${remoteRoot}/alpha.txt`, `${remoteRoot}/alpha.txt`, false, false);
    } catch (error) {
      sameMoveError = error instanceof Error ? error.message : String(error);
    }
    if (!sameMoveError.includes("相同")) {
      throw new Error(`移动同路径的报错不符合预期: ${sameMoveError || "<empty>"}`);
    }

    let sameCopyError = "";
    try {
      await client.mv(`${remoteRoot}/alpha.txt`, `${remoteRoot}/alpha.txt`, false, true);
    } catch (error) {
      sameCopyError = error instanceof Error ? error.message : String(error);
    }
    if (!sameCopyError.includes("相同")) {
      throw new Error(`复制同路径的报错不符合预期: ${sameCopyError || "<empty>"}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          remoteRoot,
          verified: [
            "same-parent copy preserves source",
            "cross-directory move with rename",
            "cp into existing directory with -f overwrites same-name file",
            "mv into existing directory with -f overwrites same-name file",
            "same-path guard for mv/cp",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      await client.rm(remoteRoot, true);
    } catch (error) {
      console.error(`cleanup remote failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    fs.rmSync(localRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
