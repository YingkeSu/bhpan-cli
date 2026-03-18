# 开发状态

最后更新：2026-03-18 10:35 CST

## 当前总结

- 项目是一个 Node 22 CLI / 本地工具，当前结构仍然是“共享核心 + 单次 CLI + 交互式 shell”。
- `main` 分支当前停在 `acd9cfc`（`v0.1.2`）；活跃开发分支是 `opencode`。
- 已公开发布的最新 npm 版本是 `bhpan-cli@0.2.1`，对应 commit `649c443`，tag `v0.2.1` 已推送到 GitHub。
- `opencode` 当前 HEAD 是 `9596423`，这是 `0.2.1` 发布后的补丁提交，修复了 Codex GitHub review 指出的“缺少必填位置参数时会误解析为 `/` 或当前目录”的问题；该提交尚未发布到 npm。
- GitHub PR `#2` 已创建：<https://github.com/YingkeSu/bhpan-cli/pull/2>。该 PR 当前从 `opencode` 指向 `main`，用于承接 `v0.2.x` 的功能与修复。
- GitHub Codex review 已经接入实际工作流，不再是假设配置：PR 建立后，评论 `@codex review` 会触发 `chatgpt-codex-connector` review；本轮已收到两条 inline review，并已根据反馈修复后再次请求 review。

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
- 已完成 `v0.2.1` 发布后的补丁修复（未发布）：
- 修复 `rm -r` 缺少 operand 时可能递归删除 `/` 或 shell 当前目录的问题。
- 修复 `mv -f <src>` / `cp -f <src>` 缺少目标路径时可能默默移动 / 复制到 `/` 或当前目录的问题。
- 顺手补齐 `head -n 5` / `tail -n 5` 缺少文件参数时的显式用法报错。
- 已将 GitHub Codex review 纳入实际工作流，并完成首次闭环：
- 2026-03-18 创建 PR `#2`。
- 2026-03-18 在 PR 中评论 `@codex review`。
- Codex 对 commit `649c443` 给出两条 inline review。
- 修复后推送 commit `9596423`，并再次评论 `@codex review` 请求复查。

## 已验证行为

- 本地验证通过：
- `npm test`
- `npm run check`
- `npm run build`
- `npm_config_cache=/tmp/npm-cache npm pack --dry-run`
- 发布链路验证通过：
- `git push origin opencode`
- `git push origin v0.2.1`
- `npm_config_cache=/tmp/npm-cache npm publish`
- 发布结果已确认：
- GitHub 分支 `origin/opencode` 已更新到 `9596423`
- GitHub tag `v0.2.1` 已存在并指向 `649c443`
- npm 发布成功返回 `+ bhpan-cli@0.2.1`
- GitHub review 触发已确认：
- PR `#2` 地址：<https://github.com/YingkeSu/bhpan-cli/pull/2>
- `@codex review` 评论已被 `chatgpt-codex-connector[bot]` 响应
- Codex 已生成针对 commit `649c443` 的 review，并给出两条 inline comment
- 2026-03-18 10:31 CST 已在修复提交 `9596423` 后再次请求 review
- 当前最可信的命令主链：
- `ls`
- `tree`
- `stat`
- `mkdir`
- `rm`
- `mv`
- `cp`
- `cat`
- `head`
- `tail`
- `touch`
- `upload`
- `download`
- `link`
- 真实站点联调已确认：
- OAuth2 登录与 token 刷新
- `/home` 路径解析
- `ls /home`
- `ls /home/code`
- 上传小文件到 `/home/code`
- 下载同一文件到本地并校验内容一致
- 递归创建目录
- 创建空文件
- `head -n 2`
- `tail -n 2`
- 小目录 `tree`
- 匿名分享 `link create/show/delete`
- 实名分享 `link create/show/delete`
- `link delete --type all`
- `tree -L 1 --sort size --desc`
- 同目录 `cp <src> <dst>`
- 跨目录 `mv <src> <dst>`
- `cp <src> <existing-dir> -f` 覆盖目录内同名文件
- `mv <src> <existing-dir> -f` 覆盖目录内同名文件
- 同路径 `mv` / `cp` 保护

## CLI / 工作流关注点

