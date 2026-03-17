import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";

import { ApiManager, MoveToChildDirectoryError } from "./api.ts";
import { loadConfig, saveConfig } from "./config.ts";
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
    const api = new ApiManager({
      host: config.host,
      username,
      password: options.password ?? null,
      pubkey: config.pubkey,
      encrypted: config.encrypted,
      cachedToken: config.cachedToken.token,
      cachedExpire: config.cachedToken.expires,
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

  async upload(localPath: string, remoteDir: string): Promise<UploadResult[]> {
    const targetDir = await this.mustStat(remoteDir);
    if (targetDir.size !== -1) {
      throw new Error("上传目标必须是目录");
    }
    const stat = fs.statSync(localPath);
    const results: UploadResult[] = [];
    if (stat.isDirectory()) {
      const dirname = path.basename(localPath);
      const nextRemote = path.posix.join(remoteDir, dirname);
      await this.mkdir(nextRemote);
      for (const entry of fs.readdirSync(localPath)) {
        results.push(...(await this.upload(path.join(localPath, entry), nextRemote)));
      }
      return results;
    }
    results.push(await this.api.uploadFile(targetDir.docid, path.basename(localPath), localPath));
    return results;
  }

  async download(remotePath: string, localDir: string): Promise<void> {
    const info = await this.mustStat(remotePath);
    if (info.size === -1) {
      const destination = path.join(localDir, path.posix.basename(normalizeRemotePath(remotePath)));
      fs.mkdirSync(destination, { recursive: true });
      const listing = await this.api.listDir(info.docid, { by: "name" });
      for (const dir of listing.dirs) {
        await this.download(path.posix.join(remotePath, dir.name), destination);
      }
      for (const file of listing.files) {
        await this.download(path.posix.join(remotePath, file.name), destination);
      }
      return;
    }
    fs.mkdirSync(localDir, { recursive: true });
    await this.api.downloadFile(info.docid, path.join(localDir, info.name));
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
    options: { maxDepth?: number; sortBy?: TreeSortBy; descending?: boolean } = {},
  ): Promise<string[]> {
    const target = await this.mustStat(logicalPath);
    const lines = [normalizeRemotePath(logicalPath)];
    if (target.size !== -1) {
      return lines;
    }
    await this.buildTree(target.docid, "", lines, options.maxDepth ?? Infinity, 0, options.sortBy ?? "name", Boolean(options.descending));
    return lines;
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
    },
  ): Promise<LinkInfo> {
    const info = await this.mustStat(logicalPath);
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
    const payload = {
      item: {
        id: info.docid,
        type: info.size === -1 ? ("folder" as const) : ("file" as const),
        allow: this.buildLinkPermissions(info.size === -1, options.noDownload, options.allowUpload),
      },
      title: info.name,
      expires_at: new Date(Date.now() + options.expiresDays * 86400 * 1000).toISOString(),
      password: options.usePassword ? (current?.password || this.generateSharePassword()) : "",
      verify_mobile: false,
      limited_times: -1,
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
    const srcInfo = await this.mustStat(src);
    const dstInfo = await this.stat(dst);
    const srcSplit = splitRemotePath(normalizeRemotePath(src));
    const dstSplit = splitRemotePath(normalizeRemotePath(dst));

    if (dstInfo?.size === -1) {
      if (copy) {
        await this.api.copy(srcInfo.docid, dstInfo.docid, overwrite, overwrite);
      } else {
        await this.api.move(srcInfo.docid, dstInfo.docid, overwrite, overwrite);
      }
      return;
    }

    if (dstInfo && dstInfo.size !== -1 && !overwrite) {
      throw new Error("目标已存在，使用 -f 覆盖");
    }

    const dstParent = await this.mustStat(dstSplit.parent);
    if (dstParent.size !== -1) {
      throw new Error("目标父路径必须是目录");
    }

    if (srcSplit.parent === dstSplit.parent) {
      if (dstInfo && overwrite) {
        await this.rm(dst, true);
      }
      await this.api.rename(srcInfo.docid, dstSplit.base);
      return;
    }

    if (dstInfo && overwrite) {
      await this.rm(dst, true);
    }

    try {
      const result = copy
        ? await this.api.copy(srcInfo.docid, dstParent.docid, true, overwrite)
        : await this.api.move(srcInfo.docid, dstParent.docid, true, overwrite);
      if (typeof result !== "string" && result.name !== dstSplit.base) {
        await this.api.rename(result.docid, dstSplit.base);
      } else if (typeof result === "string" && srcSplit.base !== dstSplit.base) {
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

  private async buildTree(
    docid: string,
    prefix: string,
    lines: string[],
    maxDepth: number,
    depth: number,
    sortBy: TreeSortBy,
    descending: boolean,
  ): Promise<void> {
    if (depth >= maxDepth) {
      return;
    }
    const { dirs, files } = await this.api.listDir(docid, { by: "name" });
    const entries = [
      ...this.sortTreeEntries(dirs, sortBy, descending).map((entry) => ({ ...entry, dir: true })),
      ...this.sortTreeEntries(files, sortBy, descending).map((entry) => ({ ...entry, dir: false })),
    ];
    for (const [index, entry] of entries.entries()) {
      const last = index === entries.length - 1;
      const marker = last ? "└── " : "├── ";
      lines.push(`${prefix}${marker}${entry.name}${entry.dir ? "/" : ""}`);
      if (entry.dir) {
        await this.buildTree(entry.docid, `${prefix}${last ? "    " : "│   "}`, lines, maxDepth, depth + 1, sortBy, descending);
      }
    }
  }

  private createEmptyFile(): string {
    const tempFile = path.join(fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "bhpan-touch-")), "empty");
    fs.writeFileSync(tempFile, "");
    return tempFile;
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
