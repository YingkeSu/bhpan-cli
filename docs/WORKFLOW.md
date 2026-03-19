# 标准化开发流程

> 最后更新：2026-03-19

本文档定义了 bhpan-cli 项目的标准化开发流程，**每次开发必须严格遵循**。

---

## 流程总览

```
[Phase 0: 开发前检查] → [Phase 1: 开发与测试] → [Phase 2: 提交与 PR] → [Phase 3: Code Review 循环] → [Phase 4: 合并与发布]
```

---

## Phase 0: 开发前检查（必须执行）

**每次开始开发前，必须先执行以下检查：**

### Step 0.1: 检查 GitHub Issues

```bash
gh issue list --repo YingkeSu/bhpan-cli --state open
```

- **如有 open issues**：
  1. 阅读并理解 issue 内容
  2. 决定优先级（bug > feature > docs）
  3. 处理 issue 后再继续原计划开发

### Step 0.2: 检查 GitHub PRs 和 Code Reviews

```bash
gh pr list --repo YingkeSu/bhpan-cli --state open
gh pr list --repo YingkeSu/bhpan-cli --state all --json number,state,reviewDecision --limit 5
```

- **如有 open PRs**：
  1. 检查是否需要处理 Codex review 反馈
  2. 如有未处理的 review comments，优先修复
  3. 修复后 push，等待重新 review

### Step 0.3: 确认分支状态

```bash
git status
git branch
```

- 确保在 `opencode` 分支开发
- 确保 `opencode` 分支与远程同步

### 通过条件

- 无 open issues，或已知 issue 已处理/记录
- 无 open PRs，或已有 PR 的 review 已处理
- 工作目录干净或已保存当前进度

---

## Phase 1: 开发与测试

### Step 1.1: 切换到开发分支

```bash
git checkout opencode
git pull origin opencode
```

### Step 1.2: 实现子功能

- 每次只实现一个**原子性子功能**
- 子功能定义：可独立测试、可独立提交的最小功能单元

### Step 1.3: 本地测试（必须通过）

```bash
npm run typecheck  # TypeScript 类型检查
npm test           # 单元测试
npm run build      # 构建验证
```

**三项必须全部通过**，才能进入下一阶段。

### Step 1.4: 集成测试（如适用）

```bash
npm run verify:mv-cp  # 需要 AnyShare 凭据
```

---

## Phase 2: 提交与 PR

### Step 2.1: 本地提交

```bash
git add .
git commit -m "类型: 简短描述"  # fix: / feat: / docs: / chore: / release:
```

### Step 2.2: 推送到远程

```bash
git push origin opencode
```

### Step 2.3: 创建或更新 PR

**首次创建 PR**：

```bash
gh pr create --repo YingkeSu/bhpan-cli --base main --head opencode --title "类型: 功能描述" --body "$(cat <<'EOF'
## Summary
[变更摘要]

## Verification
Commands run:
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`

## Environment Assumptions
[测试环境说明]

