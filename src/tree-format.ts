export interface TreeNode {
  name: string;
  dir: boolean;
  fullPath: string;
  children?: TreeNode[];
}

export function filterTree(nodes: TreeNode[], regex?: RegExp): TreeNode[] {
  if (!regex) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const children = node.children ? filterTree(node.children, regex) : undefined;

    regex.lastIndex = 0;
    const keep = regex.test(node.fullPath) || ((children?.length ?? 0) > 0);
    if (!keep) {
      return [];
    }

    return [{ ...node, ...(node.children ? { children } : {}) }];
  });
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
