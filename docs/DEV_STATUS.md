# 开发状态

最后更新：2026-03-17 22:30 CST

## 当前总结

- 项目已经完成 TypeScript 重写的一期主体，当前结构是“共享核心 + 单次 CLI + 交互式 shell”。
- 这是一个以 CLI / 本地工具为主、同时带 AnyShare 远程 API 集成的项目；当前最值得信任的是认证、目录解析、基础文件管理和小文件传输主链。
- 当前最值得继续推进的是体验和验证深度，而不再是协议主阻塞。分享链接匿名/实名链路都已接到 CLI，并完成真实账号回归。
- 当前已经补齐 npm 发布形态：可构建、可打包、可从 tarball 直接全局安装并执行真实命令。

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
- 已补齐发布侧基础设施：
  - `esbuild` 构建脚本
  - 面向 npm 发布的 `package.json`
  - 发布版 `README.md`
  - `LICENSE`
  - `.gitignore`
  - `v0.1.0` release notes

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
- 目前最可信的是 `ls`、`stat`、`mkdir`、`cat`、`head`、`tail`、`touch`、`upload`、`download`、`rm`、`link` 的基础链路。
- `tree` 的 `-L/--depth` 与排序控制已经通过真实站点回归。
- `mv` / `cp` 逻辑已实现，但当前文档里还没有补足真实账号下的专项回归记录。

## 已验证行为

本地验证：

- `npm run check` 通过
- `npm run build` 通过
- `npm pack` 通过
- `node --experimental-transform-types ./src/main.ts --version` 正常输出
- `help` / `--help` 正常输出
- `node ./dist/main.js --help` 正常输出
- 从 `bhpan-cli-0.1.0.tgz` 全局安装后，`bhpan --version` 正常输出
- 从 `bhpan-cli-0.1.0.tgz` 全局安装后，`bhpan ls /home` 可访问真实站点

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
- 交互式 shell 体验仍偏基础
  - 还没有命令补全
  - 还没有更丰富的状态提示
- 仍存在验证空白
  - 大文件上传
  - 递归目录上传下载
  - 异常中断恢复
  - `mv` / `cp` 的专项实盘回归
- 外部发布仍有环境阻塞
  - 当前机器没有 GitHub 登录态，无法直接创建仓库、push 或创建 GitHub release
  - 当前机器没有 npm 登录态，无法直接执行 `npm publish`

## 当前待办清单

- P0 实盘回归 `mv` / `cp`
  - 目标是把“已实现”提升到“真实账号已验证”
  - 重点覆盖同目录改名、跨目录移动、目录复制、`-f` 覆盖、移动到子目录报错
  - 这是当前最值得先做的事情，因为它直接决定基础文件管理是否可信
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
- P2 提升 shell 体验
  - 还没有命令补全
  - 还没有更丰富的状态提示、操作反馈和错误指引
  - 这是明显的体验项，但优先级低于主链回归

## 推荐执行顺序

- 先做 `mv` / `cp` 的真实账号专项回归
- 再做大文件与递归目录传输回归
- 然后决定是先补异常恢复，还是先做 `tree` / `link` 的体验增强
- 最后再做 shell 补全与交互优化

## 下一步

- 补 `mv` / `cp` 的真实账号专项回归
- 补大文件、递归目录传输和异常中断恢复测试
- 为 `tree` 补更友好的输出控制
- 视需要补更多分享参数与更明确的展示
- 视需要补 shell 命令补全与更强的错误提示

## 关键文件

- [README.md](/root/Programs/bhpan_cli/README.md)
- [src/main.ts](/root/Programs/bhpan_cli/src/main.ts)
- [src/shell.ts](/root/Programs/bhpan_cli/src/shell.ts)
- [src/client.ts](/root/Programs/bhpan_cli/src/client.ts)
- [src/api.ts](/root/Programs/bhpan_cli/src/api.ts)
- [src/auth.ts](/root/Programs/bhpan_cli/src/auth.ts)
- [src/network.ts](/root/Programs/bhpan_cli/src/network.ts)

## 关键命令

查看云盘根目录：

```bash
node --experimental-transform-types ./src/main.ts ls /home
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
