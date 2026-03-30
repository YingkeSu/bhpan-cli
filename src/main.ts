#!/usr/bin/env node

import { BhpanClient, clearCredentials, resolveRemotePath } from "./client.ts";
import {
  takeBooleanFlag,
  takeFlag,
  takeIntegerFlag,
  takeLinkTypeFlag,
  takeLsOptions,
  takeMoveOptions,
  takeReadOptions,
  takeRmOptions,
  takeTransferCleanOptions,
  takeTransferListOptions,
  takeTransferOptions,
  takeTreeOptions,
} from "./cli-options.ts";
import { loadConfig, saveConfig } from "./config.ts";
import { PanShell, printList, printStat } from "./shell.ts";
import {
  listTransferStates,
  loadTransferState,
  deleteTransferState,
  cleanOldTransferStates,
  type TransferState,
} from "./transfer-state.ts";

const VERSION = "0.3.0";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function printTransferState(state: TransferState): void {
  console.log(`ID: ${state.id}`);
  console.log(`类型: ${state.type === "upload" ? "上传" : "下载"}`);
  console.log(`状态: ${state.status}`);
  console.log(`开始时间: ${new Date(state.startTime).toLocaleString()}`);
  console.log(`总大小: ${formatBytes(state.totalSize)}`);
  console.log(`已传输: ${formatBytes(state.uploadedSize)} (${Math.round(state.totalSize > 0 ? (state.uploadedSize / state.totalSize) * 100 : 0)}%)`);
  console.log(`文件数: ${state.files.length}`);
  console.log(`已完成: ${state.files.filter(f => f.uploaded).length}/${state.files.length}`);
  if (state.error) {
    console.log(`错误: ${state.error}`);
  }
  console.log("\n文件列表:");
  for (const file of state.files) {
    const status = file.uploaded ? "✓" : "○";
    console.log(`  ${status} ${file.localPath} -> ${file.remotePath} (${formatBytes(file.size)})`);
  }
}

