# 开发状态

最后更新：2026-03-19 00:00 UTC

## 当前总结

- 项目是一个 Node 22 CLI / 本地工具，采用"共享核心 + 单次 CLI + 交互式 shell"架构。
- **标准化开发流程已建立**：详见 [docs/WORKFLOW.md](./docs/WORKFLOW.md)
- 核心流程：开发前检查 issues/PRs → 测试通过后提交 → 等待 10 分钟检查 review → review 通过后才合并
- `main` 分支当前停在 `309acb4`（`v0.3.0` 发布）。
- 已公开发布的最新 npm 版本是 `bhpan-cli@0.3.0`，对应 commit `309acb4`，tag `v0.3.0` 已推送到 GitHub。
- GitHub PR `#3` 已合并：<https://github.com/YingkeSu/bhpan-cli/pull/3>，包含 v0.3.0 的所有新功能。
- 工作目录干净，无未提交的更改。

## 已完成工作

- 已完成 TypeScript 重写的一期主体，覆盖认证、路径解析、基础文件管理、上传下载、分享链路、单次 CLI 和交互式 shell。
- 已完成 AnyShare 当前线上站点的认证适配，包括 `/oauth2/auth`、`__NEXT_DATA__` 中的 `signin` 参数提取、Hydra `consent` 跳转，以及 Bearer token 鉴权。
- 已完成 `tree`、`head`、`tail`、`touch`、`link`（匿名 / 实名）等命令接入。

### v0.3.0 新功能

**Tree 命令增强**
- `--stats`: 显示目录/文件数量和总大小统计
- `--type f|d`: 按类型过滤（仅文件/仅目录）
- `--exclude-regex`: 排除匹配正则的文件

**Shell 改进**
- Tab 补全：支持命令名和远程路径补全
- 命令状态提示：prompt 显示上次命令结果（✓/✗/?）

**Link 命令增强**
- `--title`: 设置分享标题
- `--limited-times`: 限制访问次数
- `--forever`: 永久分享

**基础设施（为未来功能准备）**
- `src/retry.ts`: 指数退避重试工具
- `src/transfer-state.ts`: 传输状态持久化（用于断点续传）

**修复**
- `fetchTreeNodes` 现在复制 `entry.size` 到 `TreeNode`，修复 `tree --stats` 显示大小为 0 的问题
- `filterTree` 先应用 `excludeRegex` 再应用 `includeRegex`，修复两者同时使用时 exclude 无效的问题
- Shell 补全现在正确忽略选项标志，`head -n 5 /foo` 等命令可以正确补全路径

### v0.2.x 历史版本

**v0.2.2**
- 修复 `rm -r` 缺少 operand 时可能递归删除 `/` 或 shell 当前目录的危险行为
- 修复 `mv -f <src>` / `cp -f <src>` 缺少目标路径时可能默默移动/复制到错误位置的问题
- 修复 `head -n 5` / `tail -n 5` 缺少文件参数时未报错的问题

**v0.2.1**
- 修复 `rm`、`head`、`tail`、`mv`、`cp` 的标志位顺序问题
- 修复 `npm test` 无法运行的问题
- 修复 `ls -R` 不显示目标目录本身的问题

**v0.2.0**
- 新增 `ls -R` 递归列出功能
- 新增 `--regex` 正则表达式过滤
- 新增 `-L/--depth` 深度限制参数

## 已验证行为

- 本地验证通过：
  - `npm test`（22 个测试全部通过）
  - `npm run typecheck`
  - `npm run check`
  - `npm run build`
- 发布链路验证通过：
  - `git push origin main`
  - `git push origin v0.3.0`
  - `npm_config_cache=/tmp/npm-cache npm publish`
- 发布结果已确认：
  - npm 发布成功返回 `+ bhpan-cli@0.3.0`
  - GitHub tag `v0.3.0` 已存在并指向 `309acb4`
  - PR `#3` 已合并到 `main`
