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
