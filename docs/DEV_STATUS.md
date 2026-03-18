# 开发状态

最后更新：2026-03-17 23:30 CST

## 当前总结

- 项目已经完成 TypeScript 重写的一期主体，当前结构是“共享核心 + 单次 CLI + 交互式 shell”。
- 这是一个以 CLI / 本地工具为主、同时带 AnyShare 远程 API 集成的项目；当前最值得信任的是认证、目录解析、基础文件管理和小文件传输主链。
- 当前最值得继续推进的是体验和验证深度，而不再是协议主阻塞。分享链接匿名/实名链路都已接到 CLI，并完成真实账号回归。
- `mv` / `cp` 已完成一轮真实账号专项回归，不再只是“实现了但未验证”。
- 当前新增了可复跑的 `mv/cp` 回归脚本，后续可以直接复现同目录复制、跨目录移动和目录目标下 `-f` 覆盖。
- 已记录并修复登录密码输入掩码 bug。
  - 原问题是终端仍然回显真实字符，同时额外打印 `*`，表现为 `p*a*s*s*w*o*r*d*`
  - 当前改为拦截 readline 的终端输出并只显示掩码，不再泄露明文字符
- 已修复登录时错误复用旧凭据 / 旧 token 的问题。
  - 原问题是在切换用户名时仍可能沿用旧缓存会话，导致登录校验失真
  - 当前只在“用户名未变化且未显式输入新密码”时复用本地缓存会话
- 当前已经补齐 npm 发布形态：可构建、可打包、可从 tarball 直接全局安装并执行真实命令。
- 当前已经完成公开发布：
  - GitHub 仓库已建立：`https://github.com/YingkeSu/bhpan-cli`
  - GitHub release 已建立：`v0.1.0`、`v0.1.1`
  - npm 包已发布：`bhpan-cli@0.1.0`、`bhpan-cli@0.1.1`
- 当前正在准备 `0.1.2`
  - 这是一个 README / presentation patch release
  - 目标是让 GitHub 与 npm 页面更像对外 README，而不是开发者工作说明
- 当前公开最新版本是 `0.1.1`
  - `0.1.0` 是首个公开可用版本，并已做真实 tarball 安装与真实站点命令回归
  - `0.1.1` 是 metadata patch release，没有运行时功能变更
- 当前包名决策是继续保留未 scoped 的 `bhpan-cli`
  - 原因是名字已占用成功、安装命令短、且当前没有必须迁移到 `@scope/package` 的组织化需求
  - 如果以后迁移到 scoped package，应视为新包并采用双发/迁移提示，而不是直接硬切

## 已完成工作

- 已分析并吸收上游两个 Python 项目：
  - `xdedss/dist_bhpan`
  - `Fucov/PanCLI`
- 已完成第一版 TypeScript 项目骨架与共享核心。
- 已落地：
  - OAuth2 / RSA 认证
  - 原生 HTTP/HTTPS 传输层
  - AnyShare API 管理器
  - `/home` 逻辑别名与路径解析
  - 递归上传 / 下载 / 删除
  - `mv` / `cp` 组合逻辑
  - 单次 CLI
  - 交互式 shell
- 已新增并接入：
  - `tree`
  - `head`
  - `tail`
  - `touch`
- 已修复真实线上差异：
  - 认证入口改为 `/oauth2/auth`
  - `signin` 参数从 `__NEXT_DATA__` 提取
  - 适配 Hydra `consent`
  - API 鉴权头改为 `Authorization: Bearer ...`
  - `mkdir` 不再依赖线上失效的 `createdirsbypath`
  - 0 字节上传可用，用于支撑 `touch`
  - 上传完成后会回显服务端最终落库文件名
  - 网络层增加超时，避免坏端点无限挂起
  - `link` 已从旧 `/link/*` 迁移到新版 `doc-share/v1/links/*`
  - `request()` 已从 `https.request` 切到 `fetch`
  - 修复了新版登录页下 `signin` 请求卡死，导致 token 刷新超时的问题
