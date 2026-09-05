# Browser smoke tests

> 狀態：現行測試規範與覆蓋索引（持續維護；最後同步：2026-09-01）

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
- `storage-management-core.html` verifies age-gated cleanup, rolling-backup retention, and that referenced or recent article/visual images are never removed.
- `quick-start-ui.html` verifies the remembered-folder cold-start prompt without touching a real folder.
- `mobile-safe-mode-ui.html` emulates a phone session and verifies the compact read-only label, Settings-only session switch, guarded writes, safe workspace reload and return-to-read-only save; settings import remains available.
- `source-diff-core.html` verifies same-count replacements, exact inline change isolation in long paragraphs, whitespace-only changes, title changes and line-ending normalization.
- `source-diff-ui.html` renders the expandable stacked before/after change snippets with fixture prose only.
- `visual-content-model-core.html` verifies legacy longform defaults, visual workspace round trips, the fixed-ID output/image path contract and shared publishable adapters.
- `browser/storyflow.spec.js` covers the completed Phase 1–2 visual flow: transactional series/entry creation and cancellation, dedicated workspace, shared SOURCE-rail geometry, entry editing, private image adapter, cover/alt/caption, ordering, preview, optional summary/hashtag publishing helpers, shared search/publishing adapters, save, overflow-based Recovery-gated deletion and Works type label.
- `source-sync-history-core.html` verifies pre-sync staging, durable snapshot order, project isolation and one-time undo consumption.
- `browser/storyflow.spec.js` exercises the authoritative project source controller end to end with a mocked Google Docs response, verifies transactional new-work cancel/confirm behavior and the shared disclosure chevron, covers compact paragraph-snapped click/drag boundary movement without source mutation and end-marker scroll retention after leaving manual mode, preserves source-rail scroll/menu containment across long chapter lists, checks equal large add/edit dialogs, filled editor space, discoverable work-management/new-work actions, scene boundaries in compact output, all-project publishing fallback, compact session-stable work-group collapse, compact image/afterword tools, per-platform publishing-title overrides, optional heading/bold title prefixes during copy, private image import/metadata/order/preview/Markdown/removal, OS-aware and touch-hidden search shortcuts, the `×` search close control, cross-work search with opt-in body lookup, five-column narrow navigation, laptop-to-2560 px desktop layout bounds, independent article afterwords, optional output, per-platform publication date/URL records and deletion warnings.
- `browser/cascade-contract.spec.js` asserts the *resolved* computed styles of the shared control system and of overlays that no baseline covers: navigation fills, the split-review primary action, contrast tokens on statistics and segment labels, the hollow/filled connection dot, the publishing row actions and its overflow menu, the disabled treatment on danger controls, the desktop/phone split for Settings and the chapter-row height, and the global `[hidden]` rule. These are the values layering fights are about, so this spec — not the pixel baselines — is the net for cascade work. A failure means a change reached further than intended: confirm the new value is wanted, then update the expectation in the same commit so the diff records the decision. Verified to fail when the global `[hidden]` rule, the statistics contrast token, or the disabled-danger treatment is removed.

  The pixel tolerance stays at `maxDiffPixelRatio: 0.025`. It is deliberately loose because baselines are generated on one Chromium build and compared on another in CI, where anti-aliasing differs; its job is catching gross layout breakage, not small value changes. Tightening it would trade flakiness for coverage the contract spec already provides more precisely.

- `browser/visual-regression.spec.js` combines intentional 1440 px visual baselines with resilient geometry contracts at 1280, 1440, 1920 and 390 px. It blocks document overflow, overlapping action groups, crossed workspace columns, off-screen dialogs and clipped dialog footers across the longform workspace, visual workspace, Works, Publishing, previews and Settings. The three `workspace-long-*` baselines are asserted at 1280, 1440 and 1920 px inside the long-rail test; they were unreferenced files before.

No user files or Google credentials are used.

Real Chrome release checks that require a user-selected disposable folder are documented in `docs/CHROME_ACCEPTANCE.md`.

Run the automated desktop Chromium suite:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

When a change is meant to be visually inert — removing dead declarations, for example — prove it rather than trusting a pass. Capture every element's computed style on each surface before and after and diff them; the 171-declaration removal in this repository was verified that way across 13,726 elements and 45 properties on seven surfaces at two widths. An earlier attempt at 609 declarations looked equally safe and the same diff caught 184 real changes, because the cascade order is not the document order (see `docs/UI_SYSTEM.md`).

`npm run test:assets` is a separate, fast check that every asset changed against the base branch also had its `?v=` cache query updated; GitHub Pages serves this repository directly, so a stale query means returning browsers keep the previous file. `npm run bump:assets` performs the update.

`npm test` runs both the static checks and browser suite. Reserve it for the higher-risk or cross-flow cases described above. The Playwright web server starts the local static site automatically.
Static validation also requires project, chapter, publishing and single-chapter source-refresh flows to use the centralized Recovery guard.

When an intentional visual change is approved, refresh the committed Chrome baselines with:

```sh
npm run test:browser -- --update-snapshots=all tests/browser/visual-regression.spec.js
```
