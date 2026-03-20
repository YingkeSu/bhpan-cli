import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";

import { ApiManager, MoveToChildDirectoryError } from "./api.ts";
import { loadConfig, saveConfig } from "./config.ts";
import { retryWithBackoff } from "./retry.ts";
import type { RemoteWalkEntry } from "./remote-walk.ts";
import { walkRemote } from "./remote-walk.ts";
import { buildDownloadPlan, buildUploadPlan } from "./transfer-plan.ts";
import { deleteTransferState, generateTransferId, loadTransferState, saveTransferState, type TransferState } from "./transfer-state.ts";
import { filterTree, filterTreeLegacy, renderTree, calculateStats, type TreeNode } from "./tree-format.ts";
import type {
  AppConfig,
  DirEntry,
  LinkFilterType,
  LinkInfo,
  LinkShareType,
  ResourceInfo,
  TreeSortBy,
  UploadResult,
} from "./types.ts";
import { formatSize, formatTimestamp, normalizeRemotePath, pad, resolveRemotePath, splitRemotePath } from "./utils.ts";

export interface UploadCommandResult {
  transferId?: string;
  results: UploadResult[];
}

export interface TransferCommandResult {
  transferId?: string;
}

export class BhpanClient {
  readonly config: AppConfig;
  readonly api: ApiManager;
  #homePhysicalName: string | null = null;

  private constructor(config: AppConfig, api: ApiManager) {
    this.config = config;
    this.api = api;
  }

  static async create(options: { username?: string; password?: string; validate?: boolean } = {}): Promise<BhpanClient> {
    const config = loadConfig();
    const username = options.username || config.username;
    if (!username) {
      throw new Error("尚未配置用户名，请先执行 login 或在 shell 中首次登录");
    }
    const canReuseStoredSession = options.password === undefined && username === config.username;
    const api = new ApiManager({
      host: config.host,
      username,
      password: options.password ?? null,
      pubkey: config.pubkey,
      encrypted: canReuseStoredSession ? config.encrypted : null,
      cachedToken: canReuseStoredSession ? config.cachedToken.token : "",
      cachedExpire: canReuseStoredSession ? config.cachedToken.expires : 0,
    });
    await api.ensureToken(Boolean(options.validate));
    config.username = username;
    config.encrypted = api.encryptedPassword;
    config.cachedToken = {
      token: api.accessToken,
      expires: api.tokenExpire,
    };
    saveConfig(config);
    return new BhpanClient(config, api);
  }

  async persist(): Promise<void> {
    this.config.encrypted = this.api.encryptedPassword;
    this.config.cachedToken = {
      token: this.api.accessToken,
      expires: this.api.tokenExpire,
    };
    saveConfig(this.config);
  }

  async getHomePhysicalName(): Promise<string> {
    if (this.#homePhysicalName) {
      return this.#homePhysicalName;
    }
    const entry = await this.api.getEntryDoc();
    if (!entry.length) {
      throw new Error("未获取到 home 目录");
    }
    this.#homePhysicalName = entry[0].name;
    return this.#homePhysicalName;
  }

  async toPhysicalPath(logicalPath: string): Promise<string> {
    const normalized = normalizeRemotePath(logicalPath);
    if (normalized === "/") {
      return "/";
    }
    if (normalized === "/home") {
      return `/${await this.getHomePhysicalName()}`;
    }
    if (normalized.startsWith("/home/")) {
      return `/${await this.getHomePhysicalName()}${normalized.slice("/home".length)}`;
    }
    return normalized;
  }

  async stat(logicalPath: string): Promise<ResourceInfo | null> {
    const physical = await this.toPhysicalPath(logicalPath);
    if (physical === "/") {
      return {
        size: -1,
        docid: "",
        name: "/",
      };
    }
    return this.api.getResourceInfoByPath(physical);
  }

  async list(logicalPath: string): Promise<{ target: ResourceInfo | null; dirs: DirEntry[]; files: DirEntry[] }> {
    const target = await this.stat(logicalPath);
    if (!target) {
      return { target: null, dirs: [], files: [] };
    }
    if (normalizeRemotePath(logicalPath) === "/") {
      const home = await this.getHomePhysicalName();
      return {
        target,
        dirs: [{ name: "home", docid: "", size: -1, modified: undefined }],
        files: [],
      };
    }
    if (target.size !== -1) {
      return { target, dirs: [], files: [] };
    }
    const result = await this.api.listDir(target.docid, { by: "name" });
    return { target, dirs: result.dirs, files: result.files };
  }

