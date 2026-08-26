# StoryFlow contributor guidance

StoryFlow is a private, single-user tool. Desktop Chrome is the primary working environment; phone use is mainly read-only. Keep implementation and verification proportional to that scope.

## Testing policy

- For copy, documentation, isolated CSS, icon, spacing, color or cache-version changes, run `npm run test:static` plus the smallest relevant Playwright test or visual check. Inspect only the affected page and viewport.
- Do not routinely run the complete browser suite, regenerate every visual baseline, repeat the same full suite locally and in GitHub Actions, or perform multi-platform manual acceptance for a small UI change.
- Update only visual snapshots that are intentionally affected. Regenerate all desktop widths only when shared layout, navigation or responsive behavior changes.
- Run the full `npm test` suite when a change touches persistence, Google/Drive integration, folder or file operations, Recovery, destructive actions, source synchronization, split/output correctness, publishing data, shared navigation/layout infrastructure, or several user flows at once; also run it when targeted checks fail or the user explicitly asks for a full release verification.
- When a PR is pushed, successful GitHub Actions may serve as the full-suite confirmation. Do not repeat an already-passing full local run without a concrete reason.
- Use `docs/CHROME_ACCEPTANCE.md` selectively. Execute only sections related to the change unless preparing a major release or investigating a real Chrome/File System Access issue.

Private use lowers the need for broad compatibility testing, but not the need to protect manuscript data. Changes that can overwrite, delete, corrupt or mis-associate user files remain high risk and require the relevant safety tests.