- 当前最可信的命令主链：
  - `ls`、`tree`、`stat`、`mkdir`、`rm`、`mv`、`cp`
  - `cat`、`head`、`tail`、`touch`
  - `upload`、`download`、`link`

## CLI / 工作流关注点

- 入口命令：
  - 开发态：`node --experimental-transform-types ./src/main.ts`
  - 交互式 shell：`node --experimental-transform-types ./src/main.ts shell`
  - 发布态：npm 安装后的 `bhpan`
- 平台前提：
  - Node `>= 22`
  - 开发态依赖 `--experimental-transform-types`
- 命令解析策略：
  - 所有命令支持 flag 前后位置无关
  - 缺少必填 operand 时直接报用法错误

## GitHub Code Review 工作流

> **完整流程详见 [docs/WORKFLOW.md](./docs/WORKFLOW.md)**

核心要点：
1. **开发前必查**：`gh issue list` + `gh pr list` 检查待处理项
2. **测试必过**：`npm run typecheck` + `npm test` + `npm run build` 全部通过
3. **等待 10 分钟**：PR 提交后等待 10 分钟再检查 Codex review 结果
4. **循环直到通过**：review 未通过则修复并重新提交，重复直到 APPROVED

快速命令：
```bash
# 开发前检查
gh issue list --repo YingkeSu/bhpan-cli --state open
gh pr list --repo YingkeSu/bhpan-cli --state open

# 本地验证
npm run typecheck && npm test && npm run build

# PR 操作
gh pr create --repo YingkeSu/bhpan-cli --base main --head opencode
gh pr view --repo YingkeSu/bhpan-cli --json reviewDecision

# 等待 10 分钟后检查 review
sleep 600 && gh pr view --repo YingkeSu/bhpan-cli --json reviewDecision
```

## 已知问题与风险

- `mv` / `cp` 不支持使用 `-f` 直接覆盖目录；目标是目录时需手动删除。
- `tree` 对深层目录做全量递归，执行时间较长。
- 大文件上传/下载、递归目录传输、异常中断恢复未系统性验证。
- `retry.ts` 和 `transfer-state.ts` 是基础设施，尚未集成到 upload/download 流程。

## 下一步

1. **完善基础设施**：
   - 将 `retry.ts` 集成到 upload/download 操作
   - 将 `transfer-state.ts` 集成到传输流程，支持断点续传
2. **增强功能**：
   - 递归目录上传/下载
   - 大文件分块传输
   - 传输进度显示

## 关键文件

- [package.json](/root/Programs/bhpan_cli/package.json)
- [CHANGELOG.md](/root/Programs/bhpan_cli/CHANGELOG.md)
- [README.md](/root/Programs/bhpan_cli/README.md)
- [AGENTS.md](/root/Programs/bhpan_cli/AGENTS.md)
- [src/main.ts](/root/Programs/bhpan_cli/src/main.ts)
- [src/shell.ts](/root/Programs/bhpan_cli/src/shell.ts)
- [src/cli-options.ts](/root/Programs/bhpan_cli/src/cli-options.ts)
- [src/client.ts](/root/Programs/bhpan_cli/src/client.ts)
- [src/tree-format.ts](/root/Programs/bhpan_cli/src/tree-format.ts)
- [src/retry.ts](/root/Programs/bhpan_cli/src/retry.ts)
- [src/transfer-state.ts](/root/Programs/bhpan_cli/src/transfer-state.ts)
- [scripts/verify-mv-cp.ts](/root/Programs/bhpan_cli/scripts/verify-mv-cp.ts)
- [test/suite.test.ts](/root/Programs/bhpan_cli/test/suite.test.ts)
- [test/prompt.test.ts](/root/Programs/bhpan_cli/test/prompt.test.ts)

## 关键命令

```bash
npm test
npm run typecheck
npm run check
npm run build
npm_config_cache=/tmp/npm-cache npm pack --dry-run
npm_config_cache=/tmp/npm-cache npm publish
git push origin opencode
gh pr create --repo YingkeSu/bhpan-cli --base main --head opencode
gh pr view --repo YingkeSu/bhpan-cli --json url,state
```
