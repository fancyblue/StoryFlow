# StoryFlow architecture

StoryFlow is a build-free static site. GitHub Pages serves the repository root, while all personal content stays in the user-selected StoryFlow folder.

`app-loader.js` is the authoritative classic-script manifest. Its order is part of the runtime contract: older feature files share global lexical bindings and must remain parser-ordered until a domain is migrated as one unit. `index.html` should contain only external Google loaders and the StoryFlow loader, not individual app feature scripts.

## Data ownership

| Data | Owner | Location |
| --- | --- | --- |
| Active UI state | `src/core/app.js`, `src/projects/projects.js` | Memory only |
| Workspace persistence | `src/persistence/integrations.js`, `src/persistence/settings-sync.js`, `src/persistence/project-persistence-guard.js`, `src/persistence/mobile-safe-mode.js` | `workspace.json` |
| Backup and recovery | `src/persistence/integrations.js`, `src/persistence/workspace-safety.js`, `src/settings/backup-center.js` | `workspace.backup.json`, `Recovery/` |
| Google bootstrap and token session | `src/settings/settings-bootstrap.js`, `src/connection/session-auth.js` | `settings.json`, session storage |
| Generated articles | `src/persistence/integrations.js` | `Works/<work>/<chapter>/` |

Each publishing `part` owns `publishTitle`, `afterword`, `includeAfterword`, `platformStatus` and `publicationRecords`. `publishTitle` is a reader-facing override; an empty value falls back to the internal `part.title`. It is stored in `workspace.json` and article metadata, but must not rename the source part or its stable Markdown filename. The afterword is stored in `workspace.json` beside publishing state, not in a source chapter draft. `publicationRecords` is keyed by platform and contains only `{ publishedAt, url }`; it is normalized on load and written into generated article metadata with the rest of the part. `src/publishing/publishing-flow.js` composes the body and optional afterword only at preview/copy/Markdown-output time. Source refresh therefore leaves publishing titles, afterwords and publication records unchanged, while publishing deletion removes them with their owning parts after the normal Recovery guard.

Saving a publication record also marks that platform as published. Removing the published state clears its record after confirmation. Platform rename and deletion must migrate or remove both `platformStatus` and `publicationRecords`. Legacy published states without a record remain valid and display “未記錄發布時間”; never fabricate a historical timestamp during migration.

All `workspace.json` writes must go through `StoryFlowIntegrations.saveWorkspace()`. That function serializes writes, creates the latest-good backup and rejects stale revisions. It also maintains content-deduplicated rolling snapshots in `Recovery/`: at most one per hour and the latest three only. Pruning applies only to `workspace.auto-*` artifacts; conflict and high-risk-operation snapshots are never removed by the rolling-backup policy. Do not write `workspace.json` directly from feature modules.

## Runtime layers

1. `src/persistence/integrations.js` provides file and Google adapters.
2. `src/core/app.js` defines the base state and rendering helpers.
3. `src/persistence/settings-sync.js` owns debounced persistence and truthful save status.
4. `src/persistence/workspace-safety.js` owns recovery and conflict decisions.
5. Domain folders under `src/` add projects, sources, splitting, publishing and responsive UI.
6. `src/persistence/project-persistence-guard.js` accelerates critical structural saves through the same integration queue.
7. `src/persistence/mobile-safe-mode.js` loads after the final persistence wrapper and blocks phone writes unless the current tab explicitly enables editing after a successful workspace reload.

The Settings backup center uses the same persistence queue. Manual import and backup restore always preserve the current `workspace.json` in `Recovery/` before replacement.

Destructive or overwrite flows must call `StoryFlowProjectPersistence.prepareRecovery()` before changing state or deleting generated files. That single guard flushes the current project store and then calls `StoryFlowIntegrations.createWorkspaceRecoverySnapshot()`. This applies to project, chapter and published-article deletion as well as single-chapter source refresh. Full-project source sync uses `StoryFlowSourceSyncHistory.prepare()` to enforce the same save-then-snapshot order while staging its one-time undo. If either safety step fails, the destructive action must stop without mutating the in-memory workspace.

Save-state UI describes local file persistence as preparing, saving or saved. Avoid the word “sync” for ordinary folder writes; reserve source-sync language for comparing or applying Google Docs changes.

Chrome stores only the selected directory handle in IndexedDB. `src/connection/folder-session.js` requires an explicit reconnect on a cold tab, while `src/connection/quick-start.js` presents the remembered folder name and routes the reconnect through the normal workspace/settings loader. “Leave this device” removes both the session values and directory handle.

Phone sessions default to read-only because a browser can verify neither whether a cloud-backed file provider has downloaded the newest file nor whether pending uploads have completed. Read-only mode keeps folder reconnect, settings import and reading available, but guards `saveWorkspace`, `saveStoryFlowSettings`, Markdown writes, backup/recovery replacement and the final `saveState` wrapper. The main surface exposes only a compact state indicator; the session-scoped editing switch belongs to Settings. Enabling requires an online connected folder, rehydrates `workspace.json`, and refuses to unlock when reload fails or Recovery is pending. Disabling flushes the workspace before returning to read-only. Desktop behavior must remain unchanged.

`src/ui/global-search.js` builds its search records on demand from `StoryFlowProjects.searchSnapshot()`. It searches loaded work, chapter and publishing-title metadata by default, and includes chapter/article body text only after an explicit opt-in. It must not persist a search index, copy prose into local/session storage or send queries to a remote service. Search results route through the existing project switcher and navigation APIs so one authoritative active-work state remains in control.

The repository root contains entry assets only. Runtime JavaScript lives under domain folders in `src/`; dormant historical scripts are isolated in `src/legacy/` and are not part of the asset manifest. Script order remains explicit in `app-loader.js` until each domain can be migrated as one unit.

CSS owned by a page domain lives under `styles/domains/`. A domain may keep a foundation file and one explicitly late layout/refinement file when the existing cascade boundary is part of the UI contract. Page composition, grid placement, responsive order and overflow boundaries belong there instead of being spread across feature styles or injected by JavaScript.

Shared interaction vocabulary is documented in [UI_SYSTEM.md](UI_SYSTEM.md), and cross-page user flows are documented in [UX_FLOW.md](UX_FLOW.md). New-work creation is a pending transaction owned by `src/ui/navigation.js`: source modules may collect and preview data, but must call `StoryFlowNewWorkFlow.commit()` only after confirmation or `.cancel()` on dismissal. Opening a creation dialog must never create an empty project.

| Source directory | Responsibility |
| --- | --- |
| `src/core/` | Base configuration, state and rendering |
| `src/connection/` | Google session, folder session and connection controls |
| `src/settings/` | Settings view, bootstrap and file import |
| `src/persistence/` | Workspace IO, save queue, backup and recovery |
| `src/projects/` | Work library, chapter management and project switching |
| `src/source/` | Google/manual source ingestion, relinking and source modes |
| `src/split/` | Smart Split preferences, boundaries and continuation |
| `src/publishing/` | Publishing queue, filters, grouping and platform guards |
| `src/ui/` | Navigation, responsive layout and accessibility refinements |
| `src/legacy/` | Unloaded historical scripts retained only for reference |
| `styles/domains/` | Final page-level layout and responsive contracts |

## Validation

Run:

```sh
npm test
```

This runs the static architecture check and the desktop Chromium smoke suite. The browser suite starts its own local server and uses fixture data only; setup and individual test pages are documented in `tests/README.md`.
