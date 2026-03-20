import fs from "node:fs";
import path from "node:path";

export interface UploadPlanFile {
  localPath: string;
  remotePath: string;
  size: number;
}

export interface UploadPlan {
  type: "upload";
  directories: string[];
  files: UploadPlanFile[];
  totalSize: number;
}

export interface DownloadPlanFile {
  docid: string;
  remotePath: string;
  localPath: string;
  size: number;
}

export interface DownloadPlan {
  type: "download";
  directories: string[];
  files: DownloadPlanFile[];
  totalSize: number;
}

export type TransferPlan = UploadPlan | DownloadPlan;

export interface ListDirResult {
  dirs: { name: string; docid: string; size: number }[];
  files: { name: string; docid: string; size: number }[];
}

export interface RemoteWalkEntry {
  path: string;
  docid: string;
  dir: boolean;
  size: number;
}

export type ListDirFn = (docid: string) => Promise<ListDirResult>;

export function buildUploadPlan(
  localPath: string,
  remoteDir: string,
  options: { filter?: (localPath: string) => boolean } = {},
): UploadPlan {
  const directories: string[] = [];
  const files: UploadPlanFile[] = [];
  const normalizedRemoteDir = remoteDir.replace(/\/+$/, "");

  function walk(currentLocal: string, currentRemote: string): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(currentLocal);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      directories.push(currentRemote);
      const entries = fs.readdirSync(currentLocal);
      for (const entry of entries) {
        const childLocal = path.join(currentLocal, entry);
        const childRemote = `${currentRemote}/${entry}`;
        walk(childLocal, childRemote);
      }
    } else if (stat.isFile()) {
      if (options.filter && !options.filter(currentLocal)) {
        return;
      }
      files.push({
        localPath: currentLocal,
        remotePath: currentRemote,
        size: stat.size,
      });
    }
  }

  let rootStat: fs.Stats | null = null;
  try {
    rootStat = fs.statSync(localPath);
  } catch {
    // Path doesn't exist, return empty plan
  }

  if (rootStat) {
    const baseName = path.basename(localPath);
    const remoteTarget = `${normalizedRemoteDir}/${baseName}`;
    walk(localPath, remoteTarget);
  }

  directories.sort((a, b) => a.localeCompare(b, "en"));
  files.sort((a, b) => a.localPath.localeCompare(b.localPath, "en"));

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return {
    type: "upload",
    directories,
    files,
    totalSize,
  };
}

export async function buildDownloadPlan(
  remotePath: string,
  localDir: string,
  listDir: ListDirFn,
  options: {
    getRootInfo?: () => Promise<{ docid: string; size: number } | null>;
    filter?: (remotePath: string) => boolean;
  } = {},
): Promise<DownloadPlan> {
  const directories: string[] = [];
  const files: DownloadPlanFile[] = [];
  const normalizedRemotePath = remotePath.replace(/\/+$/, "");
  const normalizedLocalDir = localDir.replace(/\/+$/, "");

  async function walk(currentRemote: string, currentLocal: string, docid: string): Promise<void> {
    const { dirs, files: dirFiles } = await listDir(docid);

    for (const file of dirFiles) {
      const fileRemotePath = `${currentRemote}/${file.name}`;
      if (options.filter && !options.filter(fileRemotePath)) {
        continue;
      }
      files.push({
        docid: file.docid,
        remotePath: fileRemotePath,
        localPath: path.join(currentLocal, file.name),
        size: file.size,
      });
    }

    for (const dir of dirs) {
      const dirRemotePath = `${currentRemote}/${dir.name}`;
      const dirLocalPath = path.join(currentLocal, dir.name);
      directories.push(dirLocalPath);
      await walk(dirRemotePath, dirLocalPath, dir.docid);
    }
  }

  const rootInfo = options.getRootInfo
    ? await options.getRootInfo()
    : null;

  if (rootInfo && rootInfo.size >= 0) {
    const baseName = path.posix.basename(normalizedRemotePath);
    const fileRemotePath = normalizedRemotePath;
    if (!options.filter || options.filter(fileRemotePath)) {
      files.push({
        docid: rootInfo.docid,
        remotePath: fileRemotePath,
        localPath: path.join(normalizedLocalDir, baseName),
        size: rootInfo.size,
      });
    }
  } else if (rootInfo) {
    const baseName = path.posix.basename(normalizedRemotePath);
    const rootLocalPath = normalizedRemotePath === "" ? normalizedLocalDir : path.join(normalizedLocalDir, baseName);
    directories.push(rootLocalPath);
    await walk(normalizedRemotePath, rootLocalPath, rootInfo.docid);
  }

  directories.sort((a, b) => a.localeCompare(b, "en"));
  files.sort((a, b) => a.remotePath.localeCompare(b.remotePath, "en"));

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return {
    type: "download",
    directories,
    files,
    totalSize,
  };
}
