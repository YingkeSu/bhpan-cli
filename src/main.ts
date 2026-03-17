#!/usr/bin/env node

import { BhpanClient, clearCredentials, resolveRemotePath } from "./client.ts";
import { takeBooleanFlag, takeFlag, takeIntegerFlag, takeLinkTypeFlag, takeNumberFlag, takeTreeOptions } from "./cli-options.ts";
import { loadConfig, saveConfig } from "./config.ts";
import { PanShell, printList, printStat } from "./shell.ts";

const VERSION = "0.1.2";

function printHelp(): void {
  console.log(`bhpan

用法:
  bhpan shell
  bhpan login [--username <name>] [--no-store-password]
  bhpan logout
  bhpan whoami
  bhpan ls [remote_path]
  bhpan tree [remote_path] [-L depth] [--sort name|mtime|size] [--desc]
  bhpan stat <remote_path>
  bhpan mkdir <remote_path>
  bhpan rm <remote_path> [-r]
  bhpan mv <src> <dst> [-f]
  bhpan cp <src> <dst> [-f]
  bhpan cat <remote_file>
  bhpan head <remote_file> [-n lines]
  bhpan tail <remote_file> [-n lines]
  bhpan touch <remote_file>
  bhpan link <show|create|delete> <remote_path> [--type anonymous|realname|all] [--expires days] [-p] [--allow-upload] [--no-download]
  bhpan upload <local_path> <remote_dir>
  bhpan download <remote_path> [local_dir]

说明:
  不带子命令时默认进入交互式 shell。
  远程路径支持 /home 逻辑别名。`);
}

async function doLogin(args: string[]): Promise<void> {
  const username = takeFlag(args, "--username");
  const noStorePassword = args.includes("--no-store-password");
  const shell = new PanShell();
  if (noStorePassword) {
    const config = loadConfig();
    config.storePassword = false;
    saveConfig(config);
  }
  await shell.login(username);
  console.log("登录成功");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "shell") {
    await new PanShell().run();
    return;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  if (command === "login") {
    await doLogin(args.slice(1));
    return;
  }

  if (command === "logout") {
    clearCredentials();
    console.log("本地凭据已清除");
    return;
  }

  const client = await BhpanClient.create({ validate: true });
  await client.persist();

  switch (command) {
    case "whoami":
      console.log(`host: ${client.config.host}`);
      console.log(`username: ${client.config.username || "-"}`);
      console.log(`stored-password: ${client.config.encrypted ? "yes" : "no"}`);
      return;
    case "ls":
      await printList(client, resolveRemotePath("/", args[1] || "/home"));
      return;
    case "tree": {
      const treeArgs = args.slice(1);
      const treeOptions = takeTreeOptions(treeArgs);
      const target = resolveRemotePath("/", treeArgs[0] || "/home");
      for (const line of await client.tree(target, treeOptions)) {
        console.log(line);
      }
      return;
    }
    case "stat":
      await printStat(client, resolveRemotePath("/", args[1]));
      return;
    case "mkdir":
      await client.mkdir(resolveRemotePath("/", args[1]));
      return;
    case "rm":
      await client.rm(resolveRemotePath("/", args[1]), args.includes("-r") || args.includes("--recursive"));
      return;
    case "cat":
      await client.cat(resolveRemotePath("/", args[1]), process.stdout);
      return;
    case "head":
      await client.head(resolveRemotePath("/", args[1]), takeNumberFlag(args, "-n", "--lines") ?? 10, process.stdout);
      return;
    case "tail":
      await client.tail(resolveRemotePath("/", args[1]), takeNumberFlag(args, "-n", "--lines") ?? 10, process.stdout);
      return;
    case "touch": {
      const created = await client.touch(resolveRemotePath("/", args[1]));
      console.log(created.name);
      return;
    }
    case "upload":
      for (const result of await client.upload(args[1], resolveRemotePath("/", args[2]))) {
        console.log(result.name);
      }
      return;
    case "download":
      await client.download(resolveRemotePath("/", args[1]), args[2] || process.cwd());
      return;
    case "mv":
      await client.mv(resolveRemotePath("/", args[1]), resolveRemotePath("/", args[2]), args.includes("-f"), false);
      return;
    case "cp":
      await client.mv(resolveRemotePath("/", args[1]), resolveRemotePath("/", args[2]), args.includes("-f"), true);
      return;
    case "link": {
      const linkArgs = args.slice(1);
      const action = linkArgs[0];
      const type = takeLinkTypeFlag(linkArgs, action !== "create") ?? (action === "create" ? "anonymous" : "all");
      const target = resolveRemotePath("/", linkArgs[1]);
      if (!action || !linkArgs[1]) {
        throw new Error("用法: bhpan link <show|create|delete> <remote_path> [--type anonymous|realname|all] [--expires days] [-p] [--allow-upload] [--no-download]");
      }
      if (action === "show") {
        const links = await client.getLinks(target, type);
        if (!links.length) {
          console.log(`${target} 未开启外链`);
          return;
        }
        for (const info of links) {
          console.log(`https://${client.config.host}/link/${info.id}`);
          if (info.password) {
            console.log(`password: ${info.password}`);
          }
          console.log(`type: ${info.type}`);
          console.log(`allow: ${info.item?.allow?.join(", ") || "-"}`);
          console.log(`expires_at: ${info.expires_at || "-"}`);
          console.log(`limited_times: ${info.limited_times ?? "-"}`);
          console.log(`accessed_times: ${info.accessed_times ?? "-"}`);
        }
        return;
      }
      if (action === "create") {
        const rawArgs = [...linkArgs];
        const usePassword = takeBooleanFlag(linkArgs, "-p", "--password");
        const allowUpload = takeBooleanFlag(linkArgs, "--allow-upload");
        const noDownload = takeBooleanFlag(linkArgs, "--no-download");
        const expiresDays = takeIntegerFlag(linkArgs, "--expires") ?? 30;
        if (type === "all") {
          throw new Error("link create 不支持 --type all");
        }
        if (type === "realname" && (usePassword || allowUpload || noDownload || rawArgs.includes("--expires"))) {
          throw new Error("实名外链不支持 --expires、-p、--allow-upload、--no-download");
        }
        const info = await client.createOrUpdateLink(target, {
          shareType: type,
          expiresDays,
          usePassword,
          allowUpload,
          noDownload,
        });
        console.log(`https://${client.config.host}/link/${info.id}`);
        if (info.password) {
          console.log(`password: ${info.password}`);
        }
        console.log(`type: ${info.type}`);
        return;
      }
      if (action === "delete") {
        await client.deleteLink(target, type);
        console.log("外链已关闭");
        return;
      }
      throw new Error("用法: bhpan link <show|create|delete> <remote_path> [--type anonymous|realname|all] [--expires days] [-p] [--allow-upload] [--no-download]");
    }
    default:
      printHelp();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