  async listRecursive(logicalPath: string, options: { maxDepth?: number } = {}): Promise<RemoteWalkEntry[]> {
    const normalized = normalizeRemotePath(logicalPath);
    const physical = await this.toPhysicalPath(logicalPath);
    const target = await this.stat(logicalPath);
    const resolvedTarget = target ?? (physical === "/" ? { size: -1, docid: "", name: "/" } : await this.api.getResourceInfoByPath(physical));
    if (resolvedTarget && resolvedTarget.size !== -1) {
      return [];
    }

    const maxDepth = options.maxDepth ?? Infinity;

    if (normalized === "/") {
      if (maxDepth <= 0) {
        return [];
      }
      const homePhysical = await this.toPhysicalPath("/home");
      const home = await this.api.getResourceInfoByPath(homePhysical);
      if (!home || home.size !== -1) {
        return [];
      }
      const homeEntry: RemoteWalkEntry = {
        path: "/home",
        docid: home.docid,
        dir: true,
        size: -1,
        modified: home.modified,
      };
      const childEntries = await walkRemote({
        rootPath: "/home",
        rootDocid: home.docid,
        maxDepth: maxDepth - 1,
        listDir: (docid) => this.api.listDir(docid, { by: "name" }),
      });
      return [homeEntry, ...childEntries];
    }

    if (!resolvedTarget || resolvedTarget.size !== -1) {
      return [];
    }

    return walkRemote({
      rootPath: normalized,
      rootDocid: resolvedTarget.docid,
      maxDepth,
      listDir: (docid) => this.api.listDir(docid, { by: "name" }),
    });
  }

  async mkdir(logicalPath: string): Promise<void> {
    const physical = await this.toPhysicalPath(logicalPath);
    if (physical === "/") {
      return;
    }
    const normalized = normalizeRemotePath(physical);
    const segments = normalized.split("/").filter(Boolean);
    let currentPath = "";
    let current: ResourceInfo | null = null;
    for (const segment of segments) {
      currentPath = `${currentPath}/${segment}`;
      const existing = await this.api.getResourceInfoByPath(currentPath);
      if (existing) {
        if (existing.size !== -1) {
          throw new Error(`路径已存在且不是目录: ${logicalPath}`);
        }
        current = existing;
        continue;
      }
      if (!current) {
        throw new Error(`无效根目录: ${logicalPath}`);
      }
      const docid = await this.api.createDir(current.docid, segment);
      current = {
        docid,
        name: segment,
        size: -1,
      };
    }
  }

  async rm(logicalPath: string, recursive = false): Promise<void> {
    const info = await this.mustStat(logicalPath);
    if (info.size === -1) {
      if (!recursive) {
        const listing = await this.api.listDir(info.docid);
        if (listing.dirs.length || listing.files.length) {
          throw new Error("目录非空，删除目录请使用 -r");
        }
        await this.api.deleteDir(info.docid);
        return;
      }
      const listing = await this.api.listDir(info.docid);
      for (const dir of listing.dirs) {
        await this.rm(path.posix.join(logicalPath, dir.name), true);
      }
      for (const file of listing.files) {
        await this.api.deleteFile(file.docid);
      }
      await this.api.deleteDir(info.docid);
      return;
    }
    await this.api.deleteFile(info.docid);
  }

  async upload(localPath: string, remoteDir: string, options: { persistState?: boolean } = {}): Promise<UploadCommandResult> {
    const targetDir = await this.mustStat(remoteDir);
    if (targetDir.size !== -1) {
      throw new Error("上传目标必须是目录");
    }
    const resolvedLocalPath = path.resolve(localPath);
    fs.statSync(resolvedLocalPath);
    const plan = buildUploadPlan(resolvedLocalPath, remoteDir, {
      strict: true,
      rootName: path.basename(localPath),
    });
    const state: TransferState = {
      id: generateTransferId(),
      type: "upload",
      startTime: Date.now(),
      directories: plan.directories,
      files: plan.files.map((file) => ({
        localPath: file.localPath,
        remotePath: file.remotePath,
        size: file.size,
        uploaded: false,
      })),
      currentIndex: 0,
      totalSize: plan.totalSize,
      uploadedSize: 0,
      status: "in_progress",
    };
    return {
      transferId: options.persistState === false ? undefined : state.id,
      results: await this.runUploadTransfer(state, options.persistState !== false),
    };
  }

