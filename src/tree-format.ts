export interface TreeNode {
  name: string;
  dir: boolean;
  fullPath: string;
  size?: number;
  children?: TreeNode[];
}

export interface TreeStats {
  dirs: number;
  files: number;
  totalSize: number;
}

export function filterTree(
  nodes: TreeNode[],
  options: {
    includeRegex?: RegExp;
    excludeRegex?: RegExp;
    type?: "f" | "d";
  } = {},
): TreeNode[] {
  const { includeRegex, excludeRegex, type } = options;

  return nodes.flatMap((node) => {
    // Type filtering: 'f' shows only files, 'd' shows only dirs, but always keep structure
    if (type === "f" && node.dir) {
      // For file-only filter, keep dir nodes if they have matching children
      const filteredChildren = node.children ? filterTree(node.children, options) : undefined;
      if ((filteredChildren?.length ?? 0) > 0) {
        return [{ ...node, children: filteredChildren }];
      }
      return [];
    }
    if (type === "d" && !node.dir) {
      return [];
    }

    if (excludeRegex) {
      excludeRegex.lastIndex = 0;
      const excluded = excludeRegex.test(node.fullPath);
      if (excluded) {
        return [];
      }
    }

    if (includeRegex) {
      includeRegex.lastIndex = 0;
      const matches = includeRegex.test(node.fullPath);
      const filteredChildren = node.children ? filterTree(node.children, options) : undefined;
      const hasMatchingChildren = (filteredChildren?.length ?? 0) > 0;
      
      if (!matches && !hasMatchingChildren) {
        return [];
      }
      return [{ ...node, ...(node.children ? { children: filteredChildren } : {}) }];
    }

    // Recursively filter children
    const filteredChildren = node.children ? filterTree(node.children, options) : undefined;
    return [{ ...node, ...(filteredChildren ? { children: filteredChildren } : {}) }];
  });
}

// Legacy wrapper for backward compatibility
export function filterTreeLegacy(nodes: TreeNode[], regex?: RegExp): TreeNode[] {
  return filterTree(nodes, { includeRegex: regex });
}

export function calculateStats(nodes: TreeNode[]): TreeStats {
  let dirs = 0;
  let files = 0;
  let totalSize = 0;

  function traverse(node: TreeNode): void {
    if (node.dir) {
      dirs++;
    } else {
      files++;
      totalSize += node.size ?? 0;
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return { dirs, files, totalSize };
}

export function renderTree(nodes: TreeNode[], prefix: string = ""): string[] {
  const lines: string[] = [];
  for (const [index, node] of nodes.entries()) {
    const last = index === nodes.length - 1;
    const marker = last ? "└── " : "├── ";
    lines.push(`${prefix}${marker}${node.name}${node.dir ? "/" : ""}`);

    if (node.children && node.children.length > 0) {
      const childPrefix = `${prefix}${last ? "    " : "│   "}`;
      lines.push(...renderTree(node.children, childPrefix));
    }
  }

  return lines;
}
