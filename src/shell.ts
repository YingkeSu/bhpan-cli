import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  takeBooleanFlag,
  takeIntegerFlag,
  takeLinkTypeFlag,
  takeLsOptions,
  takeLinkLimitedTimes,
  takeLinkForever,
  takeLinkTitle,
  takeMoveOptions,
  takeReadOptions,
  takeRmOptions,
  takeTransferOptions,
  takeTreeOptions,
} from "./cli-options.ts";
import { BhpanClient, clearCredentials, resolveRemotePath } from "./client.ts";
import { loadConfig, saveConfig } from "./config.ts";
import { formatLsRecursive } from "./ls-format.ts";
import type { LinkInfo } from "./types.ts";
import { formatSize, formatTimestamp } from "./utils.ts";

const SHELL_COMMANDS = [
  "ls",
  "cd",
  "pwd",
  "tree",
  "stat",
  "mkdir",
  "rm",
  "cat",
  "head",
  "tail",
  "touch",
  "upload",
  "download",
  "mv",
  "cp",
  "link",
  "whoami",
  "logout",
  "su",
  "clear",
  "help",
  "exit",
  "quit",
] as const;

type CompletionEntry = { name: string };

type CompletionListResult = {
  target: { size: number } | null;
  dirs: CompletionEntry[];
  files: CompletionEntry[];
};

type ShellCompletionContext = {
  cwd: string;
  commands?: readonly string[];
  listRemote: (remotePath: string) => Promise<CompletionListResult>;
};

export async function completeShellLine(
  line: string,
  context: ShellCompletionContext,
): Promise<[string[], string]> {
  const commands = context.commands ?? SHELL_COMMANDS;
  const tokens = tokenizeCompletionLine(line);
  const currentToken = tokens[tokens.length - 1] ?? "";

  if (tokens.length <= 1) {
    const matches = commands.filter((command) => command.startsWith(currentToken));
    return [matches.length ? [...matches] : [...commands], currentToken];
  }

  const command = tokens[0] || "";
  const args = tokens.slice(1);
  const argumentIndex = countPositionalArgs(command, args);
  if (!isPathArgument(command, argumentIndex, currentToken)) {
    return [[], currentToken];
  }

  try {
    return [await completeRemotePath(currentToken, context), currentToken];
  } catch {
    return [[], currentToken];
  }
}

const VALUE_TAKING_FLAGS: Record<string, Set<string>> = {
  ls: new Set(["-L", "--depth", "--regex"]),
  tree: new Set(["-L", "--depth", "--sort", "--regex", "--exclude-regex", "--type", "-t"]),
  head: new Set(["-n"]),
  tail: new Set(["-n"]),
  link: new Set(["--type", "--expires", "--title", "--limited-times"]),
  upload: new Set(["--resume"]),
  download: new Set(["--resume"]),
};