  async resumeUpload(transferId: string): Promise<UploadCommandResult> {
    const state = this.loadSavedTransferState(transferId, "upload");
    return {
      transferId: state.id,
      results: await this.runUploadTransfer(state, true),
    };
  }

  async download(remotePath: string, localDir: string, options: { persistState?: boolean } = {}): Promise<TransferCommandResult> {
    const info = await this.mustStat(remotePath);
    const resolvedLocalDir = path.resolve(localDir);
    const plan = await buildDownloadPlan(remotePath, resolvedLocalDir, (docid) => this.api.listDir(docid, { by: "name" }), {
      getRootInfo: async () => ({ docid: info.docid, size: info.size }),
    });
    const state: TransferState = {
      id: generateTransferId(),
      type: "download",
      startTime: Date.now(),
      directories: plan.directories,
      files: plan.files.map((file) => ({
        docid: file.docid,
        localPath: file.localPath,
        remotePath: file.remotePath,
        size: file.size,
        uploaded: false,
      })),
      currentIndex: 0,
      totalSize: plan.totalSize,
      uploadedSize: 0,
      status: "in_progress",
    };
    await this.runDownloadTransfer(state, options.persistState !== false);
    return {
      transferId: options.persistState === false ? undefined : state.id,
    };
  }

  async resumeDownload(transferId: string): Promise<TransferCommandResult> {
    const state = this.loadSavedTransferState(transferId, "download");
    await this.runDownloadTransfer(state, true);
    return {
      transferId: state.id,
    };
  }

  async cat(remotePath: string, writable: NodeJS.WritableStream): Promise<void> {
    const info = await this.mustStat(remotePath);
    if (info.size === -1) {
      throw new Error("cat 只能用于文件");
    }
    await this.api.catFile(info.docid, writable);
  }

  async head(remotePath: string, lines = 10, writable: NodeJS.WritableStream = process.stdout): Promise<void> {
    const chunks = await this.readLines(remotePath, lines, false);
    for (const chunk of chunks) {
      writable.write(chunk);
    }
  }

  async tail(remotePath: string, lines = 10, writable: NodeJS.WritableStream = process.stdout): Promise<void> {
    const chunks = await this.readLines(remotePath, lines, true);
    for (const chunk of chunks) {
      writable.write(chunk);
    }
  }

  async touch(remotePath: string): Promise<ResourceInfo> {
    const normalized = normalizeRemotePath(remotePath);
    const existing = await this.stat(normalized);
    if (existing) {
      return existing;
    }
    const split = splitRemotePath(normalized);
    await this.mkdir(split.parent);
    const parent = await this.mustStat(split.parent);
    const tempFile = this.createEmptyFile();
    const uploaded = await this.api.uploadFile(parent.docid, split.base, tempFile);
    fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    const created = await this.api.getResourceInfoByPath(await this.toPhysicalPath(normalized));
    if (!created) {
      throw new Error(`创建文件失败: ${remotePath}`);
    }
    if (uploaded.name !== split.base) {
      created.name = uploaded.name;
    }
    return created;
  }

  async tree(
    logicalPath: string,
    options: {
      maxDepth?: number;
      sortBy?: TreeSortBy;
      descending?: boolean;
      regex?: RegExp;
      stats?: boolean;
      type?: "f" | "d";
      excludeRegex?: RegExp;
    } = {},
  ): Promise<string[]> {
    const target = await this.mustStat(logicalPath);
    const rootPath = normalizeRemotePath(logicalPath);
    if (target.size !== -1) {
      return [rootPath];
    }
    const nodes = await this.fetchTreeNodes(
      target.docid,
      rootPath,
      options.maxDepth ?? Infinity,
      0,
      options.sortBy ?? "name",
      Boolean(options.descending),
    );
    
    // Apply filtering (new enhanced filter or legacy regex filter)
    let filteredNodes = nodes;
    if (options.type || options.excludeRegex) {
      filteredNodes = filterTree(nodes, {
        includeRegex: options.regex,
        excludeRegex: options.excludeRegex,
        type: options.type,
      });
    } else if (options.regex) {
      filteredNodes = filterTreeLegacy(nodes, options.regex);
    }
    
    const rendered = renderTree(filteredNodes, "");
    const result = [rootPath, ...rendered];
    
    // Add stats line if requested
    if (options.stats) {
      const stats = calculateStats(filteredNodes);
      result.push(`-- dirs: ${stats.dirs}, files: ${stats.files}, size: ${formatSize(stats.totalSize)}`);
    }
    
    return result;
  }

