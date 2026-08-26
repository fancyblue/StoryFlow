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
- [ ] Open global search from the sidebar and with `⌘K` / `Ctrl+K`; search another work or chapter by name, use the arrow keys and Enter, and confirm StoryFlow switches to the correct location.
- [ ] Search for a phrase that exists only in prose. Confirm it is absent by default, then enable “同時搜尋正文” and confirm the chapter/article result includes a useful excerpt.
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
- [ ] Give the part a different publishing title. Confirm the list shows it as primary with the internal name beneath, the Markdown filename does not change, metadata contains `publishTitle`, and preview can copy title separately from content.
- [ ] Expand the article and import two disposable images from different file-provider locations. Confirm both are copied under `assets/<article ID>/`, duplicate names do not overwrite, thumbnails show dimensions/size and files over 8 MB display a warning.
- [ ] Add alternative text and a caption, move one image, change its position, then save. Confirm preview follows the chosen groups, clicking opens the lightbox and generated Markdown contains relative image paths.
- [ ] Temporarily rename one disposable image outside StoryFlow and confirm the manager and preview show a missing-file warning; restore it afterward.
- [ ] Confirm “複製內容” copies prose only and the preview reminds you to upload images separately; confirm individual and all-image Markdown copy actions work.
- [ ] Remove one image from the article without deleting it and confirm the file remains. For another disposable image choose “備份後刪除檔案” and confirm a copy exists in `Recovery/Assets/` before the source disappears.
- [ ] Expand the publishing part, add an afterword and confirm body/afterword counts are separate; verify the Markdown contains body, separator and afterword.
- [ ] In preview, turn off “附上後記”; confirm preview/copy output contains only the body and the article Markdown is rewritten consistently.
- [ ] For one platform, choose “記錄發布”, correct the time if needed, enter a URL without `https://`, then save. Confirm the row shows the date, the URL can be opened safely and the platform becomes “已發布”.
- [ ] Cancel that platform's published state, accept the warning and confirm both its time and URL are cleared. Existing legacy published rows without a record should instead remain readable as “未記錄發布時間”.
- [ ] Refresh the source chapter and confirm the publishing part's afterword remains unchanged.
- [ ] Start deleting the part, confirm the warning reports the affected afterword, then cancel before the destructive checks continue.
- [ ] If the part has images, confirm article deletion says the private asset files will be retained.
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
