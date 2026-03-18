# Repository Guidelines

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

### Workflow Overview

All code changes must follow this review process before merging to `main`:

```
[Local Development] → [Push to opencode] → [Create/Update PR] → [Codex Review] → [Fix if needed] → [Re-review] → [Merge] → [Release]
```

### Step-by-Step Process

#### Phase 1: Local Development & Verification

1. **Make changes** on `opencode` branch
2. **Run local verification** (required before pushing):
   ```bash
   npm run typecheck  # TypeScript validation
   npm test           # Unit tests
   npm run build      # Production build
   ```
3. **For integration changes** (optional but recommended):
   ```bash
   npm run verify:mv-cp  # Live site integration test (requires credentials)
   ```

#### Phase 2: Push & Create PR

4. **Push to origin**:
   ```bash
   git push origin opencode
   ```

5. **Create or update PR** to `main`:
   - Use GitHub UI or `gh pr create`
   - **PR description must include**:
     - Summary of changes
     - Verification commands run
     - Any environment assumptions (e.g., tested with real AnyShare account)
     - Required env vars if applicable

#### Phase 3: Code Review

6. **Codex review triggers automatically** when PR is created/updated
   - No manual trigger needed (GitHub auto-review configured)
   - Codex provides inline comments on specific commits

7. **If Codex identifies issues**:
   - Fix issues on `opencode` branch
   - Push fixes: `git push origin opencode` (PR auto-updates)
   - Codex auto-reviews on push
   - Repeat until no blockers

8. **Review completion criteria**:
   - No blocking issues from Codex
   - All local verification passes
   - Any security/concern points addressed in PR comments

#### Phase 4: Merge & Release

9. **Merge PR** to `main`:
   - Use GitHub UI "Squash and merge" (recommended) or "Merge commit"
   - Do NOT use "Rebase" (preserves commit history for changelog)

10. **Post-merge tasks**:
    - Update CHANGELOG.md if user-facing changes
    - Bump version in package.json (if preparing release)
    - Create git tag and push to origin
    - Run `npm publish` for releases

### PR Description Template

When creating or updating PRs, include:

```markdown
## Summary
[Brief description of changes]

## Verification
Commands run:
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run verify:mv-cp` (if applicable)

## Environment Assumptions
[Any specific test conditions, e.g., "Tested with real BUAA AnyShare account", "Requires BHPAN_USERNAME env var"]

## Notes
[Any additional context for reviewers]
```

### Review Escalation Path

- **Codex blockers**: Fix and push, auto-re-review
- **Disagreement with Codex**: Add comment explaining rationale, maintain thread for documentation
- **Urgent fixes**: Follow same process; review still required for audit trail

### Branch Strategy

- **opencode**: Active development branch (push here, PR from here)
- **main**: Release branch (only merge reviewed PRs here)
- **feature branches**: Not used; all development on `opencode`

### Required Status Checks (Pre-merge)

Before merging any PR, ensure:
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] `npm run check` passes (typecheck + test + help)
- [ ] Codex review completed with no unresolved blockers

### Release Gate

No release without review:
- All changes must go through PR + Codex review
- Direct commits to `main` are prohibited
- Version bumps follow same review process

## Security & Configuration Tips

- This CLI talks to a real BUAA AnyShare instance. Do not commit credentials, tokens, or personal file paths.
- Integration scripts read credentials from environment variables; prefer env vars over editing source or docs with secrets.