function printHelp(): void {
  console.log(`bhpan

用法:
  bhpan shell
  bhpan login [--username <name>] [--no-store-password]
  bhpan logout
  bhpan whoami
  bhpan ls [remote_path] [-R] [-L depth] [--regex pattern]
  bhpan tree [remote_path] [-L depth] [--sort name|mtime|size] [--desc] [--regex pattern]
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
  bhpan upload <local_path> <remote_dir> [--no-resume]
  bhpan upload --resume <transfer_id>
  bhpan download <remote_path> [local_dir] [--no-resume]
  bhpan download --resume <transfer_id>
  bhpan transfer list [--status all|in_progress|completed|failed]
  bhpan transfer show <transfer_id>
  bhpan transfer clean [--older-than days] [--status failed|completed] [--all]
  bhpan transfer remove <transfer_id>

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
      {
        const lsArgs = args.slice(1);
        const lsOptions = takeLsOptions(lsArgs);
        const target = resolveRemotePath("/", lsArgs[0] || "/home");
        await printList(client, target, lsOptions);
      }
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
    case "rm": {
      const rmArgs = args.slice(1);
      const rmOptions = takeRmOptions(rmArgs);
      await client.rm(resolveRemotePath("/", rmOptions.target), rmOptions.recursive);
      return;
    }
    case "cat":
      await client.cat(resolveRemotePath("/", args[1]), process.stdout);
      return;
    case "head": {
      const headArgs = args.slice(1);
      const headOptions = takeReadOptions(headArgs, "head");
      await client.head(resolveRemotePath("/", headOptions.target), headOptions.lines, process.stdout);
      return;
    }
    case "tail": {
      const tailArgs = args.slice(1);
      const tailOptions = takeReadOptions(tailArgs, "tail");
      await client.tail(resolveRemotePath("/", tailOptions.target), tailOptions.lines, process.stdout);
      return;
    }
    case "touch": {
      const created = await client.touch(resolveRemotePath("/", args[1]));
      console.log(created.name);
      return;
    }
    case "upload": {
      const uploadArgs = args.slice(1);
      const transferOptions = takeTransferOptions(uploadArgs);
      if (transferOptions.resume) {
        if (uploadArgs.length) {
          throw new Error("用法: bhpan upload <local_path> <remote_dir> [--no-resume] 或 bhpan upload --resume <transfer_id>");
        }
        for (const result of (await client.resumeUpload(transferOptions.resume)).results) {
          console.log(result.name);
        }
        return;
      }
      const [localPath, remoteDir] = uploadArgs;
      if (!localPath || !remoteDir) {
        throw new Error("用法: bhpan upload <local_path> <remote_dir> [--no-resume] 或 bhpan upload --resume <transfer_id>");
      }
      for (const result of (await client.upload(localPath, resolveRemotePath("/", remoteDir), {
        persistState: !transferOptions.noResume,
      })).results) {
        console.log(result.name);
      }
      return;
    }
    case "download": {
      const downloadArgs = args.slice(1);
      const transferOptions = takeTransferOptions(downloadArgs);
      if (transferOptions.resume) {
        if (downloadArgs.length) {
          throw new Error("用法: bhpan download <remote_path> [local_dir] [--no-resume] 或 bhpan download --resume <transfer_id>");
        }
        await client.resumeDownload(transferOptions.resume);
        return;
      }
      const [remotePath, localDir] = downloadArgs;
      if (!remotePath) {
        throw new Error("用法: bhpan download <remote_path> [local_dir] [--no-resume] 或 bhpan download --resume <transfer_id>");
      }
      await client.download(resolveRemotePath("/", remotePath), localDir || process.cwd(), {
        persistState: !transferOptions.noResume,
      });
      return;
    }
    case "mv": {
      const mvArgs = args.slice(1);
      const mvOptions = takeMoveOptions(mvArgs, "mv");
      await client.mv(resolveRemotePath("/", mvOptions.src), resolveRemotePath("/", mvOptions.dst), mvOptions.overwrite, false);
      return;
    }
    case "cp": {
      const cpArgs = args.slice(1);
      const cpOptions = takeMoveOptions(cpArgs, "cp");
      await client.mv(resolveRemotePath("/", cpOptions.src), resolveRemotePath("/", cpOptions.dst), cpOptions.overwrite, true);
      return;
    }
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
    case "transfer": {
      const transferCmdArgs = args.slice(1);
      const subCommand = transferCmdArgs[0];
      
      if (subCommand === "list") {
        const listArgs = transferCmdArgs.slice(1);
        const listOptions = takeTransferListOptions(listArgs);
        const states = listTransferStates();
        
        const filtered = listOptions.status === "all" 
          ? states 
          : states.filter(s => s.status === listOptions.status);
        
        if (filtered.length === 0) {
          console.log("没有找到传输状态");
          return;
        }
        
        for (const state of filtered) {
          const progress = `${state.uploadedSize}/${state.totalSize}`;
          const time = new Date(state.startTime).toLocaleString();
          console.log(`${state.id}\t${state.type}\t${state.status}\t${progress}\t${time}`);
        }
        return;
      }
      
      if (subCommand === "show") {
        const transferId = transferCmdArgs[1];
        if (!transferId) {
          throw new Error("用法: bhpan transfer show <transfer_id>");
        }
        const state = loadTransferState(transferId);
        if (!state) {
          throw new Error(`未找到传输状态: ${transferId}`);
        }
        printTransferState(state);
        return;
      }
      
      if (subCommand === "clean") {
        const cleanArgs = transferCmdArgs.slice(1);
        const cleanOptions = takeTransferCleanOptions(cleanArgs);
        
        if (cleanOptions.all) {
          const states = listTransferStates();
          for (const state of states) {
            deleteTransferState(state.id);
          }
          console.log(`已清理 ${states.length} 个传输状态`);
          return;
        }
        
        if (cleanOptions.transferId) {
          deleteTransferState(cleanOptions.transferId);
          console.log(`已删除传输状态: ${cleanOptions.transferId}`);
          return;
        }
        
        const maxAgeMs = cleanOptions.olderThanDays !== undefined 
          ? cleanOptions.olderThanDays * 24 * 60 * 60 * 1000 
          : 7 * 24 * 60 * 60 * 1000;
        
        let cleaned = 0;
        const states = listTransferStates();
        for (const state of states) {
          const matchesStatus = !cleanOptions.status || state.status === cleanOptions.status;
          const isOld = Date.now() - state.startTime > maxAgeMs;
          if (matchesStatus && isOld) {
            deleteTransferState(state.id);
            cleaned++;
          }
        }
        console.log(`已清理 ${cleaned} 个传输状态`);
        return;
      }
      
      if (subCommand === "remove") {
        const transferId = transferCmdArgs[1];
        if (!transferId) {
          throw new Error("用法: bhpan transfer remove <transfer_id>");
        }
        const state = loadTransferState(transferId);
        if (!state) {
          throw new Error(`未找到传输状态: ${transferId}`);
        }
        deleteTransferState(transferId);
        console.log(`已删除传输状态: ${transferId}`);
        return;
      }
      
      throw new Error("用法: bhpan transfer <list|show|clean|remove> [...]");
    }
    default:
      printHelp();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
