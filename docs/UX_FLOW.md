# StoryFlow UX flows

StoryFlow is a personal desktop writing tool. Flows should stay short, preserve the current work until an action is confirmed, and avoid account-style ceremony that does not protect the user's files.

## Create a work

Creating a work is a transaction, not a navigation side effect.

```text
新增作品 → 選來源 → 填寫或選取內容 → 預覽（可選） → 確認 → 建立並切換作品
                                         ↘ 取消 → 回到原作品，不寫入
```

Rules:

- Opening the source chooser or manual editor must not add a project to `workspace.json` or the in-memory project list.
- Manual creation collects the work title and first article in the same dialog.
- Google creation may use the selected document title, but still commits only after the import preview is confirmed.
- Closing with the close button or Escape cancels the pending transaction and keeps the original active work.
- Moving between chooser, editor and preview is a handoff within one transaction; it must not cancel or commit the work.
- A successful confirmation creates exactly one work, switches to it and imports the confirmed content.
- Existing-work “新增文章” remains an article action and must not start a new-work transaction.

`StoryFlowStartNewWork()` starts the transaction. `StoryFlowNewWorkFlow.commit()` and `.cancel()` are its only terminal paths. Source modules collect and validate input, then call one of those paths instead of creating projects themselves.

## Switching works

- “切換作品” is available from the workspace header.
- The current work is visibly selected in the menu.
- “新增作品” is the final menu action and opens the transactional flow above.
- Canceling creation returns to the same active work and chapter without adding an empty “未命名作品”.

## Split confirmation and manual boundaries

```text
SMART SPLIT 場景建議 → 少／多一個場景 → 切篇確認 → 確認並存檔
                                           ↘ 手動微調 → 拖曳結尾
                                                        ↘ 點選段落間切點
```

- Automatic suggestions and the coarse arrow actions use real source-scene boundaries. Preferred character counts rank valid scene endings but do not manufacture a cut inside a scene.
- “手動微調” is deliberately paragraph-level. It changes only the current unconfirmed suggestion end, snaps after a complete source paragraph and never edits the source draft.
- Manual mode renders one lightweight target after every eligible paragraph. The current “這一篇結束” target is draggable; every target is also clickable for reliable positioning in long scrollable text.
- The review toolbar shows both current-part and remaining-unconfirmed character counts while manual mode is active. The current title, start boundary and source text remain unchanged when the end moves.
- Scene-level controls remain available outside manual mode. Closing the confirmation dialog exits manual mode, and confirmed or published parts are never retroactively re-split by this interaction.
- A single source paragraph cannot be cut internally. The author must first add a real paragraph break to the source if sentence-level splitting is required.
- Platform paragraph spacing and scene separation are independent. Compact paragraph output uses one newline between ordinary paragraphs, but every original scene boundary keeps either the configured marker or, when the marker is hidden, one blank line.

## Navigating a long chapter list

- The chapter list is an independently scrollable source rail on desktop. Selecting a lower chapter rerenders the active state without returning the rail or page to the top.
- A row's `⋯` menu opens toward the available space. Near the bottom it opens upward; opening or closing it never expands the source card or moves SMART SPLIT.
- “編輯章節” opens the selected manual article in a compact dialog. Cancel or close returns to the same work without changing the chapter.

## Destructive actions

Deletion, replacement and source refresh follow the safety rules in [ARCHITECTURE.md](ARCHITECTURE.md). “離開此裝置” clears browser-held connection and settings state but does not delete files in the selected folder.

## Article afterwords

```text
發布 → 管理發布 → 編輯後記 → 保存 → 預覽／複製
                                  ↘ 可排除後記，只輸出正文
```

- One publishing article owns one shared afterword; platform-specific variants are intentionally out of scope.
- The expanded article is the editing context. Body and afterword counts remain separate.
- Saving updates `workspace.json` and, when the StoryFlow folder is connected, rewrites that article Markdown with `正文 → 分隔線 → 後記`.
- Source refresh may update a chapter draft but must not change an existing publishing part or its afterword.
- Preview and copy use the article-level `includeAfterword` choice consistently across platforms.
- Deleting an article or rewinding later split points warns how many affected articles contain afterwords before Recovery and deletion begin.

## Publishing titles

