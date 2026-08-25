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