- 已新增：
  - `tree -L/--depth`
  - `tree --sort name|mtime|size`
  - `tree --desc`
  - `link --type anonymous|realname|all`
- 已补齐：
  - CLI / shell 对实名分享的创建、查看、删除
  - `link show` 默认列出同一路径下全部分享
  - `link delete --type all` 删除同一路径下全部分享
- 已修复 `mv` / `cp` 的两个真实行为问题：
  - 同目录 `cp` 不再误改成重命名
  - 移动或复制到已有目录时，`-f` 会正确覆盖目录内同名文件，而不是触发服务端自动重命名
- 已新增开发回归脚本：
  - `scripts/verify-mv-cp.ts`
  - `npm run verify:mv-cp`
- 已修复 shell 登录密码掩码问题：
  - 旧实现是监听 `stdin data` 并补打 `*`
  - 新实现改为关闭 TTY 回显并手动处理掩码输入
- 已修复登录认证缓存复用问题：
  - 切换用户名或显式输入密码时，不再复用旧加密凭据和旧 token
- 已补齐发布侧基础设施：
  - `esbuild` 构建脚本
  - 面向 npm 发布的 `package.json`
  - 发布版 `README.md`
  - `CHANGELOG.md`
  - `LICENSE`
  - `.gitignore`
  - `v0.1.0` / `v0.1.1` release notes
- 已完成公开发布与元数据补齐：
  - GitHub 仓库创建并推送 `main`
  - GitHub release `v0.1.0`
  - GitHub release `v0.1.1`
  - npm 发布 `bhpan-cli@0.1.0`
  - npm 发布 `bhpan-cli@0.1.1`
  - npm 元数据已补齐 `repository` / `homepage` / `bugs` / `author`
- 当前这一轮新增：
  - 面向公开用户重写 `README.md`
  - 新增 `v0.1.2` release notes
  - `package.json` / CLI 版本已推进到 `0.1.2`

## 当前命令覆盖

已实现：

- `login`
- `logout`
- `whoami`
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
- `shell`
- `link`

当前可信度说明：

- `link create/show/delete` 的匿名分享链路已经通过真实站点联调，可视为可用。
- `link create/show/delete` 的实名分享链路已经通过真实站点联调，可视为可用。
- 目前最可信的是 `ls`、`stat`、`mkdir`、`cat`、`head`、`tail`、`touch`、`upload`、`download`、`rm`、`mv`、`cp`、`link` 的基础链路。
- `tree` 的 `-L/--depth` 与排序控制已经通过真实站点回归。
- `mv` / `cp` 已通过真实账号回归，当前已确认：
  - 同目录复制会保留源文件
  - 跨目录移动支持重命名
  - 移动或复制到已有目录时，`-f` 会覆盖目录内同名文件
  - 同路径 `mv` / `cp` 会直接报错，避免误删或误改名
  - 当前仍不支持用 `-f` 直接覆盖目录；如目标是目录，需要先手动删除

## 已验证行为

本地验证：

- `npm run check` 通过
- `npm run build` 通过
- `npm pack` 通过
- `npm pack --dry-run` 通过
- `node --experimental-transform-types ./src/main.ts --version` 正常输出
- `help` / `--help` 正常输出
- `node ./dist/main.js --help` 正常输出
- 从 `bhpan-cli-0.1.0.tgz` 全局安装后，`bhpan --version` 正常输出
- 从 `bhpan-cli-0.1.0.tgz` 全局安装后，`bhpan ls /home` 可访问真实站点
- `0.1.1` 发布前检查通过：`npm run check`、`npm pack --dry-run`
- 当前主分支开发验证通过：`npm run verify:mv-cp`

公开发布验证：

