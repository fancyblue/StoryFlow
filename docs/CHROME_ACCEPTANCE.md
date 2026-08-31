# StoryFlow Chrome acceptance checklist

> 狀態：現行、可重複執行的人工驗收清單（最後同步：2026-08-31）。未勾選的方框表示每次驗收應重新執行，不代表功能尚未完成。

Use this checklist before treating a release as ready for daily writing. It exercises Chrome's real File System Access behavior, which CI replaces with safe in-memory fixtures.

StoryFlow is a private, single-user site, so this is not a mandatory checklist for every change. For an isolated UI or documentation adjustment, run only the section directly affected. Complete the whole checklist only for a major release, a change spanning several workflows, or work involving real Chrome folder/file behavior. Automated tests should follow the proportional policy in `tests/README.md`.

## Safety setup

- [ ] Use current desktop Chrome.
- [ ] Create a new empty folder such as `StoryFlow-Acceptance`; do not select a real manuscript folder.
- [ ] Prepare a disposable Google Doc with two chapter headings and short test prose.
- [ ] If Google integration is needed, use a copy of `settings.json` that contains no manuscript content.

## 1. Connect, save and reload

- [ ] Open StoryFlow and connect `StoryFlow-Acceptance`.
- [ ] From an existing work, choose “切換作品” → “新增作品” → “長文作品”. Confirm the source chooser can return to work type, the manual form can return to source choice, and closing the flow leaves the original work active without adding an empty work.
- [ ] Open the manual source, search, split confirmation and publishing preview dialogs. Confirm each dialog is announced by its visible heading and every `×` button is announced as “關閉”. Open Settings and confirm global search still opens above the page region.
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
- [ ] Run “更新作品來源” and confirm the preview says the character count is unchanged. Expand “查看變更片段” and confirm only the changed characters are highlighted with short context in stacked before/after rows, rather than showing two full paragraphs.
- [ ] Apply the update and confirm the work contains the new text.
- [ ] Use “復原上次來源更新” once and confirm the old text returns; confirm the action is no longer offered afterward.

## 3. Split precision

Before publishing, verify split precision with a disposable chapter containing one long scene and at least six paragraphs but no blank scene break:

- [ ] Generate the default suggestion and confirm it remains on a real scene ending.
- [ ] Open “切篇確認” and confirm “少一個場景／多一個場景” still perform coarse scene-level movement.
- [ ] At a desktop viewport around 760 CSS px high, open “切篇確認”. Confirm “確認完畢，回到切篇” is fully visible immediately, the dialog card itself does not need to scroll, and each comparison column still scrolls independently.
- [ ] Choose “手動微調”. Confirm the full chapter shows one selectable boundary after each eligible paragraph and the current “這一篇結束” line is visibly draggable.
- [ ] Drag the ending to another paragraph, then use a different paragraph's click target. Confirm “本篇／後續” counts, highlight and current preview update immediately.
- [ ] Confirm manual mode shows only the current-part and chapter columns; candidate endings are thin lines whose labels appear on hover/focus, while the blue current ending stays visible without creating large gaps between paragraphs.
- [ ] Choose an ending in the middle of a long chapter and press “結束微調”. Confirm the normal chapter view stays at “這一篇結束” instead of jumping to the chapter bottom.
- [ ] Confirm “本篇／後續” counts are visually smaller than the article title and “結束微調” action, while remaining readable without wrapping.
- [ ] In the works library, confirm “工作台／開啟／管理發布／管理章節／管理圖文” use the same text size and control height. Expanded manual chapters and visual entries both show direct edit plus a persistent `⋯` containing the Recovery-guarded delete action.
- [ ] Give the suggestion a custom title before moving it and confirm the title is preserved.
- [ ] Close and reopen confirmation; confirm manual mode resets. Confirm the source draft is byte-for-byte unchanged and no confirmed publishing article was rewritten.
- [ ] Turn off “段落間空一行” for a disposable platform. Confirm ordinary paragraphs are compact but an original scene boundary still shows the configured marker.
- [ ] Also turn off “顯示場景分隔符”. Confirm the marker disappears but one blank line still separates the two scenes.

## 4. Long chapter and work-management layout

