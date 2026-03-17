import fs from "node:fs";
import path from "node:path";

import { getAccessToken, rsaEncrypt } from "./auth.ts";
import { ApiError, downloadToFile, downloadToWritable, putFile, request, requestJson, streamFromFile } from "./network.ts";
import type { DirEntry, FileMetaData, LinkInfo, LinkShareType, ResourceInfo, UploadResult } from "./types.ts";

export class WrongPasswordError extends Error {}
export class MoveToChildDirectoryError extends Error {}

export class ApiManager {
  readonly baseUrl: string;
  #username: string;
  #password: string | null;
  #pubkey: string;
  #encrypted: string | null;
  #token = "";
  #expires = 0;

  constructor(options: {
    host: string;
    username: string;
    password?: string | null;
    pubkey: string;
    encrypted?: string | null;
    cachedToken?: string;
    cachedExpire?: number;
  }) {
    this.baseUrl = `https://${options.host}:443/api/efast/v1`;
    this.#username = options.username;
    this.#password = options.password ?? null;
    this.#pubkey = options.pubkey;
    this.#encrypted = options.encrypted ?? null;
    this.#token = options.cachedToken ?? "";
    this.#expires = options.cachedExpire ?? 0;
  }

  get encryptedPassword(): string | null {
    return this.#encrypted;
  }

  get accessToken(): string {
    return this.#token;
  }

  get tokenExpire(): number {
    return this.#expires;
  }

  async ensureToken(validate = false): Promise<void> {
    const needsRefresh = !this.#token || Date.now() / 1000 > this.#expires - 60;
    if (needsRefresh) {
      await this.updateToken();
      return;
    }
    if (validate) {
      try {
        await this.getEntryDoc();
      } catch (error) {
        if (error instanceof ApiError && this.extractErrorCode(error) === 401001001) {
          await this.updateToken();
          return;
        }
        throw error;
      }
    }
  }

