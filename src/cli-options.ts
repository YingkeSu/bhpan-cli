import type { LinkFilterType, LinkShareType, TreeSortBy } from "./types.ts";

export function takeFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return undefined;
  }
  const [value] = args.splice(index, 2).slice(1);
  return value;
}

export function takeNumberFlag(args: string[], ...names: string[]): number | undefined {
  for (const name of names) {
    const value = takeFlag(args, name);
    if (value !== undefined) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${name} 需要数字参数`);
      }
      return parsed;
    }
  }
  return undefined;
}

export function takeIntegerFlag(args: string[], ...names: string[]): number | undefined {
  const value = takeNumberFlag(args, ...names);
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${names[0]} 需要非负整数参数`);
  }
  return value;
}

export function takeEnumFlag<T extends string>(args: string[], name: string, allowed: readonly T[]): T | undefined {
  const value = takeFlag(args, name);
  if (value === undefined) {
    return undefined;
  }
  if (!allowed.includes(value as T)) {
    throw new Error(`${name} 只支持: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function takeBooleanFlag(args: string[], ...names: string[]): boolean {
  let matched = false;
  for (const name of names) {
    for (let index = args.indexOf(name); index !== -1; index = args.indexOf(name)) {
      args.splice(index, 1);
      matched = true;
    }
  }
  return matched;
}

export function takeRegexFlag(args: string[], name = "--regex"): RegExp | undefined {
  const pattern = takeFlag(args, name);
  if (pattern === undefined) {
    return undefined;
  }
  try {
    return new RegExp(pattern);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`invalid regex for ${name}: ${msg}`);
  }
}

export function takeTreeOptions(args: string[]): {
  maxDepth?: number;
  sortBy: TreeSortBy;
  descending: boolean;
  regex?: RegExp;
} {
  return {
    maxDepth: takeIntegerFlag(args, "-L", "--depth"),
    sortBy: takeEnumFlag(args, "--sort", ["name", "mtime", "size"] as const) ?? "name",
    descending: takeBooleanFlag(args, "--desc"),
    regex: takeRegexFlag(args, "--regex"),
  };
}

export function takeLsOptions(args: string[]): { recursive: boolean; maxDepth?: number; regex?: RegExp } {
  const recursive = takeBooleanFlag(args, "-R", "--recursive");
  const maxDepth = takeIntegerFlag(args, "-L", "--depth");
  const regex = takeRegexFlag(args, "--regex");
  if (maxDepth !== undefined && !recursive) {
    throw new Error("--depth/-L requires recursive (-R/--recursive) to be set");
  }
  return {
    recursive,
    maxDepth,
    regex,
  };
}

export function takeReadOptions(args: string[]): { target?: string; lines: number } {
  const lines = takeNumberFlag(args, "-n", "--lines") ?? 10;
  return {
    target: args[0],
    lines,
  };
}

export function takeRmOptions(args: string[]): { target?: string; recursive: boolean } {
  const recursive = takeBooleanFlag(args, "-r", "--recursive");
  return {
    target: args[0],
    recursive,
  };
}

export function takeMoveOptions(args: string[]): { src?: string; dst?: string; overwrite: boolean } {
  const overwrite = takeBooleanFlag(args, "-f", "--force");
  return {
    src: args[0],
    dst: args[1],
    overwrite,
  };
}

export function takeLinkTypeFlag(args: string[], allowAll = false): LinkFilterType | LinkShareType | undefined {
  const explicit = takeEnumFlag(args, "--type", allowAll ? ["anonymous", "realname", "all"] as const : ["anonymous", "realname"] as const);
  const wantsRealname = takeBooleanFlag(args, "--realname");
  const wantsAnonymous = takeBooleanFlag(args, "--anonymous");
  if (wantsRealname && wantsAnonymous) {
    throw new Error("不能同时指定 --realname 和 --anonymous");
  }
  if (explicit && (wantsRealname || wantsAnonymous)) {
    throw new Error("不能同时指定 --type 与 --realname/--anonymous");
  }
  if (explicit) {
    return explicit;
  }
  if (wantsRealname) {
    return "realname";
  }
  if (wantsAnonymous) {
    return "anonymous";
  }
  return undefined;
}
