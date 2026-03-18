## Summary
<!-- Brief description of changes (1-3 sentences) -->

## Type of Change
<!-- Mark the relevant option with an `x` -->
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Release (version bump, changelog update)

## Verification
<!-- Run ALL applicable commands and mark with `x` -->
- [ ] `npm run typecheck` - TypeScript validation passes
- [ ] `npm test` - Unit tests pass
- [ ] `npm run build` - Production build succeeds
- [ ] `npm run check` - Pre-release gate passes (typecheck + test + help)
- [ ] `npm run verify:mv-cp` - Live integration test (if applicable)

### Test Commands Run
<!-- List the actual commands you executed for verification -->
```bash
# Example:
npm run typecheck
npm test
npm run build
```

## Environment Assumptions
<!-- Describe any specific test conditions or environment requirements -->
<!-- Examples: -->
<!-- - "Tested with real BUAA AnyShare account" -->
<!-- - "Requires BHPAN_USERNAME and BHPAN_PASSWORD env vars" -->
<!-- - "Tested on Node.js v22.x" -->

## Impact Analysis
<!-- For user-facing changes, describe the impact -->
- **User-facing**: <!-- Does this change affect end users? If yes, how? -->
- **API changes**: <!-- Does this change any public APIs or interfaces? -->
- **Breaking changes**: <!-- Does this introduce any breaking changes? -->

## Related Issues
<!-- Link to related issues or PRs -->
<!-- Example: Fixes #123, Related to #456 -->

## Notes
<!-- Any additional context for reviewers -->
<!-- Examples: -->
<!-- - "This fixes a regression introduced in v0.2.0" -->
<!-- - "Codex review suggestions incorporated from previous PR" -->
<!-- - "Manual testing performed with real AnyShare account" -->

## Checklist
<!-- Mark all applicable items with `x` -->
- [ ] My code follows the style guidelines in AGENTS.md
- [ ] I have performed a self-review of my code
- [ ] I have commented my code where necessary
- [ ] I have updated documentation (AGENTS.md, README.md, CHANGELOG.md) if applicable
- [ ] My changes generate no new warnings or type errors
- [ ] I have tested my changes locally
- [ ] I am ready for Codex review

---

**Reminder**: This PR will trigger automatic Codex review. Ensure all verification commands pass before pushing.