  async updateToken(): Promise<void> {
    if (!this.#encrypted) {
      if (!this.#password) {
        throw new Error("缺少密码，无法刷新 token");
      }
      this.#encrypted = rsaEncrypt(this.#password, this.#pubkey);
    }
    try {
      this.#token = await getAccessToken(
        this.baseUrl.slice(0, this.baseUrl.indexOf("/api/efast/v1")),
        this.#username,
        this.#encrypted,
      );
    } catch (error) {
      if (error instanceof ApiError && this.extractErrorCode(error) === 401001003) {
        throw new WrongPasswordError("用户名或密码错误");
      }
      throw error;
    }
    this.#expires = Date.now() / 1000 + 3600;
  }

  async getEntryDoc(): Promise<Array<{ docid: string; name: string }>> {
    await this.ensureToken();
    return this.get("/entry-doc-lib?type=user_doc_lib&sort=doc_lib_name&direction=asc");
  }

  async listRoot(): Promise<Array<{ docid: string; name: string }>> {
    await this.ensureToken();
    return this.get("/entry-doc-lib?sort=doc_lib_name&direction=asc");
  }

  async getResourceInfoByPath(namepath: string): Promise<ResourceInfo | null> {
    await this.ensureToken();
    const normalizedPath = this.normalizeApiPath(namepath);
    if (!normalizedPath) {
      return null;
    }
    try {
      return await this.post<ResourceInfo>("/file/getinfobypath", { namepath: normalizedPath });
    } catch (error) {
      if (error instanceof ApiError) {
        const code = this.extractErrorCode(error);
        if (code === 404006 || code === 403024 || code === 404002006) {
          return null;
        }
      }
      throw error;
    }
  }

  async getResourcePath(docid: string): Promise<string> {
    await this.ensureToken();
    const payload = await this.post<{ namepath: string }>("/file/convertpath", { docid });
    return payload.namepath;
  }

  async getFileMeta(docid: string): Promise<FileMetaData> {
    await this.ensureToken();
    return this.post("/file/metadata", { docid });
  }

  async listDir(docid: string, options: { by?: string; sort?: string; withAttr?: boolean } = {}): Promise<{ dirs: DirEntry[]; files: DirEntry[] }> {
    await this.ensureToken();
    const payload = await this.post<{ dirs: DirEntry[]; files: DirEntry[] }>("/dir/list", {
      docid,
      attr: Boolean(options.withAttr),
      ...(options.by ? { by: options.by } : {}),
      ...(options.sort ? { sort: options.sort } : {}),
    });
    return payload;
  }

  async createDir(parentDirId: string, name: string): Promise<string> {
    await this.ensureToken();
    const payload = await this.post<{ docid: string }>("/dir/create", { docid: parentDirId, name });
    return payload.docid;
  }

  async createDirs(parentDirId: string, dirs: string): Promise<string> {
    await this.ensureToken();
    const payload = await this.post<{ docid: string }>("/dir/createdirs", { docid: parentDirId, dirs });
    return payload.docid;
  }

  async createDirsByPath(dirs: string): Promise<string> {
    await this.ensureToken();
    const payload = await this.post<{ docid: string }>("/dir/createdirsbypath", {
      namepath: this.normalizeApiPath(dirs),
    });
    return payload.docid;
  }

  async deleteDir(docid: string): Promise<void> {
    await this.ensureToken();
    await this.post("/dir/delete", { docid });
  }

  async deleteFile(docid: string): Promise<void> {
    await this.ensureToken();
    await this.post("/file/delete", { docid });
  }

  async rename(docid: string, name: string, renameOnDup = false): Promise<string | null> {
    await this.ensureToken();
    const payload = await this.post<{ name?: string }>("/file/rename", {
      docid,
      name,
      ondup: renameOnDup ? 2 : 1,
    });
    return renameOnDup ? payload.name || null : null;
  }

  async move(docid: string, destParent: string, renameOnDup = false, overwriteOnDup = false): Promise<string | { docid: string; name: string }> {
    await this.ensureToken();
    try {
      const payload = await this.post<{ docid: string; name: string }>("/file/move", {
        docid,
        destparent: destParent,
        ondup: renameOnDup ? 2 : overwriteOnDup ? 3 : 1,
      });
      return renameOnDup ? payload : payload.docid;
    } catch (error) {
      if (error instanceof ApiError && (error.payload as any)?.errcode === 403019) {
        throw new MoveToChildDirectoryError("不能移动到子目录");
      }
      throw error;
    }
  }

  async copy(docid: string, destParent: string, renameOnDup = false, overwriteOnDup = false): Promise<string | { docid: string; name: string }> {
    await this.ensureToken();
    try {
      const payload = await this.post<{ docid: string; name: string }>("/file/copy", {
        docid,
        destparent: destParent,
        ondup: renameOnDup ? 2 : overwriteOnDup ? 3 : 1,
      });
      return renameOnDup ? payload : payload.docid;
    } catch (error) {
      if (error instanceof ApiError && (error.payload as any)?.errcode === 403019) {
        throw new MoveToChildDirectoryError("不能复制到子目录");
      }
      throw error;
    }
  }

  async uploadFile(parentDirId: string, name: string, localPath: string): Promise<UploadResult> {
    await this.ensureToken();
    const existingPath = `${await this.getResourcePath(parentDirId)}/${name}`;
    const existing = await this.getResourceInfoByPath(existingPath);
    const fileSize = fs.statSync(localPath).size;
    const begin = await this.post<{
      authrequest: string[];
      docid: string;
      rev: string;
    }>("/file/osbeginupload", {
      docid: existing?.docid || parentDirId,
      length: fileSize,
      name: existing ? null : name,
      reqmethod: "PUT",
    });
    const headers: Record<string, string> = {};
    for (const header of begin.authrequest.slice(2)) {
      const [key, value] = header.split(": ", 2);
      if (key && value) {
        headers[key] = value;
      }
    }
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-length")) {
      headers["Content-Length"] = String(fileSize);
    }
    await putFile(begin.authrequest[1], headers, fileSize === 0 ? Buffer.alloc(0) : streamFromFile(localPath));
    await this.post("/file/osendupload", {
      docid: begin.docid,
      rev: begin.rev,
    });
    const uploaded = await this.getFileMeta(begin.docid);
    return {
      docid: begin.docid,
      name: uploaded.name,
    };
  }

  async downloadFile(docid: string, localPath: string): Promise<void> {
    await this.ensureToken();
    const payload = await this.post<{ authrequest: string[] }>("/file/osdownload", {
      docid,
      authtype: "QUERY_STRING",
    });
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await downloadToFile(payload.authrequest[1], fs.createWriteStream(localPath));
  }

  async catFile(docid: string, writable: NodeJS.WritableStream): Promise<void> {
    const url = await this.getDownloadUrl(docid);
    await downloadToWritable(url, writable);
  }

  async readFileBuffer(docid: string): Promise<Buffer> {
    const url = await this.getDownloadUrl(docid);
    const response = await request(url);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Download failed with status ${response.statusCode}`);
    }
    return response.body;
  }

  async listLinks(docid: string, itemType: "file" | "folder", type?: LinkShareType): Promise<LinkInfo[]> {
    await this.ensureToken();
    const query = type ? `?type=${encodeURIComponent(type)}` : "";
    return this.requestShare<LinkInfo[]>(`/doc-share/v1/links/${itemType}/${encodeURIComponent(docid)}${query}`, {
      method: "GET",
    });
  }

  async createAnonymousLink(payload: {
    item: {
      id: string;
      type: "file" | "folder";
      allow: string[];
    };
    title: string;
    expires_at: string;
    password: string;
    verify_mobile: boolean;
    limited_times: number;
  }): Promise<{ id: string }> {
    await this.ensureToken();
    return this.requestShare<{ id: string }>("/doc-share/v1/links/anonymous", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async createRealnameLink(payload: {
    item: {
      id: string;
      type: "file" | "folder";
    };
  }): Promise<{ id?: string }> {
    await this.ensureToken();
    return this.requestShare<{ id?: string }>("/doc-share/v1/links/realname", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateAnonymousLink(
    linkId: string,
    payload: {
      item: {
        id: string;
        type: "file" | "folder";
        allow: string[];
      };
      title: string;
      expires_at: string;
      password: string;
      verify_mobile: boolean;
      limited_times: number;
    },
  ): Promise<void> {
    await this.ensureToken();
    await this.requestShare<null>(`/doc-share/v1/links/anonymous/${encodeURIComponent(linkId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async deleteLink(linkId: string, type: "anonymous" | "realname"): Promise<void> {
    await this.ensureToken();
    await this.requestShare<null>(`/doc-share/v1/links/${type}/${encodeURIComponent(linkId)}`, {
      method: "DELETE",
    });
  }

  private async post<T = any>(pathName: string, body: Record<string, unknown> = {}): Promise<T> {
    return requestJson<T>(`${this.baseUrl}${pathName.startsWith("/") ? pathName : `/${pathName}`}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.#token}`,
      },
      body: JSON.stringify(body),
    });
  }

  private async get<T = any>(pathName: string): Promise<T> {
    return requestJson<T>(`${this.baseUrl}${pathName.startsWith("/") ? pathName : `/${pathName}`}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.#token}`,
      },
    });
  }

  private extractErrorCode(error: ApiError): number | undefined {
    const payload = error.payload as Record<string, unknown> | null;
    if (!payload) {
      return undefined;
    }
    const value = payload.code ?? payload.errcode;
    return typeof value === "number" ? value : undefined;
  }

  private normalizeApiPath(pathName: string): string {
    return pathName.replace(/^\/+/, "");
  }

  private async getDownloadUrl(docid: string): Promise<string> {
    await this.ensureToken();
    const payload = await this.post<{ authrequest: string[] }>("/file/osdownload", {
      docid,
      authtype: "QUERY_STRING",
    });
    return payload.authrequest[1];
  }

  private async requestShare<T>(
    pathName: string,
    options: {
      method: "GET" | "POST" | "PUT" | "DELETE";
      body?: string;
    },
  ): Promise<T> {
    const origin = this.baseUrl.slice(0, this.baseUrl.indexOf("/api/efast/v1"));
    return requestJson<T>(`${origin}/api${pathName.startsWith("/") ? pathName : `/${pathName}`}`, {
      method: options.method,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${this.#token}`,
      },
      ...(options.body ? { body: options.body } : {}),
    });
  }
}
