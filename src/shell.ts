import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { takeBooleanFlag, takeIntegerFlag, takeLinkTypeFlag, takeNumberFlag, takeTreeOptions } from "./cli-options.ts";
import { BhpanClient, clearCredentials, resolveRemotePath } from "./client.ts";
import { loadConfig, saveConfig } from "./config.ts";
import type { LinkInfo } from "./types.ts";
import { formatSize, formatTimestamp } from "./utils.ts";

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output, terminal: true });
    const onData = (char: Buffer) => {
      const text = char.toString();
      if (text !== "\n" && text !== "\r" && text !== "\u0004") {
        output.write("*");
      }
    };
    input.on("data", onData);
    rl.question(question).then((answer) => {
      input.off("data", onData);
      output.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}

export class PanShell {
  private cwd = "/home";
  private client: BhpanClient | null = null;

  async login(forceUsername?: string): Promise<void> {
    const config = loadConfig();
    const username = forceUsername || config.username || await prompt("账号: ");
    let password: string | undefined;
    if (!config.encrypted || forceUsername) {
      password = await promptHidden("密码: ");
    }
    const client = await BhpanClient.create({
      username,
      password,
      validate: true,
    });
    client.config.username = username;
    if (!client.config.storePassword) {
      client.config.encrypted = null;
    }
    saveConfig(client.config);
    this.client = client;
    await client.persist();
  }

  async run(): Promise<void> {
    await this.login();
    const rl = readline.createInterface({ input, output });
    try {
      while (true) {
        const line = (await rl.question(`bhpan:${this.cwd}$ `)).trim();
        if (!line) {
          continue;
        }
        const args = line.match(/"[^"]*"|'[^']*'|\S+/g)?.map((part) => part.replace(/^['"]|['"]$/g, "")) || [];
        const [command, ...rest] = args;
        try {
          await this.dispatch(command, rest);
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        throw error;
      }
    } finally {
      rl.close();
    }
  }

  private async dispatch(command: string, args: string[]): Promise<void> {
    const client = this.requireClient();
    switch (command) {
      case "help":
        this.printHelp();
        return;
      case "exit":
      case "quit":
        process.exit(0);
      case "pwd":
        console.log(this.cwd);
        return;
      case "cd": {
        const next = resolveRemotePath(this.cwd, args[0] || "/home");
        const info = await client.stat(next);
        if (!info || info.size !== -1) {
          throw new Error("目标不是目录");
        }
        this.cwd = next;
        return;
      }
      case "ls": {
        const target = resolveRemotePath(this.cwd, args[0] || ".");
        await printList(client, target);
        return;
      }
      case "stat": {
        const target = resolveRemotePath(this.cwd, args[0] || ".");
        await printStat(client, target);
        return;
      }
      case "mkdir":
        await client.mkdir(resolveRemotePath(this.cwd, args[0]));
        return;
      case "rm":
        await client.rm(resolveRemotePath(this.cwd, args[0]), args.includes("-r") || args.includes("--recursive"));
        return;
      case "cat":
        await client.cat(resolveRemotePath(this.cwd, args[0]), process.stdout);
        if (process.stdout.writable) {
          process.stdout.write("\n");
        }
        return;
      case "head":
        await client.head(resolveRemotePath(this.cwd, args[0]), takeNumberFlag(args, "-n", "--lines") ?? 10, process.stdout);
        return;
      case "tail":
        await client.tail(resolveRemotePath(this.cwd, args[0]), takeNumberFlag(args, "-n", "--lines") ?? 10, process.stdout);
        return;
      case "touch": {
        const created = await client.touch(resolveRemotePath(this.cwd, args[0]));
        console.log(`已创建: ${created.name}`);
        return;
      }
      case "tree": {
        const treeArgs = [...args];
        const treeOptions = takeTreeOptions(treeArgs);
        const target = resolveRemotePath(this.cwd, treeArgs[0] || ".");
        for (const line of await client.tree(target, treeOptions)) {
          console.log(line);
        }
        return;
      }
      case "upload":
        await printUploadResults(await client.upload(args[0], resolveRemotePath(this.cwd, args[1] || ".")), path.basename(args[0]));
        return;
      case "download":
        await client.download(resolveRemotePath(this.cwd, args[0]), args[1] || process.cwd());
        return;
      case "mv":
        await client.mv(resolveRemotePath(this.cwd, args[0]), resolveRemotePath(this.cwd, args[1]), args.includes("-f"), false);
        return;
      case "cp":
        await client.mv(resolveRemotePath(this.cwd, args[0]), resolveRemotePath(this.cwd, args[1]), args.includes("-f"), true);
        return;
      case "whoami": {
        const cfg = client.config;
        console.log(`host: ${cfg.host}`);
        console.log(`username: ${cfg.username || "-"}`);
        console.log(`stored-password: ${cfg.encrypted ? "yes" : "no"}`);
        return;
      }
      case "logout":
        clearCredentials();
        console.log("本地凭据已清除");
        process.exit(0);
      case "su":
        await this.login(args[0]);
        this.cwd = "/home";
        return;
      case "clear":
        console.clear();
        return;
      case "link":
        await this.handleLink(client, args);
        return;
      default:
        throw new Error(`未知命令: ${command}`);
    }
  }

  private requireClient(): BhpanClient {
    if (!this.client) {
      throw new Error("尚未登录");
    }
    return this.client;
  }

  private printHelp(): void {
    console.log(`可用命令:
  ls [path]
  cd [path]
  pwd
  tree [path] [-L depth] [--sort name|mtime|size] [--desc]
  stat <path>
  mkdir <path>
  rm <path> [-r]
  mv <src> <dst> [-f]
  cp <src> <dst> [-f]
  cat <file>
  head <file> [-n lines]
  tail <file> [-n lines]
  touch <file>
  link <show|create|delete> <path> [--type anonymous|realname|all] [--expires days] [-p] [--allow-upload] [--no-download]
  upload <local> [remote_dir]
  download <remote> [local_dir]
  whoami
  logout
  su [username]
  clear
  help
  exit`);
  }

  private async handleLink(client: BhpanClient, args: string[]): Promise<void> {
    const linkArgs = [...args];
    const action = linkArgs[0];
    const type = takeLinkTypeFlag(linkArgs, action !== "create") ?? (action === "create" ? "anonymous" : "all");
    const target = resolveRemotePath(this.cwd, linkArgs[1]);
    if (!action || !linkArgs[1]) {
      throw new Error("用法: link <show|create|delete> <path> [--type anonymous|realname|all] [--expires days] [-p] [--allow-upload] [--no-download]");
    }
    if (action === "show") {
      const links = await client.getLinks(target, type);
      if (!links.length) {
        console.log(`${target} 未开启外链`);
        return;
      }
      for (const link of links) {
        printLinkInfo(client.config.host, target, link);
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
      if (
        type === "realname" &&
        (usePassword || allowUpload || noDownload || rawArgs.includes("--expires"))
      ) {
        throw new Error("实名外链不支持 --expires、-p、--allow-upload、--no-download");
      }
      const link = await client.createOrUpdateLink(target, {
        shareType: type,
        expiresDays,
        usePassword,
        allowUpload,
        noDownload,
      });
      printLinkInfo(client.config.host, target, link);
      return;
    }
    if (action === "delete") {
      await client.deleteLink(target, type);
      console.log("外链已关闭");
      return;
    }
    throw new Error(`未知 link 子命令: ${action}`);
  }
}

export async function printList(client: BhpanClient, target: string): Promise<void> {
  const result = await client.list(target);
  if (!result.target) {
    throw new Error(`路径不存在: ${target}`);
  }
  if (result.target.size !== -1) {
    console.log(`${formatSize(result.target.size)} ${formatTimestamp(result.target.modified)} ${result.target.name}`);
    return;
  }
  for (const line of client.formatDirEntries(result.dirs, true)) {
    console.log(line);
  }
  for (const line of client.formatDirEntries(result.files, false)) {
    console.log(line);
  }
}

export async function printStat(client: BhpanClient, target: string): Promise<void> {
  const info = await client.mustStat(target);
  console.log(`path: ${target}`);
  console.log(`name: ${info.name}`);
  console.log(`docid: ${info.docid}`);
  console.log(`type: ${info.size === -1 ? "directory" : "file"}`);
  console.log(`size: ${info.size === -1 ? "-" : formatSize(info.size)}`);
  console.log(`modified: ${formatTimestamp(info.modified)}`);
}

function printUploadResults(results: Array<{ name: string }>, sourceName: string): void {
  if (!results.length) {
    return;
  }
  if (results.length === 1) {
    const [result] = results;
    if (result.name === sourceName) {
      console.log(`上传完成: ${result.name}`);
    } else {
      console.log(`上传完成: ${sourceName} -> ${result.name}`);
    }
    return;
  }
  console.log(`上传完成，共 ${results.length} 个文件`);
}

function printLinkInfo(host: string, target: string, info: LinkInfo | null): void {
  if (!info) {
    console.log(`${target} 未开启外链`);
    return;
  }
  console.log(target);
  console.log(`https://${host}/link/${info.id}`);
  if (info.password) {
    console.log(`password: ${info.password}`);
  }
  console.log(`type: ${info.type}`);
  console.log(`allow: ${info.item?.allow?.join(", ") || "-"}`);
  console.log(`expires_at: ${info.expires_at || "-"}`);
  console.log(`limited_times: ${info.limited_times ?? "-"}`);
  console.log(`accessed_times: ${info.accessed_times ?? "-"}`);
}
