# StoryFlow CSS structure

The application is build-free, so `index.html` remains the authoritative cascade manifest. Keep its stylesheet order stable unless a visual change is intentional and the Chrome snapshots are updated.

## Directories

- `layers/` contains cross-application foundations, theme, controls, navigation, responsive rules, and final layout integrity overrides.
- `domains/` contains styles owned by a product area such as Workspace, Publishing, or Settings.
- `archive/` contains retained experiments that are not loaded by `index.html`. Do not add an archived file back to the cascade without reviewing overlap and adding browser coverage.

Feature-specific styles that still live at the repository root should be moved into a domain only when that feature is actively changed. This keeps structural cleanups small and preserves cascade behavior.

## Cascade contract

1. `foundation.css` and `legacy-patches.css`
2. early feature and domain styles
3. general UI polish and shared controls
4. theme and responsive navigation/visual rules
5. `ui-system.css` and `layout-integrity.css`
6. late feature refinements and domain overrides

File names describe responsibility rather than historical version numbers. Cache versions stay in `index.html`, not in filenames.
