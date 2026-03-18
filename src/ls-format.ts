import type { RemoteWalkEntry } from "./remote-walk.ts";
import { formatSize, formatTimestamp } from "./utils.ts";
import { pad } from "./utils.ts";

export function formatLsRecursive(entries: RemoteWalkEntry[]): string[] {
  return entries.map((entry) => {
    const col1 = pad(entry.dir ? "dir" : formatSize(entry.size), 10);
    const tsRaw = entry.dir && (entry.modified == null) ? "-" : (entry.modified != null ? formatTimestamp(entry.modified) : "-");
    const col2 = pad(tsRaw, 19);
    const col3 = entry.path;
    return [col1, col2, col3].join(" ");
  });
}
