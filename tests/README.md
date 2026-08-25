# Browser smoke tests

- `workspace-safety-core.html` uses an in-memory File System Access API double to verify serialized writes, the latest-good backup, deduplicated rolling Recovery snapshots, conflict copies and corrupt-file recovery.
- `destructive-action-guard-core.html` verifies that high-risk actions save first, snapshot second and stop before mutation when either safety step fails.
- `workspace-safety-ui.html` renders the recovery dialog without reading or changing a real StoryFlow folder.
- `backup-center-ui.html` renders the connected-folder backup center with safe fixture metadata.
- `quick-start-ui.html` verifies the remembered-folder cold-start prompt without touching a real folder.
- `mobile-safe-mode-ui.html` emulates a phone session and verifies that file writes and editing controls stay locked until a connected workspace reload succeeds; settings import remains available.
- `source-diff-core.html` verifies same-count replacements, whitespace-only changes, title changes and line-ending normalization.
- `source-diff-ui.html` renders the expandable before/after source preview with fixture prose only.
- `source-sync-history-core.html` verifies pre-sync staging, durable snapshot order, project isolation and one-time undo consumption.
- `browser/storyflow.spec.js` exercises the authoritative project source controller end to end with a mocked Google Docs response, verifies transactional new-work cancel/confirm behavior and the shared disclosure chevron, and confirms that an empty publishing-project selection falls back to all projects without breaking the desktop action layout.
- `browser/visual-regression.spec.js` captures the real app at 1280, 1440 and 1920 desktop widths, including a long chapter rail, works library, publishing queue and settings.

No user files or Google credentials are used.

Real Chrome release checks that require a user-selected disposable folder are documented in `docs/CHROME_ACCEPTANCE.md`.

Run the automated desktop Chromium suite:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

`npm test` runs both the static checks and browser suite. The Playwright web server starts the local static site automatically.
Static validation also requires project, chapter, publishing and single-chapter source-refresh flows to use the centralized Recovery guard.

When an intentional visual change is approved, refresh the committed Chrome baselines with:

```sh
npm run test:browser -- --update-snapshots=all tests/browser/visual-regression.spec.js
```