- [ ] Resize desktop Chrome through approximately 1366×768, 1440×900, 1920×1080 and 2560×1440 CSS px. Confirm Workspace, Works, Publishing and Settings have no horizontal overflow; the ultrawide canvas is centered instead of stretching without limit.
- [ ] At 1600 CSS px and wider, confirm the chapter rail becomes modestly wider but never dominates the split surface. Collapse and expand the sidebar and confirm the centered canvas remains balanced.
- [ ] At 2560 CSS px, confirm Works and Publishing remain readable single-column task lists, Settings remains a narrower centered form, and buttons/text keep their normal desktop sizes.
- [ ] Create or load a disposable work with enough chapters to scroll the source rail. Select a chapter near the bottom and confirm neither the page nor chapter rail jumps to the top.
- [ ] Open the bottom chapter's `⋯` menu. Confirm it opens upward inside the visible rail and SMART SPLIT does not move down or change width.
- [ ] Open “編輯章節”, record its dialog size, then open “手動新增文章”. Confirm both use the same large editor, the textarea fills the available height, and the footer meets the card bottom without a blank region below the buttons.
- [ ] In Works, confirm every “管理章節” is the same emphasized light-blue 40 px / 14 px action. “工作台／開啟” stays outlined, “管理發布” stays paler, and only the card border and “目前作品” badge identify the current work.
- [ ] With no works, confirm only “建立第一個作品” is shown as the solid action. After creating a work, confirm the header “＋ 新作品” returns as an outlined 40 px / 14 px action.
- [ ] Create a “圖文系列” with a first entry. Confirm Works shows a `圖文` label, Workspace replaces the longform/Smart Split layout, and “管理發布” opens the visual entry in the shared Publishing page. Switch between a longform and visual work and confirm the same Workspace header and connection controls remain in place; only the title and mode-specific editing actions change.
- [ ] Compare longform “作品與章節” and visual “作品與圖文” at the same viewport. Confirm the SOURCE card, outer rail width, gap and editor alignment are identical.
- [ ] Open “新增圖文” with an empty title, then use both `×` and “取消”. Confirm neither action triggers required-field validation and no empty entry is created.
- [ ] Edit a visual entry with text or images. Confirm it auto-saves, publishing readiness follows content completeness, platform titles and publication records remain independent, and preview shows an explicit manual image-upload order without copying files.
- [ ] Search a visual title, platform title, and (with body search enabled) visual body. Confirm the result switches to the correct work and opens that visual item in Publishing.
- [ ] In the visual workspace, edit title/body/status, import duplicate-named JPG/PNG/WebP/GIF images, set cover/alt/caption, reorder with both drag and arrow controls, reload, and confirm text plus image order remain stable.
- [ ] From Workspace, Works and Publishing, confirm visual deletion is reached through the entry row's `⋯ → 刪除圖文`, uses the same confirmation and Recovery guard, and is not duplicated in the editor footer. Delete a disposable entry and confirm Recovery is created, `content.md`/`metadata.json` are removed, and private `assets/` remains. Explicitly delete one image file and confirm it first appears in `Recovery/Assets/`.
- [ ] On a phone-sized touch session in default read-only mode, confirm visual content and preview remain readable while entry creation, fields, import, ordering, removal and save controls are blocked.
- [ ] In Publishing, confirm every longform and visual row uses the same “預覽／管理發布／⋯” order, 40 px action height and 14 px management text. Expanded “收合發布” uses a stronger soft selection rather than a solid primary fill.
- [ ] In Workspace, confirm neither content type shows a direct publishing shortcut. Enter Publishing from primary navigation or the Works-page “管理發布” action.
- [ ] Confirm Publishing's empty-state return action remains the single solid 40 px / 14 px CTA, while publishing filters remain compact pills.
- [ ] In Settings, confirm “匯入 settings.json” is primary when Google integration is missing; the save button remains disabled and quiet until valid fields change. “新增平台” and “建立目前備份” stay secondary.
- [ ] Check the expanded and collapsed sidebar on macOS and Windows Chrome. Workspace, Works, Publishing, Settings, Search and the collapse control should all use the same stroke-icon language without platform-dependent text glyphs.

## 5. Publishing and destructive-action safety

- [ ] Open a visual entry in Publishing. Leave 摘要 and Hashtags empty and confirm saving/publishing remains valid. Then enter a summary and a copy-friendly hashtag string, save, reload and confirm both return unchanged, can be copied, support search/classification, and are not inserted into the visual body.
- [ ] Create and save one test publishing part, then confirm its Markdown exists under `Works/<work>/<chapter>/`.
- [ ] Open one platform's “預覽／複製”, give it a different title, and save. Confirm only that platform shows the custom title, the Markdown filename does not change, metadata contains `platformTitles`, and another platform still falls back to the article name.
- [ ] In the same preview, confirm “複製標題” remains independent. Enable “複製內容時把標題放在最前面”, verify both 大標題 and 粗體 previews, then confirm rich destinations receive formatting while plain-text destinations receive equivalent Markdown.
- [ ] Expand the article and confirm platform rows remain visible below one compact article-supplement row. Open “文章圖片” and import two disposable images from different file-provider locations. Confirm both are copied under `assets/<article ID>/`, duplicate names do not overwrite, thumbnails show dimensions/size and files over 8 MB display a warning.
- [ ] Add alternative text and a caption, move one image, change its position, then save. Confirm preview follows the chosen groups, clicking opens the lightbox and generated Markdown contains relative image paths.
- [ ] Temporarily rename one disposable image outside StoryFlow and confirm the manager and preview show a missing-file warning; restore it afterward.
- [ ] Confirm “複製內容” copies prose only and the preview reminds you to upload images separately; confirm individual and all-image Markdown copy actions work.
- [ ] Remove one image from the article without deleting it and confirm the file remains. For another disposable image choose “備份後刪除檔案” and confirm a copy exists in `Recovery/Assets/` before the source disappears.
- [ ] Open “後記” from the compact article-supplement row, add an afterword and confirm body/afterword counts are separate; verify the Markdown contains body, separator and afterword.
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

## 6. Backup and recovery

- [ ] Make at least two separate workspace saves and confirm `workspace.backup.json` contains the prior valid workspace.
- [ ] Open Settings → Backup and Recovery and confirm the current workspace, latest backup and Recovery counts are readable.
- [ ] Use “下載 workspace.json” and confirm the downloaded JSON opens normally.
- [ ] Import that downloaded workspace and confirm the pre-import workspace is preserved in `Recovery/`.
- [ ] Restore from the latest backup once and confirm the pre-restore workspace is preserved in `Recovery/`.

The one-hour interval and three-file limit for `workspace.auto-*` rolling backups are covered by automated policy tests and code review; the acceptance run does not need to wait several hours.

## 7. Leave this device

- [ ] Choose “離開此裝置” and confirm the browser forgets Google and the folder connection.
- [ ] Confirm files inside `StoryFlow-Acceptance` still exist.
- [ ] Reconnect the folder or import `settings.json` and confirm setup can be restored without committing personal data to GitHub.

## 8. Phone Drive safety

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
