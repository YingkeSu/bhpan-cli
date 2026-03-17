import path from "node:path";

export function formatSize(num: number): string {
  let value = num;
  for (const unit of ["", "K", "M", "G", "T", "P"]) {
    if (Math.abs(value) < 1024) {
      return `${value.toFixed(1)}${unit}`;
    }
    value /= 1024;
  }
  return `${value.toFixed(1)}E`;
}

export function formatTimestamp(us?: number): string {
  if (!us) {
    return "-";
  }
  return new Date(us / 1000).toISOString().replace("T", " ").slice(0, 19);
}

export function normalizeRemotePath(input: string): string {
  const raw = input.trim();
  if (!raw) {
    return "/";
  }
  const normalized = path.posix.normalize(raw.startsWith("/") ? raw : `/${raw}`);
  return normalized === "." ? "/" : normalized;
}

export function resolveRemotePath(cwd: string, input?: string): string {
  if (!input || input === ".") {
    return normalizeRemotePath(cwd);
  }
  if (input.startsWith("/")) {
    return normalizeRemotePath(input);
  }
  return normalizeRemotePath(path.posix.join(cwd, input));
}

export function splitRemotePath(input: string): { parent: string; base: string } {
  const normalized = normalizeRemotePath(input);
  return {
    parent: path.posix.dirname(normalized),
    base: path.posix.basename(normalized),
  };
}

export function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

export function chunkToString(chunk: Uint8Array): string {
  return Buffer.from(chunk).toString("utf8");
}
