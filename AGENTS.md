# Repository Guidelines

> **⚠️ 标准化开发流程**：所有开发必须严格遵循 [docs/WORKFLOW.md](./docs/WORKFLOW.md) 定义的工作流程。
> 核心要求：开发前检查 issues/PRs → 测试通过后提交 → 等待 10 分钟检查 review → review 通过后才合并。

## Project Structure & Module Organization

- `src/`: TypeScript runtime code. `main.ts` is the one-shot CLI entry, `shell.ts` handles the interactive shell, `client.ts` coordinates high-level AnyShare operations, and `api.ts` / `network.ts` wrap remote calls.
- `scripts/`: repo utilities such as `build.mjs` and live verification scripts like `verify-mv-cp.ts`.
- `test/`: Node test runner suites. Keep focused regression tests in `*.test.ts`.
- `docs/`: release notes and continuity docs. Update `docs/DEV_STATUS.md` when workflow or verification status changes.

## Build, Test, and Development Commands

- `npm run build`: bundle the CLI into `dist/main.js` with esbuild.
- `npm test`: run the Node test suite (`node --test`) against `test/*.test.ts`.
- `npm run typecheck`: run `tsc --noEmit`.
- `npm run check`: required pre-release gate; runs typecheck, tests, and `bhpan --help`.
- `npm run start -- <args>`: run the CLI from source.
- `npm run shell`: start the interactive shell from source.
- `npm run verify:mv-cp`: live integration check for move/copy behavior against a real AnyShare account.

## Coding Style & Naming Conventions

- Use TypeScript ES modules and 2-space indentation.
- Prefer small, explicit helper functions for CLI argument parsing and remote-path handling.
- File names use kebab-case (`cli-options.ts`, `remote-walk.ts`); exported types/interfaces use PascalCase; functions and variables use camelCase.
- There is no formatter/linter config in-repo, so match the existing style and keep diffs minimal.

## Testing Guidelines

- Use the built-in Node test runner with `assert/strict`.
- Name tests by behavior, especially for CLI edge cases and regression coverage.
- Add tests whenever changing argument parsing, path resolution, or destructive commands.
- For live-site changes, keep automated unit coverage plus a concrete manual/integration command in the PR description.

## Commit & Pull Request Guidelines

- Follow the existing commit style: `fix: ...`, `docs: ...`, `chore: ...`, `release: ...`.
- Work on `opencode`, not `main`. Push the branch, open/update a PR to `main` (Codex review triggers automatically).
- PRs should include a short summary, verification commands, and any live-environment assumptions or required env vars.
- **See "Pull Request & Code Review Workflow" section below for detailed process.**

## Pull Request & Code Review Workflow

> **完整流程详见 [docs/WORKFLOW.md](./docs/WORKFLOW.md)**

### 核心要点

1. **开发前必查**：检查 GitHub open issues 和 PRs，优先处理
2. **测试必过**：`npm run typecheck` + `npm test` + `npm run build` 全部通过
3. **等待 10 分钟**：提交 PR 后等待 10 分钟再检查 Codex review 结果
4. **循环直到通过**：review 未通过则修复并重新提交，重复直到 APPROVED

### 分支策略

- **opencode**: 开发分支（在此开发，从此创建 PR）
- **main**: 发布分支（仅接受 reviewed PR 的合并）

### 快速命令

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

## Security & Configuration Tips

- This CLI talks to a real BUAA AnyShare instance. Do not commit credentials, tokens, or personal file paths.
- Integration scripts read credentials from environment variables; prefer env vars over editing source or docs with secrets.