## Notes
[其他说明]
EOF
)"
```

**更新已有 PR**：

推送后 PR 自动更新，无需额外操作。

---

## Phase 3: Code Review 循环（核心流程）

### Step 3.1: 等待 Codex Review

**等待时间：10 分钟**

```bash
# 等待 10 分钟后执行检查
sleep 600 && gh pr view --repo YingkeSu/bhpan-cli --json number,state,reviewDecision,reviews
```

或使用以下命令检查：

```bash
gh pr view --repo YingkeSu/bhpan-cli --json reviewDecision,reviews
```

### Step 3.2: 检查 Review 结果

**可能的 review states**：
- `APPROVED` - 通过，可合并
- `CHANGES_REQUESTED` - 需要修改
- `REVIEW_REQUIRED` - 等待 review 完成
- `null` - 尚未触发 review

### Step 3.3: 处理 Review 反馈

**如果 review 通过（APPROVED）**：
```bash
gh pr merge --repo YingkeSu/bhpan-cli --squash --delete-branch=false
```
→ 进入 Phase 4

**如果 review 未通过（CHANGES_REQUESTED）**：
1. 阅读 review comments：
   ```bash
   gh api repos/YingkeSu/bhpan-cli/pulls/{PR_NUMBER}/comments
   ```
2. 本地修复问题
3. 重新运行测试：
   ```bash
   npm run typecheck && npm test && npm run build
   ```
4. 提交并推送：
   ```bash
   git add . && git commit -m "fix: address review feedback"
   git push origin opencode
   ```
5. **返回 Step 3.1**，等待 10 分钟后重新检查

**如果 review 未触发**：
1. 手动触发 review：
   ```bash
   gh pr comment --repo YingkeSu/bhpan-cli --body "@codex review"
   ```
2. **返回 Step 3.1**，等待 10 分钟

### 循环条件

**持续循环直到 review 通过（APPROVED）**，不得跳过或合并未经批准的 PR。

---

## Phase 4: 合并与发布

### Step 4.1: 合并 PR

```bash
gh pr merge --repo YingkeSu/bhpan-cli --squash --delete-branch=false
```

或使用 GitHub UI "Squash and merge"。

### Step 4.2: 同步本地分支

```bash
git checkout main
git pull origin main
git checkout opencode
git merge main  # 保持 opencode 与 main 同步
```

### Step 4.3: 发布（如需要）

1. 更新 CHANGELOG.md
2. 更新 package.json 版本号
3. 创建 tag 并推送：
   ```bash
   git tag v0.x.x
   git push origin v0.x.x
   ```
4. 发布到 npm：
   ```bash
   npm publish
   ```

### Step 4.4: 更新文档

```bash
# 更新开发状态
# 编辑 docs/DEV_STATUS.md
```

---

## 快速参考命令

### 开发前检查
```bash
gh issue list --repo YingkeSu/bhpan-cli --state open
gh pr list --repo YingkeSu/bhpan-cli --state open
```

### 本地验证
```bash
npm run typecheck && npm test && npm run build
```

### PR 操作
```bash
gh pr create --repo YingkeSu/bhpan-cli --base main --head opencode
gh pr view --repo YingkeSu/bhpan-cli --json reviewDecision
gh pr merge --repo YingkeSu/bhpan-cli --squash
```

### Review 循环
```bash
# 等待 10 分钟后检查
sleep 600 && gh pr view --repo YingkeSu/bhpan-cli --json reviewDecision

# 查看 review comments
gh api repos/YingkeSu/bhpan-cli/pulls/{NUMBER}/comments

# 触发 review
gh pr comment --repo YingkeSu/bhpan-cli --body "@codex review"
```

---

## 流程检查清单

每次开发完成后，确认以下事项：

- [ ] Phase 0: 已检查 open issues 和 PRs
- [ ] Phase 1: 本地测试全部通过
- [ ] Phase 2: 已提交并创建/更新 PR
- [ ] Phase 3: 等待 10 分钟后检查 review
- [ ] Phase 3: review 通过后才合并
- [ ] Phase 4: 已同步本地分支
- [ ] Phase 4: 已更新相关文档

---

## 异常处理

### Codex 长时间未响应

1. 检查 GitHub Actions 状态
2. 手动触发：`gh pr comment --body "@codex review"`
3. 等待额外 5 分钟
4. 如仍无响应，检查 GitHub webhook 配置

### Review 反复不通过

1. 详细阅读每条 comment
2. 在 PR 中回复解释修复方案
3. 如有争议，在 PR 中讨论而非跳过
4. 超过 3 次仍不通过，考虑重新设计方案

### 合并冲突

```bash
git checkout main && git pull origin main
git checkout opencode && git merge main
# 解决冲突后
npm run typecheck && npm test && npm run build
git push origin opencode
```

---

## 版本发布规范

### 版本号规则

遵循 [Semantic Versioning](https://semver.org/)：

- **MAJOR (x.0.0)**: 不兼容的 API 变更
- **MINOR (0.x.0)**: 新增功能，向后兼容
- **PATCH (0.0.x)**: Bug 修复

### 发布前检查

- [ ] 所有测试通过
- [ ] CHANGELOG.md 已更新
- [ ] package.json 版本号已更新
- [ ] 已在真实 AnyShare 账号验证
- [ ] 文档（README.md）已同步更新

---

## 相关文档

- [AGENTS.md](/root/Programs/bhpan_cli/AGENTS.md) - 仓库指南
- [DEV_STATUS.md](/root/Programs/bhpan_cli/docs/DEV_STATUS.md) - 开发状态
- [CHANGELOG.md](/root/Programs/bhpan_cli/CHANGELOG.md) - 变更记录