- `gh release view v0.1.1 --repo YingkeSu/bhpan-cli` 返回正式 release，且附件 `bhpan-cli-0.1.1.tgz` 已上传
- `npm view bhpan-cli name version dist-tags.latest repository.url homepage bugs.url` 返回：
  - `version = 0.1.1`
  - `dist-tags.latest = 0.1.1`
  - `repository.url = git+https://github.com/YingkeSu/bhpan-cli.git`
  - `homepage = https://github.com/YingkeSu/bhpan-cli#readme`
  - `bugs.url = https://github.com/YingkeSu/bhpan-cli/issues`

真实北航云盘联调：

- 登录换取 `access_token`
- 获取用户文档库
- 解析 `/home`
- `ls /home`
- `ls /home/code`
- 上传小文件到 `/home/code`
- 从 `/home/code` 下载同一文件到本地
- 上传下载内容一致
- 递归创建目录
- 创建空文件
- `head -n 2`
- `tail -n 2`
- 小目录 `tree`
- 匿名分享 `link create`
- 匿名分享 `link show`
- 匿名分享 `link delete`
- 实名分享 `link create --type realname`
- 实名分享 `link show --type realname`
- 实名分享 `link delete --type realname`
- 同一文件下匿名 + 实名分享并存时的 `link show`
- `link delete --type all`
- `tree -L 1 --sort size --desc`
- 同目录 `cp <src> <dst>`
- 跨目录 `mv <src> <dst>`
- `cp <src> <existing-dir> -f` 覆盖目录内同名文件
- `mv <src> <existing-dir> -f` 覆盖目录内同名文件
- 同路径 `mv` / `cp` 保护

已确认的线上协议结论：

- 当前认证入口不是旧版 `/oauth2/authorize`，而是 `/oauth2/auth`
- `signin` 页面中的 `challenge` / `csrftoken` 需要从 `__NEXT_DATA__` 提取
- 登录后存在新版 Hydra `consent` 跳转
- 业务接口鉴权头应为 `Authorization: Bearer <access_token>`
- `entry-doc-lib`、`file/getinfobypath`、`dir/list` 已验证可用
- Node 22 下 `fetch` 可稳定获取新版 `signin` 页面；旧 `https.request` 实现在该页面上会卡住
- 分享接口已确认应使用：
  - `GET /api/doc-share/v1/links/{item_type}/{item_id}`
  - `POST /api/doc-share/v1/links/anonymous`
  - `PUT /api/doc-share/v1/links/anonymous/{link_id}`
  - `DELETE /api/doc-share/v1/links/anonymous/{link_id}`
  - `POST /api/doc-share/v1/links/realname`
  - `DELETE /api/doc-share/v1/links/realname/{link_id}`

## 架构相关关注点

这是一个 CLI / 本地工具项目，当前最该持续追踪的是：

- 入口命令与子命令覆盖
  - CLI 帮助、单次命令入口、shell 交互入口都已接通
  - 仍需继续区分“实现了”与“真实联调过”
- 非交互命令的稳定性
  - 已通过关闭 `https.Agent keepAlive` 处理过一次进程悬挂问题
  - 后续如果再出现 CLI 不退出，应优先排查网络句柄和流关闭
- 实盘验证优先级
  - 相比纯本地类型检查，这个项目更依赖真实 AnyShare 站点联调
  - 认证链、目录 API、对象存储上传下载链路应继续作为回归主线
- 运行时前提
  - 当前运行方式依赖 Node 22
  - 开发态入口命令使用 `node --experimental-transform-types`
  - 发布态入口命令为 npm 安装后的 `bhpan`
- 包与分发身份
  - 当前 npm 包名是未 scoped 的 `bhpan-cli`
  - 当前 CLI 命令名是 `bhpan`
  - 目前不建议迁移到 scoped package；未来如果确有组织化需求，应采用新包并行发布而非原地改名