  async getLinks(logicalPath: string, type: LinkFilterType = "all"): Promise<LinkInfo[]> {
    const info = await this.mustStat(logicalPath);
    return this.api.listLinks(info.docid, info.size === -1 ? "folder" : "file", type === "all" ? undefined : type);
  }

  async getLink(logicalPath: string, type: LinkFilterType = "all"): Promise<LinkInfo | null> {
    const links = await this.getLinks(logicalPath, type);
    return links.find((link) => link.type === "anonymous") || links[0] || null;
  }

  async createOrUpdateLink(
    logicalPath: string,
    options: {
      shareType: LinkShareType;
      expiresDays: number;
      usePassword: boolean;
      allowUpload: boolean;
      noDownload: boolean;
      title?: string;
      limitedTimes?: number;
      forever?: boolean;
    },
  ): Promise<LinkInfo> {
    const info = await this.mustStat(logicalPath);
    
    // Validate --forever conflicts with --expires
    if (options.forever && options.expiresDays !== 30) {
      throw new Error("--forever 不能与 --expires 同时使用");
    }
    
    if (options.shareType === "realname") {
      const current = (await this.getLinks(logicalPath, "realname"))[0] || null;
      if (current) {
        return current;
      }
      const created = await this.api.createRealnameLink({
        item: {
          id: info.docid,
          type: info.size === -1 ? "folder" : "file",
        },
      });
      return this.findCreatedLink(await this.getLinks(logicalPath, "realname"), created.id, "创建实名外链后未查询到结果");
    }
    const current = (await this.getLinks(logicalPath, "anonymous"))[0] || null;
    
    // Calculate expires_at
    let expiresAt: string;
    if (options.forever) {
      expiresAt = "9999-12-31T23:59:59.000Z";
    } else {
      expiresAt = new Date(Date.now() + options.expiresDays * 86400 * 1000).toISOString();
    }
    
    const payload = {
      item: {
        id: info.docid,
        type: info.size === -1 ? ("folder" as const) : ("file" as const),
        allow: this.buildLinkPermissions(info.size === -1, options.noDownload, options.allowUpload),
      },
      title: options.title || info.name,
      expires_at: expiresAt,
      password: options.usePassword ? (current?.password || this.generateSharePassword()) : "",
      verify_mobile: false,
      limited_times: options.limitedTimes ?? -1,
    };
    if (!current) {
      const created = await this.api.createAnonymousLink(payload);
      return this.findCreatedLink(await this.getLinks(logicalPath, "anonymous"), created.id, "创建外链后未查询到结果");
    }
    await this.api.updateAnonymousLink(current.id, payload);
    return this.findCreatedLink(await this.getLinks(logicalPath, "anonymous"), current.id, "更新外链后未查询到结果");
  }

  async deleteLink(logicalPath: string, type: LinkFilterType = "all"): Promise<void> {
    const links = type === "all" ? await this.getLinks(logicalPath) : await this.getLinks(logicalPath, type);
    if (!links.length) {
      throw new Error(type === "all" ? "当前路径未开启外链" : `当前路径未开启 ${type} 外链`);
    }
    for (const link of links) {
      await this.api.deleteLink(link.id, link.type === "realname" ? "realname" : "anonymous");
    }
  }

