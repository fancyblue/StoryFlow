# StoryFlow architecture

StoryFlow is a build-free static site. GitHub Pages serves the repository root, while all personal content stays in the user-selected StoryFlow folder.

`app-loader.js` is the authoritative classic-script manifest. Its order is part of the runtime contract: older feature files share global lexical bindings and must remain parser-ordered until a domain is migrated as one unit. `index.html` should contain only external Google loaders and the StoryFlow loader, not individual app feature scripts.

## Data ownership

| Data | Owner | Location |
| --- | --- | --- |
| Active UI state | `src/core/app.js`, `src/projects/projects.js` | Memory only |
| Workspace persistence | `src/persistence/integrations.js`, `src/persistence/settings-sync.js`, `src/persistence/project-persistence-guard.js` | `workspace.json` |
| Backup and recovery | `src/persistence/integrations.js`, `src/persistence/workspace-safety.js`, `src/settings/backup-center.js` | `workspace.backup.json`, `Recovery/` |
| Google bootstrap and token session | `src/settings/settings-bootstrap.js`, `src/connection/session-auth.js` | `settings.json`, session storage |
| Generated articles | `src/persistence/integrations.js` | `Works/<work>/<chapter>/` |

All `workspace.json` writes must go through `StoryFlowIntegrations.saveWorkspace()`. That function serializes writes, creates the latest-good backup and rejects stale revisions. It also maintains content-deduplicated rolling snapshots in `Recovery/`: at most one per hour and the latest three only. Pruning applies only to `workspace.auto-*` artifacts; conflict and high-risk-operation snapshots are never removed by the rolling-backup policy. Do not write `workspace.json` directly from feature modules.

## Runtime layers

1. `src/persistence/integrations.js` provides file and Google adapters.
2. `src/core/app.js` defines the base state and rendering helpers.
3. `src/persistence/settings-sync.js` owns debounced persistence and truthful save status.
4. `src/persistence/workspace-safety.js` owns recovery and conflict decisions.
5. Domain folders under `src/` add projects, sources, splitting, publishing and responsive UI.
6. `src/persistence/project-persistence-guard.js` accelerates critical structural saves through the same integration queue.

The Settings backup center uses the same persistence queue. Manual import and backup restore always preserve the current `workspace.json` in `Recovery/` before replacement.

Destructive or overwrite flows must call `StoryFlowProjectPersistence.prepareRecovery()` before changing state or deleting generated files. That single guard flushes the current project store and then calls `StoryFlowIntegrations.createWorkspaceRecoverySnapshot()`. This applies to project, chapter and published-article deletion as well as single-chapter source refresh. Full-project source sync uses `StoryFlowSourceSyncHistory.prepare()` to enforce the same save-then-snapshot order while staging its one-time undo. If either safety step fails, the destructive action must stop without mutating the in-memory workspace.

Save-state UI describes local file persistence as preparing, saving or saved. Avoid the word “sync” for ordinary folder writes; reserve source-sync language for comparing or applying Google Docs changes.

Chrome stores only the selected directory handle in IndexedDB. `src/connection/folder-session.js` requires an explicit reconnect on a cold tab, while `src/connection/quick-start.js` presents the remembered folder name and routes the reconnect through the normal workspace/settings loader. “Leave this device” removes both the session values and directory handle.

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