function countPositionalArgs(command: string, args: string[]): number {
  const valueFlags = VALUE_TAKING_FLAGS[command] ?? new Set();
  let count = 0;
  let skipNext = false;

  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg.startsWith("-")) {
      if (valueFlags.has(arg)) {
        skipNext = true;
      }
      continue;
    }
    count++;
  }

  return Math.max(0, count - 1);
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function promptHidden(question: string): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return prompt(question);
  }
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    const wasPaused = input.isPaused();
    let answer = "";

    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(wasRaw);
      if (wasPaused) {
        input.pause();
      }
    };

    const finish = () => {
      output.write("\n");
      cleanup();
      resolve(answer.trim());
    };

    const fail = (error: Error) => {
      output.write("\n");
      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (char === "\r" || char === "\n") {
          finish();
          return;
        }
        if (char === "\u0003") {
          fail(new Error("已取消输入"));
          return;
        }
        if (char === "\u0004") {
          fail(new Error("输入已结束"));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (answer.length > 0) {
            answer = answer.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        if (char === "\u001b") {
          const sequence = text.slice(index).match(/^\u001b\[[0-9;?]*[ -/]*[@-~]/)?.[0];
          if (sequence) {
            index += sequence.length - 1;
          }
          continue;
        }
        if (char < " ") {
          continue;
        }
        answer += char;
        output.write("*");
      }
    };

    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

// Tracks the result of the last executed command to reflect in the prompt
// null = no command executed yet, true = last command succeeded, false = last command failed
export class PanShell {
  private cwd = "/home";
  private client: BhpanClient | null = null;
  private lastStatus: boolean | null = null;

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
    const rl = readline.createInterface({
      input,
      output,
      completer: (line) => this.completeLine(line),
    });
    try {
      while (true) {
        // Build dynamic prompt with username and last command status
        const promptStr = this.buildPromptFromState();
        const line = (await rl.question(promptStr)).trim();
        if (!line) {
          continue;
        }
        const args = line.match(/"[^"]*"|'[^']*'|\S+/g)?.map((part) => part.replace(/^['"]|['"]$/g, "")) || [];
        const [command, ...rest] = args;
        try {
          await this.dispatch(command, rest);
          // Mark last command as successful for the next prompt
          this.lastStatus = true;
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          // Mark last command as failed for the next prompt
          this.lastStatus = false;
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

  // Build the shell prompt string reflecting username and last command status
  // Exposed as a class method so tests can exercise it easily
  private buildPromptFromState(): string {
    const username = this.client?.config?.username ?? "";
    const cwd = this.cwd;
    const tty = Boolean(output.isTTY);
    const noColor = Boolean(process.env.NO_COLOR);
    const useColors = tty && !noColor;

    // Status symbol: ? for unknown (no previous command), ✓ for success, ✗ for failure
    let symbol: string;
    if (this.lastStatus === null) {
      symbol = "?";
    } else {
      symbol = this.lastStatus ? "✓" : "✗";
    }
    if (useColors) {
      const colorCode = this.lastStatus === null ? 33 : (this.lastStatus ? 32 : 31);
      symbol = `\x1b[${colorCode}m${symbol}\x1b[0m`;
    }
    return `bhpan<${username}>:${cwd}$ ${symbol}`;
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
        const lsArgs = [...args];
        const lsOptions = takeLsOptions(lsArgs);
        const target = resolveRemotePath(this.cwd, lsArgs[0] || ".");
        await printList(client, target, lsOptions);
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
      case "rm": {
        const rmArgs = [...args];
        const rmOptions = takeRmOptions(rmArgs);
        await client.rm(resolveRemotePath(this.cwd, rmOptions.target), rmOptions.recursive);
        return;
      }
      case "cat":
        await client.cat(resolveRemotePath(this.cwd, args[0]), process.stdout);
        if (process.stdout.writable) {
          process.stdout.write("\n");
        }
        return;
      case "head": {
        const headArgs = [...args];
        const headOptions = takeReadOptions(headArgs, "head");
        await client.head(resolveRemotePath(this.cwd, headOptions.target), headOptions.lines, process.stdout);
        return;
      }
      case "tail": {
        const tailArgs = [...args];
        const tailOptions = takeReadOptions(tailArgs, "tail");
        await client.tail(resolveRemotePath(this.cwd, tailOptions.target), tailOptions.lines, process.stdout);
        return;
      }
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
      case "upload": {
        const uploadArgs = [...args];
        const transferOptions = takeTransferOptions(uploadArgs);
        if (transferOptions.resume) {
          if (uploadArgs.length) {
            throw new Error("用法: upload <local> [remote_dir] [--no-resume] 或 upload --resume <transfer_id>");
          }
          printUploadResults((await client.resumeUpload(transferOptions.resume)).results);
          return;
        }
        const [localPath, remoteDir] = uploadArgs;
        if (!localPath) {
          throw new Error("用法: upload <local> [remote_dir] [--no-resume] 或 upload --resume <transfer_id>");
        }
        printUploadResults(
          (await client.upload(localPath, resolveRemotePath(this.cwd, remoteDir || "."), {
            persistState: !transferOptions.noResume,
          })).results,
          path.basename(localPath),
        );
        return;
      }
      case "download": {
        const downloadArgs = [...args];
        const transferOptions = takeTransferOptions(downloadArgs);
        if (transferOptions.resume) {
          if (downloadArgs.length) {
            throw new Error("用法: download <remote> [local_dir] [--no-resume] 或 download --resume <transfer_id>");
          }
          await client.resumeDownload(transferOptions.resume);
          return;
        }
        const [remotePath, localDir] = downloadArgs;
        if (!remotePath) {
          throw new Error("用法: download <remote> [local_dir] [--no-resume] 或 download --resume <transfer_id>");
        }
        await client.download(resolveRemotePath(this.cwd, remotePath), localDir || process.cwd(), {
          persistState: !transferOptions.noResume,
        });
        return;
      }
      case "mv": {
        const mvArgs = [...args];
        const mvOptions = takeMoveOptions(mvArgs, "mv");
        await client.mv(resolveRemotePath(this.cwd, mvOptions.src), resolveRemotePath(this.cwd, mvOptions.dst), mvOptions.overwrite, false);
        return;
      }
      case "cp": {
        const cpArgs = [...args];
        const cpOptions = takeMoveOptions(cpArgs, "cp");
        await client.mv(resolveRemotePath(this.cwd, cpOptions.src), resolveRemotePath(this.cwd, cpOptions.dst), cpOptions.overwrite, true);
        return;
      }
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

  private async completeLine(line: string): Promise<[string[], string]> {
    const client = this.requireClient();
    return completeShellLine(line, {
      cwd: this.cwd,
      commands: SHELL_COMMANDS,
      listRemote: (remotePath) => client.list(remotePath),
    });
  }

  private printHelp(): void {
    console.log(`可用命令:
  ls [path] [-R] [-L depth] [--regex pattern]
  cd [path]
  pwd
  tree [path] [-L depth] [--sort name|mtime|size] [--desc] [--regex pattern]
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
  upload <local> [remote_dir] [--no-resume]
  upload --resume <transfer_id>
  download <remote> [local_dir] [--no-resume]
  download --resume <transfer_id>
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
      const title = takeLinkTitle(linkArgs);
      const limitedTimes = takeLinkLimitedTimes(linkArgs);
      const forever = takeLinkForever(linkArgs);
      
      if (type === "all") {
        throw new Error("link create 不支持 --type all");
      }
      if (
        type === "realname" &&
        (usePassword || allowUpload || noDownload || rawArgs.includes("--expires") || title || limitedTimes || forever)
      ) {
        throw new Error("实名外链不支持 --expires、-p、--allow-upload、--no-download、--title、--limited-times、--forever");
      }
      const link = await client.createOrUpdateLink(target, {
        shareType: type,
        expiresDays,
        usePassword,
        allowUpload,
        noDownload,
        title,
        limitedTimes,
        forever,
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

function tokenizeCompletionLine(line: string): string[] {
  const hasTrailingSpace = /\s$/.test(line);
  const trimmed = line.trim();
  const tokens = trimmed ? trimmed.split(/\s+/) : [];
  if (hasTrailingSpace) {
    tokens.push("");
  }
  return tokens;
}

function isPathArgument(command: string, argumentIndex: number, token: string): boolean {
  const nonFlagToken = !token.startsWith("-");
  switch (command) {
    case "ls":
    case "cd":
    case "tree":
    case "stat":
    case "mkdir":
    case "cat":
    case "touch":
    case "download":
      return argumentIndex === 0;
    case "rm":
    case "head":
    case "tail":
      return argumentIndex === 0 && nonFlagToken;
    case "mv":
    case "cp":
      return (argumentIndex === 0 || argumentIndex === 1) && nonFlagToken;
    case "upload":
      return argumentIndex === 1;
    case "link":
      return argumentIndex === 1;
    default:
      return false;
  }
}

async function completeRemotePath(token: string, context: ShellCompletionContext): Promise<string[]> {
  const { cwd, listRemote } = context;
  const listPath = token && !token.endsWith("/")
    ? resolveRemotePath(cwd, path.posix.dirname(token) === "." ? "." : path.posix.dirname(token))
    : resolveRemotePath(cwd, token || ".");
  const basenamePrefix = token && !token.endsWith("/") ? path.posix.basename(token) : "";

  const listing = await listRemote(listPath);
  if (!listing.target || listing.target.size !== -1) {
    return [];
  }

  const matches = [
    ...listing.dirs
      .filter((entry) => entry.name.startsWith(basenamePrefix))
      .map((entry) => applyTokenPrefix(token, entry.name, true)),
    ...listing.files
      .filter((entry) => entry.name.startsWith(basenamePrefix))
      .map((entry) => applyTokenPrefix(token, entry.name, false)),
  ];
  return [...new Set(matches)].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function applyTokenPrefix(token: string, name: string, directory: boolean): string {
  const suffix = directory ? "/" : "";
  if (!token) {
    return `${name}${suffix}`;
  }
  if (token.endsWith("/")) {
    return `${token}${name}${suffix}`;
  }
  const dirPart = path.posix.dirname(token);
  if (dirPart === ".") {
    return `${name}${suffix}`;
  }
  if (dirPart === "/") {
    return `/${name}${suffix}`;
  }
  return `${dirPart}/${name}${suffix}`;
}

// Public helper to render a prompt string given a context. This is used by tests.
export function computePrompt(params: {
  username: string;
  cwd: string;
  lastStatus: boolean | null;
  tty?: boolean;
  noColor?: boolean;
}): string {
  const { username, cwd, lastStatus, tty, noColor } = params;
  const useColors = (typeof tty === "boolean" ? tty : Boolean(process.stdout.isTTY)) && !(noColor ?? Boolean(process.env.NO_COLOR));
  let symbol: string;
  if (lastStatus === null) {
    symbol = "?";
  } else {
    symbol = lastStatus ? "✓" : "✗";
  }
  if (useColors) {
    const colorCode = lastStatus === null ? 33 : (lastStatus ? 32 : 31);
    symbol = `\x1b[${colorCode}m${symbol}\x1b[0m`;
  }
  return `bhpan<${username}>:${cwd}$ ${symbol}`;
}

export async function printList(
  client: BhpanClient,
  target: string,
  options?: { recursive?: boolean; maxDepth?: number; regex?: RegExp },
): Promise<void> {
  const result = await client.list(target);
  if (!result.target) {
    throw new Error(`路径不存在: ${target}`);
  }
  if (result.target.size !== -1) {
    console.log(`${formatSize(result.target.size)} ${formatTimestamp(result.target.modified)} ${result.target.name}`);
    return;
  }
  if (options?.recursive) {
    let entries = [
      {
        path: target,
        docid: result.target.docid,
        dir: true,
        size: result.target.size,
        modified: result.target.modified,
      },
      ...(await client.listRecursive(target, { maxDepth: options.maxDepth })),
    ];
    const regex = options.regex;
    if (regex) {
      entries = entries.filter((entry) => {
        regex.lastIndex = 0;
        return regex.test(entry.path);
      });
    }
    for (const line of formatLsRecursive(entries)) {
      console.log(line);
    }
    return;
  }

  const regex = options?.regex;
  const dirs = regex
    ? result.dirs.filter((entry) => {
      regex.lastIndex = 0;
      return regex.test(path.posix.join(target, entry.name));
    })
    : result.dirs;
  const files = regex
    ? result.files.filter((entry) => {
      regex.lastIndex = 0;
      return regex.test(path.posix.join(target, entry.name));
    })
    : result.files;

  for (const line of client.formatDirEntries(dirs, true)) {
    console.log(line);
  }
  for (const line of client.formatDirEntries(files, false)) {
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

function printUploadResults(results: Array<{ name: string }>, sourceName?: string): void {
  if (!results.length) {
    return;
  }
  if (results.length === 1) {
    const [result] = results;
    if (!sourceName || result.name === sourceName) {
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
