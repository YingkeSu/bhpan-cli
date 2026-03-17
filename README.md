# bhpan-cli

`bhpan-cli` 是一个面向北航云盘（AnyShare）的 Node.js 命令行工具，提供两种使用方式：

- 单次 CLI：适合脚本、SSH、自动化任务
- 交互式 shell：适合日常手工浏览和文件操作

项目基于 `xdedss/dist_bhpan` 与 `Fucov/PanCLI` 的思路重写，当前实现为 TypeScript + Node 22，并已经针对北航当前线上站点完成真实联调。

## 当前版本

- 版本：`0.1.0`
- Node 要求：`>= 22`
- npm 包名：`bhpan-cli`

## 已验证能力

以下能力已经用真实北航账号做过联调：

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

当前仍建议继续补实盘回归的部分：

- `mv` / `cp`
- 大文件上传下载
- 递归目录传输
- 异常中断恢复

## 安装

全局安装：

```bash
npm install -g bhpan-cli
```

安装后直接使用：

```bash
bhpan --help
bhpan --version
```

如果你只是本地开发，也可以直接运行源码：

```bash
npm install
npm run start -- --help
```

## 快速开始

首次登录：

```bash
bhpan login --username <你的学号>
```

默认会提示输入密码，并把加密后的凭据与 token 缓存在本地配置目录中。

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

## 命令概览

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

## 常见示例

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

## 发布说明

当前发布产物是标准 npm CLI 包，安装后直接得到 `bhpan` 可执行命令，不再依赖 `node --experimental-transform-types`。

本次发布对应的说明见 [docs/releases/v0.1.0.md](./docs/releases/v0.1.0.md)，持续开发状态见 [docs/DEV_STATUS.md](./docs/DEV_STATUS.md)。
