export interface CachedToken {
  token: string;
  expires: number;
}

export interface AppConfig {
  revision: number;
  host: string;
  pubkey: string;
  username: string | null;
  encrypted: string | null;
  storePassword: boolean;
  cachedToken: CachedToken;
}

export interface ResourceInfo {
  size: number;
  docid: string;
  name: string;
  rev?: string;
  client_mtime?: number;
  modified?: number;
}

export interface FileMetaData {
  size: number;
  docid: string;
  rev?: string;
  modified?: number;
  client_mtime?: number;
  name: string;
  editor?: string;
  site?: string;
  tags?: string[];
}

export type LinkShareType = "anonymous" | "realname";
export type LinkFilterType = LinkShareType | "all";
export type TreeSortBy = "name" | "mtime" | "size";

export interface LinkItemInfo {
  id?: string;
  type?: "file" | "folder" | string;
  allow?: string[];
  perms?: string[];
  read_policy?: Record<string, { enable: boolean }>;
}

export interface LinkInfo {
  id: string;
  type: LinkShareType | string;
  title?: string;
  password?: string;
  verify_mobile?: boolean;
  expires_at?: string;
  limited_times?: number;
  accessed_times?: number;
  created_at?: string;
  item?: LinkItemInfo;
}

export interface UploadResult {
  docid: string;
  name: string;
}

export interface DirEntry {
  creator?: string;
  size: number;
  modified?: number;
  name: string;
  docid: string;
}