- API 集成边界
  - 这是一个 CLI 项目，但真实风险主要来自 AnyShare 线上协议漂移
  - 文档与线上行为不一致时，应优先相信真实联调结果
  - 分享接口已经出现过“旧端点失效、新端点可用”的实际漂移，后续应继续保持这种验证方式
  - 认证页也已经出现过“站点可达，但旧请求实现卡死”的问题，后续涉及登录页时应优先用最小脚本验证单个 URL

## 已知问题与风险

- `tree` 对深层目录会做全量递归
  - 目录很深时执行时间会比较长
  - 当前已有 `-L/--depth`，但还没有更细的过滤和统计输出
- 分享能力当前仍有边界
  - CLI 已支持匿名/实名分享
  - 但更丰富的分享参数还没接入命令层
- `mv` / `cp` 仍有一个明确边界
  - 当前不支持使用 `-f` 直接覆盖目录
  - 如果目标路径是目录，必须先手动删除目标目录，避免误删整棵树
- 交互式 shell 体验仍偏基础
  - 还没有命令补全
  - 还没有更丰富的状态提示
- 仍存在验证空白
  - 大文件上传
  - 递归目录上传下载
  - 异常中断恢复
- 包名迁移当前不是阻塞，但属于未来决策点
  - 当前未 scoped 包名 `bhpan-cli` 已经公开可用
  - 如果未来决定迁移到 `@scope/bhpan-cli`，那会是一个新包发布与用户迁移问题，而不是一次普通版本升级

## 当前待办清单

- P0 实盘回归大文件与递归目录传输
  - 当前小文件上传下载已验证，但大文件、深目录、批量传输还没有结论
  - 重点覆盖大文件上传下载、递归目录上传下载、服务端重命名、传输中断后的行为
  - 这是当前最主要的能力空白
- P1 补异常中断与恢复策略
  - 当前请求超时与登录链路已处理，但中断后的重试、残留临时状态、部分成功场景还没有专项验证
  - 应先确认哪些场景只需要文档说明，哪些场景需要代码补偿
- P1 继续完善 `tree` 输出
  - 目前已经有深度和排序，但还缺过滤、统计信息、可能的目录优先/文件优先显示控制
  - 这属于体验增强，不阻塞主链
- P1 继续完善 `link`
  - 当前匿名/实名分享的基础链路已通
  - 还可以继续补更多分享参数、更明确的展示格式，以及是否需要针对实名分享做专门的命令选项
- P1 继续补 `mv` / `cp` 的边界验证
  - 当前文件级主链已通过真实回归
  - 还可以补目录级复制、移动到子目录报错、以及目录冲突时的更明确交互
- P2 提升 shell 体验
  - 还没有命令补全
  - 还没有更丰富的状态提示、操作反馈和错误指引
  - 这是明显的体验项，但优先级低于主链回归

## 推荐执行顺序

- 先做大文件与递归目录传输回归
- 然后决定是先补异常恢复，还是先做 `tree` / `link` 的体验增强
- 再补 `mv` / `cp` 的目录级边界验证
- 最后再做 shell 补全与交互优化

## 下一步

