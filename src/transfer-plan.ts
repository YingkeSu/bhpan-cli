import fs from "node:fs";
import path from "node:path";

export interface UploadPlanFile {
  localPath: string;
  remotePath: string;
  size: number;
}

export interface UploadPlan {
  type: "upload";
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

  if (rootStat && rootStat.isFile()) {
    const baseName = path.basename(localPath);
    walk(localPath, `${normalizedRemoteDir}/${baseName}`);
  } else {
    walk(localPath, normalizedRemoteDir);
  }

  files.sort((a, b) => a.localPath.localeCompare(b.localPath, "en"));

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return {
    type: "upload",
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
      await walk(dirRemotePath, dirLocalPath, dir.docid);
    }
  }

  const rootInfo = options.getRootInfo
    ? await options.getRootInfo()
    : null;

  if (rootInfo && rootInfo.size >= 0) {
    const baseName = path.posix.basename(normalizedRemotePath);
    files.push({
      docid: rootInfo.docid,
      remotePath: normalizedRemotePath,
      localPath: path.join(normalizedLocalDir, baseName),
      size: rootInfo.size,
    });
  } else if (rootInfo) {
    const baseName = path.posix.basename(normalizedRemotePath);
    const rootLocalPath = normalizedRemotePath === "" ? normalizedLocalDir : path.join(normalizedLocalDir, baseName);
    await walk(normalizedRemotePath, rootLocalPath, rootInfo.docid);
  }

  files.sort((a, b) => a.remotePath.localeCompare(b.remotePath, "en"));

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return {
    type: "download",
    files,
    totalSize,
  };
}