- 入口命令：
- 开发态：`node --experimental-transform-types ./src/main.ts`
- 交互式 shell：`node --experimental-transform-types ./src/main.ts shell`
- 发布态：npm 安装后的 `bhpan`
- 平台前提：
- Node `>= 22`
- 开发态依赖 `--experimental-transform-types`
- 真实 AnyShare 站点联调仍比纯本地测试更重要
- 当前命令解析策略：
- `ls` / `tree` 已支持 flag 前后位置无关
- `rm` / `head` / `tail` / `mv` / `cp` 现在也支持 flag 前置
- 缺少必填 operand 时必须直接报用法错误，不允许再 fallback 到 `/`、`/home` 或当前目录

## GitHub Code Review 工作流

- 代码开发仍在 `opencode` 分支进行，不直接向 `main` 推送。
- 需要 review 的改动统一通过 PR 合入 `main`。
- 标准步骤：
- 先在本地完成实现与最小验证：`npm test`、`npm run check`、`npm run build`
- 推送分支：`git push origin opencode`
- 创建或更新 PR 到 `main`
- 在 PR 中评论 `@codex review`
- 如果 Codex 提出问题，在同一分支修复并 push
- 在 PR 中用一条评论说明修复内容，并再次评论 `@codex review`
- 只有在 PR review 没有新的 blocker 后，才进入合并 / 发布步骤
- 当前已验证的事实：
- 直接 `git push` 到分支不会自动出现 review；PR 才是稳定的 review 入口
- `@codex review` 可以显式触发 review
- Codex 的 inline review 会直接暴露真实行为缺陷，本轮已经抓到两个高风险参数解析问题

## 已知问题与风险

- `opencode` 的 HEAD `9596423` 尚未发布到 npm；由于 `0.2.1` 已经发出，后续如果要把这次修复也发布，必须先把版本号推进到 `0.2.2`，不能重发 `0.2.1`。
- PR `#2` 目前仍然 open；最新可见的 Codex review 是针对 `649c443` 的历史 review，修复后的 `9596423` 已请求复查，但截至 2026-03-18 10:35 CST 还没有看到新的 review 结果。
- `mv` / `cp` 仍有明确边界：当前不支持使用 `-f` 直接覆盖目录；目标是目录时仍需手动删除，避免误删整棵树。
- `tree` 对深层目录仍会做全量递归，目录很深时执行时间会明显增长。
- 大文件上传 / 下载、递归目录上传 / 下载、异常中断恢复仍未做系统性验证。
- 交互式 shell 仍然没有补全和更丰富的状态提示，体验仍偏基础。

## 下一步

- 等待或手动复查 PR `#2` 上针对 commit `9596423` 的最新 Codex review 结果。
- 如果 PR `#2` 没有新的 blocker，则合并 `opencode -> main`。
- 合并后如果要发布当前未发布修复，先将版本号从 `0.2.1` 推进到 `0.2.2`，再执行 npm 发布。
- 继续做大文件传输、递归目录上传下载、异常中断恢复的实盘回归。
- 如需长期固化 review 习惯，后续所有发布前变更都走“分支 -> PR -> `@codex review` -> 修复 -> 再 review -> 合并 -> 发布”的流程。

## 关键文件

- [package.json](/root/Programs/bhpan_cli/package.json)
- [CHANGELOG.md](/root/Programs/bhpan_cli/CHANGELOG.md)
- [README.md](/root/Programs/bhpan_cli/README.md)
- [src/main.ts](/root/Programs/bhpan_cli/src/main.ts)
- [src/shell.ts](/root/Programs/bhpan_cli/src/shell.ts)
- [src/cli-options.ts](/root/Programs/bhpan_cli/src/cli-options.ts)
- [src/client.ts](/root/Programs/bhpan_cli/src/client.ts)
- [scripts/verify-mv-cp.ts](/root/Programs/bhpan_cli/scripts/verify-mv-cp.ts)
- [test/suite.test.ts](/root/Programs/bhpan_cli/test/suite.test.ts)
- [docs/releases/v0.2.0.md](/root/Programs/bhpan_cli/docs/releases/v0.2.0.md)
- [docs/releases/v0.2.1.md](/root/Programs/bhpan_cli/docs/releases/v0.2.1.md)

## 关键命令

```bash
npm test
npm run check
npm run build
npm_config_cache=/tmp/npm-cache npm pack --dry-run
git push origin opencode
gh pr view 2 --repo YingkeSu/bhpan-cli --json url,state,headRefOid,latestReviews
gh pr comment 2 --repo YingkeSu/bhpan-cli --body "@codex review"
```
