# StoryFlow architecture

StoryFlow is a build-free static site. GitHub Pages serves the repository root, while all personal content stays in the user-selected StoryFlow folder.

`app-loader.js` is the authoritative classic-script manifest. Its order is part of the runtime contract: older feature files share global lexical bindings and must remain parser-ordered until a domain is migrated as one unit. `index.html` should contain only external Google loaders and the StoryFlow loader, not individual app feature scripts.

## Data ownership

| Data | Owner | Location |
| --- | --- | --- |
| Active UI state | `app.js`, `projects.js` | Memory only |
| Workspace persistence | `src/persistence/integrations.js`, `src/persistence/settings-sync.js`, `src/persistence/project-persistence-guard.js` | `workspace.json` |
| Backup and recovery | `src/persistence/integrations.js`, `src/persistence/workspace-safety.js` | `workspace.backup.json`, `Recovery/` |
| Google bootstrap and token session | `src/settings/settings-bootstrap.js`, `src/connection/session-auth.js` | `settings.json`, session storage |
| Generated articles | `src/persistence/integrations.js` | `Works/<work>/<chapter>/` |

All `workspace.json` writes must go through `StoryFlowIntegrations.saveWorkspace()`. That function serializes writes, creates the latest-good backup and rejects stale revisions. Do not write `workspace.json` directly from feature modules.

## Runtime layers

1. `src/persistence/integrations.js` provides file and Google adapters.
2. `app.js` defines the base state and rendering helpers.
3. `src/persistence/settings-sync.js` owns debounced persistence and truthful save status.
4. `src/persistence/workspace-safety.js` owns recovery and conflict decisions.
5. Feature modules add projects, sources, splitting, publishing and responsive UI.
6. `src/persistence/project-persistence-guard.js` accelerates critical structural saves through the same integration queue.

The current root still contains historical refinement modules loaded as classic scripts. Moving them into folders or bundling them would change script-order semantics, so that cleanup should be handled as a separate P1 refactor with dedicated regression coverage.

## Validation

Run:

```sh
node scripts/check-static.mjs
```

For workspace safety integration checks, serve the repository root and open the two pages documented in `tests/README.md`.
