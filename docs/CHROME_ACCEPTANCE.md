# StoryFlow Chrome acceptance checklist

Use this checklist before treating a release as ready for daily writing. It exercises Chrome's real File System Access behavior, which CI replaces with safe in-memory fixtures.

## Safety setup

- [ ] Use current desktop Chrome.
- [ ] Create a new empty folder such as `StoryFlow-Acceptance`; do not select a real manuscript folder.
- [ ] Prepare a disposable Google Doc with two chapter headings and short test prose.
- [ ] If Google integration is needed, use a copy of `settings.json` that contains no manuscript content.

## 1. Connect, save and reload

- [ ] Open StoryFlow and connect `StoryFlow-Acceptance`.
- [ ] From an existing work, choose “切換作品” → “新增作品” → “手動新增”, then close the dialog. Confirm the original work is still active and no empty work was added.
- [ ] Create a manual work and add one test chapter.
- [ ] Confirm the new work appears only after “確定新增” or preview confirmation.
- [ ] Check that “切換作品”, “切篇偏好” and publishing work filters use the same down/up chevron behavior.
- [ ] Confirm the header changes from “保存中…” to “已保存 HH:mm”.
- [ ] Check that `workspace.json`, `workspace.backup.json` and `settings.json` exist in the folder.
- [ ] Reload the page and confirm the work and chapter are restored.
- [ ] Close the tab, reopen StoryFlow and use the remembered-folder reconnect flow.

## 2. Google Docs source changes

- [ ] Load the disposable Google Doc as a new work.
- [ ] Change its text without changing the total character count.
- [ ] Run “更新作品來源” and confirm the preview says the character count is unchanged while showing the actual before/after text.
- [ ] Apply the update and confirm the work contains the new text.
- [ ] Use “復原上次來源更新” once and confirm the old text returns; confirm the action is no longer offered afterward.

## 3. Publishing and destructive-action safety

- [ ] Create and save one test publishing part, then confirm its Markdown exists under `Works/<work>/<chapter>/`.
- [ ] Expand the publishing part, add an afterword and confirm body/afterword counts are separate; verify the Markdown contains body, separator and afterword.
- [ ] In preview, turn off “附上後記”; confirm preview/copy output contains only the body and the article Markdown is rewritten consistently.
- [ ] Refresh the source chapter and confirm the publishing part's afterword remains unchanged.
- [ ] Start deleting the part, confirm the warning reports the affected afterword, then cancel before the destructive checks continue.
- [ ] Delete the test publishing part and confirm a `workspace.before-publishing-delete-*.json` file appears in `Recovery/`.
- [ ] Delete an empty test chapter and confirm a `workspace.before-chapter-delete-*.json` file appears.
- [ ] Delete a disposable work and confirm a `workspace.before-project-delete-*.json` file appears.
- [ ] Confirm the Google Doc itself was not changed or deleted.

## 4. Backup and recovery

- [ ] Make at least two separate workspace saves and confirm `workspace.backup.json` contains the prior valid workspace.
- [ ] Open Settings → Backup and Recovery and confirm the current workspace, latest backup and Recovery counts are readable.
- [ ] Use “下載 workspace.json” and confirm the downloaded JSON opens normally.
- [ ] Import that downloaded workspace and confirm the pre-import workspace is preserved in `Recovery/`.
- [ ] Restore from the latest backup once and confirm the pre-restore workspace is preserved in `Recovery/`.

The one-hour interval and three-file limit for `workspace.auto-*` rolling backups are covered by automated policy tests and code review; the acceptance run does not need to wait several hours.

## 5. Leave this device

- [ ] Choose “離開此裝置” and confirm the browser forgets Google and the folder connection.
- [ ] Confirm files inside `StoryFlow-Acceptance` still exist.
- [ ] Reconnect the folder or import `settings.json` and confirm setup can be restored without committing personal data to GitHub.

## 6. Phone Drive safety

- [ ] Use Chrome device emulation or a phone with a disposable cloud-backed StoryFlow folder; never use real manuscript data.
- [ ] Open a new phone tab and confirm the main surface shows only the compact “唯讀” label before any edit.
- [ ] Confirm navigation, previews, folder reconnect and `settings.json` import remain available while text fields and mutating actions stay locked.
- [ ] Open Settings and confirm the explanation and editing switch appear under “手機使用模式”, not on the main work surface.
- [ ] With the folder disconnected, confirm the Settings switch refuses to unlock.
- [ ] Reconnect the disposable folder, ensure its cloud provider reports no pending upload/download, then enable editing from Settings. Confirm StoryFlow reloads the workspace before unlocking and the compact label changes to “可編輯”.
- [ ] Simulate an unreadable or conflicting workspace and confirm the page remains read-only.
- [ ] Switch back to read-only and confirm StoryFlow saves first; when saving fails, confirm editing remains enabled.
- [ ] Close the phone tab, reopen StoryFlow and confirm it starts read-only again.
- [ ] On desktop Chrome, confirm the phone state label and Settings control are absent and normal editing is unchanged.

Record only failures, Chrome version and the tested StoryFlow commit. Never attach the test `settings.json` or folder contents to a public issue.
