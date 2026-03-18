# 开发状态

最后更新：2026-03-18 11:40 CST

## 当前总结

- 项目是一个 Node 22 CLI / 本地工具，采用"共享核心 + 单次 CLI + 交互式 shell"架构。
- `main` 分支当前停在 `1936c2b`（准备 `v0.2.2` 发布）。
- 已公开发布的最新 npm 版本是 `bhpan-cli@0.2.1`，对应 commit `649c443`，tag `v0.2.1` 已推送到 GitHub。
- GitHub PR `#2` 已合并：<https://github.com/YingkeSu/bhpan-cli/pull/2>，包含 `v0.2.2` 的修复内容。
- package.json 版本已更新为 `0.2.2`，待发布到 npm。
- 工作目录有未提交的新功能开发中（tree 增强、shell 补全、link 增强、传输重试机制）。

## 已完成工作

- 已完成 TypeScript 重写的一期主体，覆盖认证、路径解析、基础文件管理、上传下载、分享链路、单次 CLI 和交互式 shell。
- 已完成 AnyShare 当前线上站点的认证适配，包括 `/oauth2/auth`、`__NEXT_DATA__` 中的 `signin` 参数提取、Hydra `consent` 跳转，以及 Bearer token 鉴权。
- 已完成 `tree`、`head`、`tail`、`touch`、`link`（匿名 / 实名）等命令接入。
- 已完成 `v0.2.0` 级别功能：
  - `ls -R` 递归列出。
  - `ls` / `tree` 的 `--regex` 过滤。
  - `ls -R -L` 深度限制。
  - `mv` / `cp` 真实账号专项回归脚本：[scripts/verify-mv-cp.ts](/root/Programs/bhpan_cli/scripts/verify-mv-cp.ts)。
- 已完成 `v0.2.1` 级别修复：
  - 恢复 `npm test` 可运行，并重新纳入 `npm run check`。
  - 修复 `ls -R` 不显示目标目录本身的问题，使 `-L 0` 和针对目标路径的 `--regex` 生效。
  - 修复 `rm` / `head` / `tail` / `mv` / `cp` 的 flag 顺序解析问题。
- 已完成 `v0.2.2` 级别修复（已合并，待发布）：
  - 修复 `rm -r` 缺少 operand 时可能递归删除 `/` 或 shell 当前目录的问题。
  - 修复 `mv -f <src>` / `cp -f <src>` 缺少目标路径时可能默默移动 / 复制到 `/` 或当前目录的问题。
  - 修复 `head -n 5` / `tail -n 5` 缺少文件参数时的显式用法报错。
  - 所有命令现在正确验证必填位置参数，避免误解析为 `/`、`/home` 或当前目录。
- GitHub Codex review 已完成首次闭环：
  - PR `#2` 创建后触发 `@codex review`。
  - Codex 对 commit `649c443` 给出两条 inline review。
  - 修复后推送 commit `9596423` 并合并到 `main`。

## 开发中功能（未提交）

工作目录有以下新功能正在开发：

- **tree 增强功能**：
  - `--stats` 显示目录/文件数量和总大小统计。
  - `--type f|d` 按类型过滤（仅文件/仅目录）。
  - `--exclude-regex` 排除匹配正则的文件。
- **shell 补全功能**：
  - `completeShellLine` 函数支持命令名和远程路径补全。
  - 命令首字母补全（如 `l` → `ls`, `link`, `logout`）。
  - 远程路径补全，目录自动追加 `/`。
- **link 命令增强**：
  - `--title` 设置分享标题。
  - `--limited-times` 限制访问次数。
  - `--forever` 永久分享。
- **传输增强（部分实现）**：
  - `src/retry.ts`：重试配置和指数退避逻辑。
  - `src/transfer-state.ts`：传输状态持久化结构。
- **shell 状态提示**：
  - `lastStatus` 跟踪上次命令执行结果（成功/失败/未知）。
  - prompt 显示命令状态（✓/✗/?）。
- **新增文件**：
  - `.github/PULL_REQUEST_TEMPLATE.md`：PR 模板。
  - `AGENTS.md`：项目指南文档。
  - `src/retry.ts`、`src/transfer-state.ts`：传输增强模块。
  - `test/prompt.test.ts`：prompt 渲染测试。

## 已验证行为

- 本地验证通过：
  - `npm test`（19 个测试全部通过）
  - `npm run typecheck`
  - `npm run check`
  - `npm run build`
  - `npm_config_cache=/tmp/npm-cache npm pack --dry-run`
- 发布链路验证通过：
  - `git push origin opencode`
  - `git push origin v0.2.1`
  - `npm_config_cache=/tmp/npm-cache npm publish`
- 发布结果已确认：
  - npm 发布成功返回 `+ bhpan-cli@0.2.1`
  - GitHub tag `v0.2.1` 已存在并指向 `649c443`
  - PR `#2` 已合并到 `main`
- 当前最可信的命令主链：
  - `ls`、`tree`、`stat`、`mkdir`、`rm`、`mv`、`cp`
  - `cat`、`head`、`tail`、`touch`
  - `upload`、`download`、`link`
- 真实站点联调已确认：
  - OAuth2 登录与 token 刷新
  - `/home` 路径解析
  - 文件上传下载
  - 递归创建目录
  - 匿名/实名分享
  - `mv`/`cp` 覆盖操作

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

- 代码开发在 `opencode` 分支进行，通过 PR 合入 `main`。
- 标准步骤：
  1. 本地完成实现与验证：`npm test`、`npm run check`、`npm run build`
  2. 推送分支：`git push origin opencode`
  3. 创建或更新 PR 到 `main`
  4. 在 PR 中评论 `@codex review`
  5. 按 Codex 反馈修复并 push
  6. 合并后发布

## 已知问题与风险

- `v0.2.2` 尚未发布到 npm，需要执行发布流程。
- `mv` / `cp` 不支持使用 `-f` 直接覆盖目录；目标是目录时需手动删除。
- `tree` 对深层目录做全量递归，执行时间较长。
- 大文件上传/下载、递归目录传输、异常中断恢复未系统性验证。
- 开发中的新功能（tree 增强、shell 补全等）需要完成并提交。

## 下一步

1. **发布 v0.2.2**：
   - 确认 `npm run check` 通过
   - `npm run build`
   - `npm_config_cache=/tmp/npm-cache npm publish`
   - 创建 GitHub tag `v0.2.2`
2. **完成开发中功能**：
   - 完善 tree 增强（`--stats`、`--type`、`--exclude-regex`）
   - 完善 shell 补全功能
   - 完善 link 命令增强
   - 完成传输重试机制
3. **提交并创建 PR**：
   - 将工作目录的修改提交到 `opencode` 分支
   - 创建新的 PR 进行 review

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