  async mv(src: string, dst: string, overwrite = false, copy = false): Promise<void> {
    const normalizedSrc = normalizeRemotePath(src);
    const normalizedDst = normalizeRemotePath(dst);
    if (normalizedSrc === normalizedDst) {
      throw new Error(copy ? "复制目标不能与源路径相同" : "移动目标不能与源路径相同");
    }

    const srcInfo = await this.mustStat(normalizedSrc);
    const srcSplit = splitRemotePath(normalizedSrc);
    const requestedDst = await this.stat(normalizedDst);
    const finalDst = requestedDst?.size === -1 ? path.posix.join(normalizedDst, srcSplit.base) : normalizedDst;
    if (normalizedSrc === finalDst) {
      throw new Error(copy ? "复制目标不能与源路径相同" : "移动目标不能与源路径相同");
    }

    const dstInfo = await this.stat(finalDst);
    if (dstInfo?.docid === srcInfo.docid) {
      throw new Error(copy ? "复制目标不能与源路径相同" : "移动目标不能与源路径相同");
    }
    if (dstInfo && !overwrite) {
      throw new Error("目标已存在，使用 -f 覆盖");
    }
    if (dstInfo && (srcInfo.size === -1 || dstInfo.size === -1)) {
      // If destination or source is a directory, only block when overwrite is not requested.
      if (!overwrite) {
        throw new Error("当前不支持使用 -f 覆盖目录，请先手动删除目标目录");
      }
    }

    const dstSplit = splitRemotePath(finalDst);
    const dstParent = await this.mustStat(dstSplit.parent);
    if (dstParent.size !== -1) {
      throw new Error("目标父路径必须是目录");
    }

    if (srcSplit.parent === dstSplit.parent) {
      if (dstInfo && overwrite) {
        await this.rm(finalDst, true);
      }
      if (copy) {
        const result = await this.api.copy(srcInfo.docid, dstParent.docid, true, overwrite);
        if (typeof result !== "string" && result.name !== dstSplit.base) {
          await this.api.rename(result.docid, dstSplit.base);
        }
        return;
      }
      await this.api.rename(srcInfo.docid, dstSplit.base);
      return;
    }

    if (dstInfo && overwrite) {
      await this.rm(finalDst, true);
    }

    const needsRename = srcSplit.base !== dstSplit.base;
    try {
      const result = copy
        ? await this.api.copy(srcInfo.docid, dstParent.docid, needsRename, overwrite)
        : await this.api.move(srcInfo.docid, dstParent.docid, needsRename, overwrite);
      if (typeof result !== "string" && result.name !== dstSplit.base) {
        await this.api.rename(result.docid, dstSplit.base);
      } else if (typeof result === "string" && needsRename) {
        await this.api.rename(result, dstSplit.base);
      }
    } catch (error) {
      if (error instanceof MoveToChildDirectoryError) {
        throw new Error("不能移动或复制到子目录");
      }
      throw error;
    }
  }

  async mustStat(logicalPath: string): Promise<ResourceInfo> {
    const info = await this.stat(logicalPath);
    if (!info) {
      throw new Error(`路径不存在: ${logicalPath}`);
    }
    return info;
  }

  formatDirEntries(entries: DirEntry[], dir = true): string[] {
    return entries.map((entry) =>
      [
        pad(dir ? "dir" : formatSize(entry.size), 10),
        pad(formatTimestamp(entry.modified), 19),
        entry.name,
      ].join(" "),
    );
  }

  private async readLines(logicalPath: string, lines: number, fromTail: boolean): Promise<Buffer[]> {
    const info = await this.mustStat(logicalPath);
    if (info.size === -1) {
      throw new Error(`${fromTail ? "tail" : "head"} 只能用于文件`);
    }
    const content = await this.api.readFileBuffer(info.docid);
    if (lines <= 0) {
      return [];
    }
    const text = content.toString("utf8");
    const parts = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
    const selected = fromTail ? parts.slice(-lines) : parts.slice(0, lines);
    const suffix = selected.length === 0 ? "" : "\n";
    return [Buffer.from(selected.join("\n") + suffix, "utf8")];
  }

