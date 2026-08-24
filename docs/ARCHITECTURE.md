# StoryFlow architecture

StoryFlow is a build-free static site. GitHub Pages serves the repository root, while all personal content stays in the user-selected StoryFlow folder.

## Data ownership

| Data | Owner | Location |
| --- | --- | --- |
| Active UI state | `app.js`, `projects.js` | Memory only |
| Workspace persistence | `integrations.js`, `settings-sync.js`, `project-persistence-guard.js` | `workspace.json` |
| Backup and recovery | `integrations.js`, `workspace-safety.js` | `workspace.backup.json`, `Recovery/` |
| Google bootstrap and token session | `settings-bootstrap.js`, `session-auth.js` | `settings.json`, session storage |
| Generated articles | `integrations.js` | `Works/<work>/<chapter>/` |

All `workspace.json` writes must go through `StoryFlowIntegrations.saveWorkspace()`. That function serializes writes, creates the latest-good backup and rejects stale revisions. Do not write `workspace.json` directly from feature modules.

## Runtime layers

1. `integrations.js` provides file and Google adapters.
2. `app.js` defines the base state and rendering helpers.
3. `settings-sync.js` owns debounced persistence and truthful save status.
4. `workspace-safety.js` owns recovery and conflict decisions.
5. Feature modules add projects, sources, splitting, publishing and responsive UI.
6. `project-persistence-guard.js` accelerates critical structural saves through the same integration queue.

The current root still contains historical refinement modules loaded as classic scripts. Moving them into folders or bundling them would change script-order semantics, so that cleanup should be handled as a separate P1 refactor with dedicated regression coverage.

## Validation

Run:

```sh
node scripts/check-static.mjs
```

For workspace safety integration checks, serve the repository root and open the two pages documented in `tests/README.md`.
