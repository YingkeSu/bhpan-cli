# Changelog

## Unreleased

### 新功能

- `upload` / `download` 接入 `transfer-state` 与 `transfer-plan`，默认在失败后支持 `--resume <transfer_id>` 继续未完成文件
- 新增 `--no-resume` 选项，可关闭本次传输的状态持久化
- 传输流程接入 `retryWithBackoff`，对可重试错误自动重试

### 测试

- 新增传输恢复与目录规划回归测试，覆盖空目录创建、失败后恢复、下载重试成功等场景

## 0.3.0

### 新功能

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

### 修复

- `fetchTreeNodes` 现在复制 `entry.size` 到 `TreeNode`，修复 `tree --stats` 显示大小为 0 的问题
- `filterTree` 先应用 `excludeRegex` 再应用 `includeRegex`，修复两者同时使用时 exclude 无效的问题
- Shell 补全现在正确忽略选项标志，`head -n 5 /foo` 等命令可以正确补全路径

## 0.2.2

- 修复 `rm -r` 缺少 operand 时可能递归删除 `/` 或 shell 当前目录的危险行为
- 修复 `mv -f <src>` / `cp -f <src>` 缺少目标路径时可能默默移动/复制到错误位置的问题
- 修复 `head -n 5` / `tail -n 5` 缺少文件参数时未报错的问题
- 所有命令现在正确验证必填位置参数，避免误解析为 `/`、`/home` 或当前目录
- 优化 CLI 参数解析错误提示，提供清晰的用法说明

## 0.2.1

- 修复 `rm`、`head`、`tail`、`mv`、`cp` 的标志位顺序问题
- 修复 `npm test` 无法运行的问题，并重新纳入 `npm run check`
- 修复 `ls -R` 不显示目标目录本身的问题，使 `-L 0` 和针对目标路径的 `--regex` 生效
- 修复 README 当前版本号和 Markdown 代码块渲染问题

## 0.2.0

- 新增 `ls -R` 递归列出功能，支持完整逻辑路径显示
- 新增 `--regex` 正则表达式过滤，支持 `ls` 和 `tree` 命令
- 新增 `-L/--depth` 深度限制参数用于递归列出
- 改进命令行参数解析，支持标志位前后位置无关
- 修复 `head`、`tail`、`rm` 等命令参数顺序问题
- 文档更新：新增递归列出和正则过滤示例

## 0.1.2

- 将根目录 `README.md` 重写为面向公开用户的版本
- 增加 npm / GitHub / release 徽章与项目入口链接
- 强化安装、快速开始、示例、已知边界、隐私说明等对外信息
- 无运行时功能变更

## 0.1.1

- 补充 npm 包元数据：
  - `repository`
  - `homepage`
  - `bugs`
  - `author`
- 补充 README 中的项目链接、`npx` 用法、反馈入口和发布入口
- 补充本地 release 文档，便于 GitHub release 与 npm 页面追踪
- 无运行时功能变更

## 0.1.0

- 首个公开可发布版本
- 提供单次 CLI 与交互式 shell
- 完成针对北航当前线上站点的认证适配
- 提供基础文件管理、上传下载与匿名/实名分享能力