- 补大文件、递归目录传输和异常中断恢复测试
- 继续补 `mv` / `cp`` 的目录级边界验证
- 为 `tree` 补更友好的输出控制
- 视需要补更多分享参数与更明确的展示
- 视需要补 shell 命令补全与更强的错误提示

## Linux 功能对标

当前已实现的核心命令（与 Linux 对标）：

| Linux 命令 | bhpan 命令 | 完成度 | 备注 |
|-----------|-----------|--------|------|
| `ls` | `ls` | ✅ 100% | 支持 -R 递归、-L 深度、--regex 过滤 |
| `tree` | `tree` | ✅ 90% | 支持 --regex，缺统计信息 |
| `stat` | `stat` | ✅ 100% | 完整元数据显示 |
| `mkdir` | `mkdir` | ✅ 100% | 递归创建 |
| `rm` | `rm` | ✅ 100% | 支持 -r 递归删除 |
| `mv` | `mv` | ✅ 90% | 缺目录覆盖强制 |
| `cp` | `cp` | ✅ 90% | 缺目录覆盖强制 |
| `cat` | `cat` | ✅ 100% | 完整实现 |
| `head`/`tail` | `head`/`tail` | ✅ 100% | 支持 -n 行数 |
| `touch` | `touch` | ✅ 100% | 完整实现 |
| `find` | ❌ 未实现 | - | 建议优先级：P1 |
| `grep` | ❌ 未实现 | - | 可通过 --regex 部分替代 |
| `xargs` | ❌ 未实现 | - | 云端场景需求较低 |

建议下一步开发方向（优先级排序）：

1. **P1 - find-like 功能**：支持按名称、类型、时间、大小查找
2. **P1 - 大文件传输优化**：断点续传、并发控制
3. **P1 - 回收站/安全删除**：避免误删恢复机制
4. **P2 - shell 补全**：命令和路径自动补全
5. **P2 - 校验和验证**：下载完整性检查

## 关键文件

- [README.md](/root/Programs/bhpan_cli/README.md)
- [package.json](/root/Programs/bhpan_cli/package.json)
- [CHANGELOG.md](/root/Programs/bhpan_cli/CHANGELOG.md)
- [docs/releases/v0.1.1.md](/root/Programs/bhpan_cli/docs/releases/v0.1.1.md)
- [src/main.ts](/root/Programs/bhpan_cli/src/main.ts)
- [src/shell.ts](/root/Programs/bhpan_cli/src/shell.ts)
- [src/client.ts](/root/Programs/bhpan_cli/src/client.ts)
- [scripts/verify-mv-cp.ts](/root/Programs/bhpan_cli/scripts/verify-mv-cp.ts)
- [src/api.ts](/root/Programs/bhpan_cli/src/api.ts)
- [src/auth.ts](/root/Programs/bhpan_cli/src/auth.ts)
- [src/network.ts](/root/Programs/bhpan_cli/src/network.ts)

## 关键命令

查看云盘根目录：

```bash
node --experimental-transform-types ./src/main.ts ls /home
```

确认 npm 公开状态：

```bash
npm view bhpan-cli name version dist-tags.latest repository.url homepage bugs.url
```

确认 GitHub release：

```bash
gh release view v0.1.1 --repo YingkeSu/bhpan-cli
```

内部 E2E 验证示例：

```bash
NAME=bhpan_cli_e2e_$(date -u +%Y%m%dT%H%M%SZ).txt
printf 'bhpan-cli test %s\n' "$NAME" > /tmp/$NAME
node --experimental-transform-types --input-type=module -e "
import fs from 'node:fs';
import { BhpanClient } from './src/client.ts';
const client = await BhpanClient.create({ username:'23231037', password:'syk@20041104', validate:false });
await client.upload('/tmp/' + process.argv[1], '/home/code');
await client.download('/home/code/' + process.argv[1], '/tmp/bhpan_cli_download_unique');
console.log(fs.readFileSync('/tmp/bhpan_cli_download_unique/' + process.argv[1], 'utf8'));
process.exit(0);
" "$NAME"
```

匿名分享 CLI 回归示例：

```bash
TARGET=/home/code/bhpan_dev_20260317121422/bhpan_head_tail_20260317121422.txt
node --experimental-transform-types ./src/main.ts link create "$TARGET" -p
node --experimental-transform-types ./src/main.ts link show "$TARGET"
node --experimental-transform-types ./src/main.ts link delete "$TARGET"
```

实名分享与多分享并存回归示例：

```bash
TARGET=/home/code/bhpan_link_mix_xxx/mixed.txt
node --experimental-transform-types ./src/main.ts link create "$TARGET" -p
node --experimental-transform-types ./src/main.ts link create "$TARGET" --type realname
node --experimental-transform-types ./src/main.ts link show "$TARGET"
node --experimental-transform-types ./src/main.ts link delete "$TARGET" --type all
```
