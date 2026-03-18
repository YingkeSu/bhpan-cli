import path from "node:path";

import type { DirEntry } from "./types.ts";

export interface RemoteWalkEntry {
  path: string;
  docid: string;
  dir: boolean;
  size: number;
  modified?: number;
}

export async function walkRemote(options: {
  rootPath: string;
  rootDocid: string;
  maxDepth: number;
  listDir: (docid: string) => Promise<{ dirs: DirEntry[]; files: DirEntry[] }>;
}): Promise<RemoteWalkEntry[]> {
  const result: RemoteWalkEntry[] = [];

  const sortByName = (entries: DirEntry[]): DirEntry[] => {
    return [...entries].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  };

  const walk = async (currentPath: string, currentDocid: string, depth: number): Promise<void> => {
    if (depth >= options.maxDepth) {
      return;
    }

    const { dirs, files } = await options.listDir(currentDocid);
    const sortedDirs = sortByName(dirs);
    const sortedFiles = sortByName(files);

    for (const entry of sortedDirs) {
      const fullPath = path.posix.join(currentPath, entry.name);
      result.push({
        path: fullPath,
        docid: entry.docid,
        dir: true,
        size: entry.size,
        modified: entry.modified,
      });
      await walk(fullPath, entry.docid, depth + 1);
    }

    for (const entry of sortedFiles) {
      result.push({
        path: path.posix.join(currentPath, entry.name),
        docid: entry.docid,
        dir: false,
        size: entry.size,
        modified: entry.modified,
      });
    }
  };

  await walk(options.rootPath, options.rootDocid, 0);
  return result;
}
