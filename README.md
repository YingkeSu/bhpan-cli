# bhpan-cli

[![npm version](https://img.shields.io/npm/v/bhpan-cli)](https://www.npmjs.com/package/bhpan-cli)
[![npm downloads](https://img.shields.io/npm/dm/bhpan-cli)](https://www.npmjs.com/package/bhpan-cli)
[![GitHub release](https://img.shields.io/github/v/release/YingkeSu/bhpan-cli)](https://github.com/YingkeSu/bhpan-cli/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

`bhpan-cli` 是一个面向北航云盘（AnyShare）的非官方命令行工具，提供：

- 单次 CLI：适合脚本、SSH、自动化任务
- 交互式 shell：适合日常手工浏览和文件操作

它基于早期的 `dist_bhpan` 与 `PanCLI` 思路重写，目标不是简单移植，而是做一个结构更清晰、能直接安装、并且已经对当前北航线上站点做过真实联调的 TypeScript 版本。

## 项目链接

- GitHub: <https://github.com/YingkeSu/bhpan-cli>
- npm: <https://www.npmjs.com/package/bhpan-cli>
- Releases: <https://github.com/YingkeSu/bhpan-cli/releases>

## 为什么用它

- 直接安装：`npm install -g bhpan-cli`
- 直接使用：安装后命令就是 `bhpan`
- 同时支持脚本化调用和交互式 shell
- 已适配北航当前 OAuth2 / Hydra 登录链路
- 已完成真实账号联调，不是只在本地做静态实现

## 当前版本

- 版本：`0.1.2`
- 运行时：Node `>= 22`
- npm 包名：`bhpan-cli`
- CLI 命令：`bhpan`

## 功能概览

当前已实现：

- 登录、登出、身份查看
- 路径解析与 `/home` 别名
- `ls`、`tree`、`stat`
- `mkdir`、`rm`
- `mv`、`cp`
- `cat`、`head`、`tail`
- `touch`
- 上传、下载
- 匿名分享与实名分享
- 单次 CLI 与交互式 shell

当前已经用真实北航账号做过联调的主链包括：

- OAuth2 登录与 token 刷新
- `/home` 路径解析
- `ls` / `stat` / `mkdir` / `rm`
- `cat` / `head` / `tail`
- `touch`
- 小文件上传与下载
- `tree -L/--depth`、`--sort`、`--desc`
- 匿名分享 `link create/show/delete`
- 实名分享 `link create/show/delete`
- 同一路径下多分享并存时的 `link show` 与 `link delete --type all`

## 安装

全局安装：

```bash
npm install -g bhpan-cli
```

临时执行：

```bash
npx bhpan-cli --help
```

安装完成后：

```bash
bhpan --help
bhpan --version
```

## 快速开始

首次登录：

```bash
bhpan login --username <你的学号>
```

查看主页目录：

```bash
bhpan ls /home
```

上传文件：

```bash
bhpan upload ./report.pdf /home/code
```

下载文件：

```bash
bhpan download /home/code/report.pdf .
```

进入交互式 shell：

```bash
bhpan
```

或：

```bash
bhpan shell
```

## 常用命令

```text
bhpan shell
bhpan login [--username <name>] [--no-store-password]
bhpan logout
bhpan whoami
bhpan ls [remote_path]
bhpan tree [remote_path] [-L depth] [--sort name|mtime|size] [--desc]
bhpan stat <remote_path>
bhpan mkdir <remote_path>
bhpan rm <remote_path> [-r]
bhpan mv <src> <dst> [-f]
bhpan cp <src> <dst> [-f]
bhpan cat <remote_file>
bhpan head <remote_file> [-n lines]
bhpan tail <remote_file> [-n lines]
bhpan touch <remote_file>
bhpan link <show|create|delete> <remote_path> [--type anonymous|realname|all] [--expires days] [-p] [--allow-upload] [--no-download]
bhpan upload <local_path> <remote_dir>
bhpan download <remote_path> [local_dir]
```

完整说明请直接运行：

```bash
bhpan --help
```

## 示例

列目录：

```bash
bhpan ls /home
bhpan ls /home/code
```

查看目录树：

```bash
bhpan tree /home/code -L 2
bhpan tree /home/code --sort size --desc
```

创建空文件：

```bash
bhpan touch /home/code/hello.txt
```

查看文件头尾：

```bash
bhpan head /home/code/readme.txt -n 20
bhpan tail /home/code/readme.txt -n 20
```

创建匿名分享：

```bash
bhpan link create /home/code/report.pdf -p
```

创建实名分享：

```bash
bhpan link create /home/code/report.pdf --type realname
```

查看或关闭分享：

```bash
bhpan link show /home/code/report.pdf
bhpan link delete /home/code/report.pdf --type all
```

## 已知边界

当前仍建议继续补实盘回归的部分：

- `mv` / `cp`
- 大文件上传下载
- 递归目录传输
- 异常中断恢复

体验层面仍待继续增强的部分：

- `tree` 的更细过滤与统计输出
- 更丰富的分享参数
- shell 命令补全与更强的错误提示

## 配置与数据位置

Linux:

- 配置：`~/.config/bhpan/config.json`
- 数据：`~/.local/share/bhpan/`

macOS:

- 配置：`~/Library/Application Support/bhpan/config.json`
- 数据：`~/Library/Application Support/bhpan/`

Windows:

- 配置：`%APPDATA%\\bhpan\\config.json`
- 数据：`%LOCALAPPDATA%\\bhpan\\`

## 隐私与说明

- 这是非官方工具，不代表北航或 AnyShare 官方
- 仅适用于本身就拥有北航云盘访问权限的用户
- 登录后会把配置写到本地配置目录
- 如选择保存密码，保存的是加密后的本地凭据与缓存 token

## 反馈与状态

- 问题反馈：<https://github.com/YingkeSu/bhpan-cli/issues>
- 发布记录：[CHANGELOG.md](./CHANGELOG.md)
- 当前开发状态：[docs/DEV_STATUS.md](./docs/DEV_STATUS.md)

## 开发

安装依赖：

```bash
npm install
```

类型检查：

```bash
npm run typecheck
```

构建发布产物：

```bash
npm run build
```

本地打包预览：

```bash
npm pack
```

## 致谢

本项目的设计与协议适配过程中参考了以下上游项目：

- <https://github.com/xdedss/dist_bhpan>
- <https://github.com/Fucov/PanCLI>
