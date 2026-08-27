# Browser smoke tests

## Proportional testing for this project

StoryFlow is a private, single-user site whose primary working environment is desktop Chrome. Verification should therefore be risk-based instead of automatically running every test for every change.

- Small copy, documentation, isolated style, icon, spacing, color or cache-version changes: run `npm run test:static`, one relevant Playwright test when available, and inspect the affected page at its normal desktop width.
- Shared navigation/layout or responsive changes: run the related browser tests and only the visual baselines that can actually change.
- Persistence, Google/Drive, folder/file, Recovery, destructive-action, source-sync, split/output or publishing-data changes: run the relevant safety tests and the full `npm test` suite when the impact crosses several flows.
- A passing GitHub Actions run can be used as the full-suite result after push; avoid duplicating a full local run unless debugging.
- Do not regenerate all visual baselines or complete the entire real-Chrome acceptance checklist for a small isolated UI change.

The goal is fast feedback appropriate for one private user while retaining stricter verification anywhere manuscript data could be lost or corrupted.

- `workspace-safety-core.html` uses an in-memory File System Access API double to verify serialized writes, the latest-good backup, deduplicated rolling Recovery snapshots, conflict copies and corrupt-file recovery.
- `destructive-action-guard-core.html` verifies that high-risk actions save first, snapshot second and stop before mutation when either safety step fails.
- `workspace-safety-ui.html` renders the recovery dialog without reading or changing a real StoryFlow folder.
- `article-image-assets-core.html` verifies private binary copy, duplicate-name handling, stable relative paths, supported-format guards, image readback and Recovery-before-delete using an in-memory File System Access API.
- `backup-center-ui.html` renders the connected-folder backup center with safe fixture metadata.
- `quick-start-ui.html` verifies the remembered-folder cold-start prompt without touching a real folder.
- `mobile-safe-mode-ui.html` emulates a phone session and verifies the compact read-only label, Settings-only session switch, guarded writes, safe workspace reload and return-to-read-only save; settings import remains available.
- `source-diff-core.html` verifies same-count replacements, exact inline change isolation in long paragraphs, whitespace-only changes, title changes and line-ending normalization.
- `source-diff-ui.html` renders the expandable stacked before/after change snippets with fixture prose only.
- `source-sync-history-core.html` verifies pre-sync staging, durable snapshot order, project isolation and one-time undo consumption.
- `browser/storyflow.spec.js` exercises the authoritative project source controller end to end with a mocked Google Docs response, verifies transactional new-work cancel/confirm behavior and the shared disclosure chevron, covers compact paragraph-snapped click/drag boundary movement without source mutation and end-marker scroll retention after leaving manual mode, preserves source-rail scroll/menu containment across long chapter lists, checks equal large add/edit dialogs, filled editor space, discoverable work-management/new-work actions, scene boundaries in compact output, all-project publishing fallback, publishing-title separation, private image import/metadata/order/preview/Markdown/removal, OS-aware and touch-hidden search shortcuts, the `×` search close control, cross-work search with opt-in body lookup, five-column narrow navigation, laptop-to-2560 px desktop layout bounds, independent article afterwords, optional output, per-platform publication date/URL records and deletion warnings.
- `browser/visual-regression.spec.js` captures the real app at 1280, 1440 and 1920 desktop widths, including a long chapter rail, works library, publishing queue and settings.

No user files or Google credentials are used.

Real Chrome release checks that require a user-selected disposable folder are documented in `docs/CHROME_ACCEPTANCE.md`.

Run the automated desktop Chromium suite:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

`npm test` runs both the static checks and browser suite. Reserve it for the higher-risk or cross-flow cases described above. The Playwright web server starts the local static site automatically.
Static validation also requires project, chapter, publishing and single-chapter source-refresh flows to use the centralized Recovery guard.

When an intentional visual change is approved, refresh the committed Chrome baselines with:

```sh
npm run test:browser -- --update-snapshots=all tests/browser/visual-regression.spec.js
```