```text
發布 → 展開文章 → 輸入發布標題 → 保存 → 預覽
                         ↘ 留白 → 沿用內部文章名稱
```

- The internal article name remains the stable source and Markdown filename; editing the publishing title never renames either one.
- The article list leads with the publishing title and shows the internal name as a quiet secondary line only when they differ.
- Preview and copy present the publishing title separately from body/afterword content so each can be pasted into the matching platform field.
- Source refresh keeps an existing publishing title unchanged.

## Article images

```text
發布 → 展開文章 → 匯入圖片 → 系統檔案選擇器 → 複製到私人 assets 資料夾
                         ↓
        替代文字／圖說／位置／排序 → 保存 → 發布預覽
                                              ↘ 平台逐張上傳
移除 → 只從文章移除 → 檔案保留
    ↘ 備份後刪除檔案 → Recovery/Assets → 刪除來源副本
```

- Use “匯入圖片”, not “上傳圖片”: the browser copies a user-selected local/provider file into the connected StoryFlow folder and sends nothing to StoryFlow hosting.
- Supported formats are JPEG, PNG, WebP and GIF. SVG is intentionally excluded because it may contain active content; files above 8 MB remain allowed but visibly warn.
- Every image belongs to one publishing part and uses its stable ID directory. Name collisions create a numbered filename instead of overwriting.
- The manager exposes alternative text, optional caption, three placement groups and explicit ordering. Preview loads private object URLs only for the current page and supports a modal enlargement.
- Markdown output includes relative image references. Platform content copy remains text-only and preview explicitly reminds the user to upload binaries separately.
- Missing files stay visible as actionable warnings instead of silently disappearing.
- Phone read-only mode may read and preview existing assets but blocks import, metadata edits, reordering and removal until the current session is unlocked.
- Deleting a publishing article removes image records but intentionally retains binary assets. Individual file deletion is explicit and creates a Recovery copy first.

## Global search and quick jump

```text
搜尋／⌘K → 輸入名稱 → 選擇結果 → 切換作品並開啟章節／發布文章
            ↘ 勾選「同時搜尋正文」→ 顯示片段 → 開啟內容位置或預覽
```

- Name search covers loaded works, chapters, internal article names and publishing titles.
- Body search is opt-in because it is broader and may return both the source chapter and its publishing article.
- Results are generated in memory from the current workspace and are discarded when the dialog closes; no persistent or remote index is created.
- `↑` / `↓`, Enter and Escape support a keyboard-first desktop flow. Opening a result closes search before navigating, and an already-open decision dialog prevents search from appearing on top of it.

## Platform publication records

```text
發布 → 管理發布 → 平台「記錄發布」→ 確認時間、選填文章網址 → 保存並標為已發布
                         ↘ 取消 → 不改變原狀態
已發布 → 取消已發布 → 確認 → 清除該平台的時間與網址
```

- One publishing article may keep one lightweight record per configured platform; scheduling, platform APIs and revision history are intentionally out of scope.
- The default time is the moment the record dialog opens, but the user can correct it before saving.
- A URL without a scheme is normalized to `https://`; only `http` and `https` URLs may become an “開啟文章” link.
- Preview/copy may mark a platform as published and records the current time when no time exists yet.
- Existing published articles from older workspaces remain published and show “未記錄發布時間” until the user saves a record.
- Renaming or removing a platform carries or removes its publication record together with its status.

## Phone editing

```text
手機開啟 → 主畫面顯示「唯讀」→ 閱讀／重新連接資料夾
       → 設定 → 手機使用模式 → 使用者確認 Drive 已完成傳輸 → 開啟本次編輯
       → 重新載入 workspace.json → 成功且無 Recovery 衝突 → 解鎖
                                ↘ 失敗／衝突 → 保持唯讀
       → 結束本次手機編輯 → 保存成功 → 唯讀
```

- Phone detection must not change desktop Chrome behavior.
- Read-only mode permits reconnecting the folder and importing `settings.json`; these actions load data but do not edit manuscript files.
- The main surface shows only the compact state label; explanation and the editing switch live in Settings.
- The enable action explicitly warns that unsaved screen state is discarded and that StoryFlow cannot determine Google Drive transfer completion.
- Switching back to read-only must first flush the current workspace; a failed save leaves editing enabled.
- Closing the tab ends the editing grant. A later phone session starts read-only again.