  private async fetchTreeNodes(
    docid: string,
    parentPath: string,
    maxDepth: number,
    depth: number,
    sortBy: TreeSortBy,
    descending: boolean,
  ): Promise<TreeNode[]> {
    if (depth >= maxDepth) {
      return [];
    }
    const { dirs, files } = await this.api.listDir(docid, { by: "name" });
    const entries = [
      ...this.sortTreeEntries(dirs, sortBy, descending).map((entry) => ({ ...entry, dir: true })),
      ...this.sortTreeEntries(files, sortBy, descending).map((entry) => ({ ...entry, dir: false })),
    ];
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      const fullPath = path.posix.join(parentPath, entry.name);
      const node: TreeNode = {
        name: entry.name,
        dir: entry.dir,
        fullPath,
        size: entry.size,
        children: [],
      };
      if (entry.dir) {
        node.children = await this.fetchTreeNodes(entry.docid, fullPath, maxDepth, depth + 1, sortBy, descending);
      }
      nodes.push(node);
    }
    return nodes;
  }

  private createEmptyFile(): string {
    const tempFile = path.join(fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "bhpan-touch-")), "empty");
    fs.writeFileSync(tempFile, "");
    return tempFile;
  }

  private loadSavedTransferState(transferId: string, type: TransferState["type"]): TransferState {
    const state = loadTransferState(transferId);
    if (!state) {
      throw new Error(`未找到传输状态: ${transferId}`);
    }
    if (state.type !== type) {
      throw new Error(`传输 ${transferId} 不是 ${type} 任务`);
    }
    return state;
  }

  private normalizeTransferState(state: TransferState): void {
    const nextIndex = state.files.findIndex((file) => !file.uploaded);
    state.currentIndex = nextIndex === -1 ? state.files.length : nextIndex;
    state.uploadedSize = state.files.reduce((sum, file) => sum + (file.uploaded ? file.size : 0), 0);
    state.totalSize = state.files.reduce((sum, file) => sum + file.size, 0);
    state.status = "in_progress";
    delete state.error;
  }

  private saveTransferStateIfNeeded(state: TransferState, persistState: boolean): boolean {
    if (!persistState) {
      return false;
    }
    try {
      saveTransferState(state);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`警告: 无法保存传输状态，已回退为不可恢复模式: ${message}`);
      return false;
    }
  }

  private cleanupTransferState(stateId: string, hasPersistedState: boolean): void {
    if (!hasPersistedState) {
      return;
    }
    try {
      deleteTransferState(stateId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`警告: 无法清理传输状态 ${stateId}: ${message}`);
    }
  }

  private async ensureTransferDirectories(state: TransferState): Promise<void> {
    for (const directory of state.directories || []) {
      if (state.type === "upload") {
        await this.mkdir(directory);
        continue;
      }
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  private markTransferFailure(state: TransferState, error: unknown, persistState: boolean): Error {
    state.status = "failed";
    state.currentIndex = state.files.findIndex((file) => !file.uploaded);
    if (state.currentIndex === -1) {
      state.currentIndex = state.files.length;
    }
    const message = error instanceof Error ? error.message : String(error);
    state.error = message;
    return new Error(persistState ? `${message}；可使用 --resume ${state.id} 继续此传输` : message);
  }

  private async runRetriedOperation<T>(operation: () => Promise<T>, fallbackMessage: string): Promise<T> {
    const result = await retryWithBackoff(operation);
    if (result.success) {
      return result.data as T;
    }
    throw result.error || new Error(fallbackMessage);
  }

  private async runUploadTransfer(state: TransferState, persistState: boolean): Promise<UploadResult[]> {
    this.normalizeTransferState(state);
    let shouldPersistState = this.saveTransferStateIfNeeded(state, persistState);
    let hasPersistedState = shouldPersistState;
    const results: UploadResult[] = [];

    try {
      await this.ensureTransferDirectories(state);
      for (let index = state.currentIndex; index < state.files.length; index += 1) {
        const file = state.files[index];
        if (file.uploaded) {
          continue;
        }
        const remoteParent = path.posix.dirname(file.remotePath);
        const targetDir = await this.mustStat(remoteParent);
        if (targetDir.size !== -1) {
          throw new Error(`上传目标必须是目录: ${remoteParent}`);
        }
        const uploaded = await this.runRetriedOperation(
          () => this.api.uploadFile(targetDir.docid, path.posix.basename(file.remotePath), file.localPath),
          `上传失败: ${file.localPath}`,
        );
        results.push(uploaded);
        file.uploaded = true;
        state.currentIndex = index + 1;
        state.uploadedSize += file.size;
        shouldPersistState = this.saveTransferStateIfNeeded(state, shouldPersistState);
        if (shouldPersistState) {
          hasPersistedState = true;
        }
      }
    } catch (error) {
      const wrapped = this.markTransferFailure(state, error, shouldPersistState);
      shouldPersistState = this.saveTransferStateIfNeeded(state, shouldPersistState);
      if (shouldPersistState) {
        hasPersistedState = true;
      }
      throw wrapped;
    }

    state.status = "completed";
    state.currentIndex = state.files.length;
    state.uploadedSize = state.totalSize;
    this.cleanupTransferState(state.id, hasPersistedState);
    return results;
  }

  private async runDownloadTransfer(state: TransferState, persistState: boolean): Promise<void> {
    this.normalizeTransferState(state);
    let shouldPersistState = this.saveTransferStateIfNeeded(state, persistState);
    let hasPersistedState = shouldPersistState;

    try {
      await this.ensureTransferDirectories(state);
      for (let index = state.currentIndex; index < state.files.length; index += 1) {
        const file = state.files[index];
        if (file.uploaded) {
          continue;
        }
        await this.runRetriedOperation(
          async () => {
            let docid = file.docid;
            if (!docid) {
              const info = await this.mustStat(file.remotePath);
              if (info.size === -1) {
                throw new Error(`download 只能用于文件: ${file.remotePath}`);
              }
              docid = info.docid;
            }
            await this.api.downloadFile(docid, file.localPath);
          },
          `下载失败: ${file.remotePath}`,
        );
        file.uploaded = true;
        state.currentIndex = index + 1;
        state.uploadedSize += file.size;
        shouldPersistState = this.saveTransferStateIfNeeded(state, shouldPersistState);
        if (shouldPersistState) {
          hasPersistedState = true;
        }
      }
    } catch (error) {
      const wrapped = this.markTransferFailure(state, error, shouldPersistState);
      shouldPersistState = this.saveTransferStateIfNeeded(state, shouldPersistState);
      if (shouldPersistState) {
        hasPersistedState = true;
      }
      throw wrapped;
    }

    state.status = "completed";
    state.currentIndex = state.files.length;
    state.uploadedSize = state.totalSize;
    this.cleanupTransferState(state.id, hasPersistedState);
  }

  private buildLinkPermissions(isDir: boolean, noDownload: boolean, allowUpload: boolean): string[] {
    const allow = ["display"];
    if (!noDownload) {
      allow.push("preview", "download");
    }
    if (isDir && allowUpload) {
      allow.push("upload");
    }
    return allow;
  }

  private generateSharePassword(): string {
    return String(randomInt(1000, 10000));
  }

  private sortTreeEntries(entries: DirEntry[], sortBy: TreeSortBy, descending: boolean): DirEntry[] {
    return [...entries].sort((left, right) => this.compareTreeEntry(left, right, sortBy, descending));
  }

  private compareTreeEntry(left: DirEntry, right: DirEntry, sortBy: TreeSortBy, descending: boolean): number {
    const sign = descending ? -1 : 1;
    if (sortBy === "mtime") {
      const delta = (left.modified || 0) - (right.modified || 0);
      if (delta !== 0) {
        return delta * sign;
      }
    } else if (sortBy === "size") {
      const delta = left.size - right.size;
      if (delta !== 0) {
        return delta * sign;
      }
    } else {
      const delta = left.name.localeCompare(right.name, "zh-CN");
      if (delta !== 0) {
        return delta * sign;
      }
    }
    return left.name.localeCompare(right.name, "zh-CN");
  }

  private findCreatedLink(links: LinkInfo[], id: string | undefined, notFoundMessage: string): LinkInfo {
    const matched = id ? links.find((link) => link.id === id) : null;
    if (matched) {
      return matched;
    }
    if (links.length === 1) {
      return links[0];
    }
    const fallback = [...links].sort((left, right) => {
      const leftTime = left.created_at ? Date.parse(left.created_at) : 0;
      const rightTime = right.created_at ? Date.parse(right.created_at) : 0;
      return rightTime - leftTime;
    })[0];
    if (fallback) {
      return fallback;
    }
    throw new Error(notFoundMessage);
  }
}

export function clearCredentials(): AppConfig {
  const config = loadConfig();
  config.username = null;
  config.encrypted = null;
  config.cachedToken = { token: "", expires: 0 };
  saveConfig(config);
  return config;
}

export { resolveRemotePath };
