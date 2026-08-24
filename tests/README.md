# Browser smoke tests

- `workspace-safety-core.html` uses an in-memory File System Access API double to verify serialized writes, automatic backup, conflict copies and corrupt-file recovery.
- `workspace-safety-ui.html` renders the recovery dialog without reading or changing a real StoryFlow folder.

Serve the repository root over HTTP and open these pages in Chrome. No user files or Google credentials are used.
