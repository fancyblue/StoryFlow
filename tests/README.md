# Browser smoke tests

- `workspace-safety-core.html` uses an in-memory File System Access API double to verify serialized writes, automatic backup, conflict copies and corrupt-file recovery.
- `workspace-safety-ui.html` renders the recovery dialog without reading or changing a real StoryFlow folder.
- `backup-center-ui.html` renders the connected-folder backup center with safe fixture metadata.
- `quick-start-ui.html` verifies the remembered-folder cold-start prompt without touching a real folder.

Serve the repository root over HTTP and open these pages in Chrome. No user files or Google credentials are used.
