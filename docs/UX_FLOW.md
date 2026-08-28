# StoryFlow UX flows

StoryFlow is a personal desktop writing tool. Flows should stay short, preserve the current work until an action is confirmed, and avoid account-style ceremony that does not protect the user's files.

## Page-level use cases and action priority

Button weight follows the user's current task, not how often a control happens to appear. A solid button marks the single recommended next step inside one card, dialog or decision stage. Repeated row actions, disclosures, previews and optional shortcuts remain tinted or outlined even when they are frequently used.

### Works library

The Works page is the structural management hub. Managing chapters is the most likely next step for any work. The “目前作品” badge and active-card treatment already communicate selection, so identical management actions must not change color merely because one card is current.

| ID | User goal | Main action | Supporting actions | Visual priority |
| --- | --- | --- | --- | --- |
| W-01 | Review, add, edit or remove chapters in a work | 管理章節 | `⋯` for infrequent or destructive chapter actions | Consistent emphasized light-blue action on every card; expanded state uses a stronger soft selection |
| W-02 | Return to splitting and writing work | 工作台 | — | Tinted or outlined navigation action |
| W-03 | Jump directly to this work's publishing queue | 管理發布 | — | Tinted secondary shortcut |
| W-04 | Make another work current | 開啟／切換並開啟 | Then manage its chapters or enter its workspace | Outlined until selected; selection is shown by the card and badge |
| W-05 | Create another work | ＋ 新作品 | Source chooser and creation preview | Outlined or tinted while works already exist |
| W-06 | Create the first work | 建立第一個作品 | — | The only solid action in the empty state; do not show a competing solid header action |
| W-07 | Rename or delete a work | `⋯` | Confirmation and Recovery for deletion | Tertiary overflow; deletion uses the danger treatment only inside the decision |

Every “管理章節” control uses the same noticeable light-blue treatment so the same label always communicates the same function. Current-work identity belongs to the card border and badge; no repeated row action uses a solid primary fill.

### Workspace

The Workspace is a staged flow rather than a page with one permanently primary button. Its recommended action changes with the manuscript state.

| ID | User goal | Main action | Supporting actions | Visual priority |
| --- | --- | --- | --- | --- |
| WS-01 | Start an empty work or chapter | 從 Google Docs 建立／手動建立／新增第一篇文章 | 切換作品 | Emphasize the source-choice stage; keep the alternative source cards equal until one is chosen |
| WS-02 | Select the work and chapter to process | 切換作品／章節列 | Add, edit or delete a chapter | Selection and disclosure styling, never primary CTA styling |
| WS-03 | Refresh a linked Google Docs chapter | 更新來源 | 復原來源更新 | Tinted action that opens comparison; only “套用所選變更” is solid after review |
| WS-04 | Adjust an automatic split suggestion | 少一個場景／多一個場景 | 切篇偏好 | Outlined directional and disclosure controls |
| WS-05 | Move the ending within a long scene | 手動微調 | Drag or choose a paragraph boundary | Selected/toggled treatment; boundary targets are not buttons competing for primary emphasis |
| WS-06 | Commit the reviewed article | 切篇確認／確認並存成 Markdown | 返回修改、取消 | The single solid action for the review stage |
| WS-07 | Continue processing the remaining chapter | 產生下一篇 | Review the current ending again | Solid only when a valid next suggestion is ready |
| WS-08 | Move from confirmed articles to publication | 前往發布 | Publishing summary | Solid only when a confirmed pending article exists; hide or demote it when there is nothing to publish |
| WS-09 | Maintain a manual chapter | 編輯章節 | 刪除章節 | Editing is a normal menu action; deletion stays in overflow and requires confirmation |

At any moment, the workspace should visually answer one question: “What can I safely do next?” It must not simultaneously emphasize source loading, split confirmation and publishing navigation.

### Publishing

The Publishing page separates queue navigation from the actual publishing commit. A global “繼續發布” may point to the most relevant unfinished article; repeated article rows remain scannable and do not each introduce a solid button.

| ID | User goal | Main action | Supporting actions | Visual priority |
| --- | --- | --- | --- | --- |
| P-01 | Resume the latest unfinished publication | 繼續發布 | Filters and project selector | One solid page action, visible only when pending or partial work exists |
| P-02 | Choose a specific article to process | 管理發布 | 預覽預設設定、`⋯` | Tinted row action; preview is outlined and overflow is tertiary |
| P-03 | Verify platform formatting | 預覽／複製 | Copy title, include/exclude afterword | Outlined until the preview dialog opens |
| P-04 | Copy content to a platform | 複製內容 | Optionally prepend title as heading or bold, 複製標題、關閉 | The single solid action in the preview dialog |
| P-05 | Store publication time and URL | 保存發布紀錄 | 取消、開啟文章 | The single solid action in the record dialog |
| P-06 | Edit afterword or image metadata | 文章圖片／後記, then save the active editor | Preview and ordering controls | Compact entry row; one local solid save action only inside the active dialog |
| P-07 | Give one platform a different publishing title | 修改此平台標題, then 保存標題 | 改回沿用 | Kept inside that platform's preview/copy dialog; never a large article-level form |
| P-08 | Mark or undo platform publication | 標註已發布／取消已發布 | Publication record | State control, not a global primary action; reversal requires a clear warning |
| P-09 | Find articles by work or status | 作品／發布狀態 filters | — | Soft selected state, never solid CTA styling |
| P-10 | Perform infrequent article management | `⋯` | Delete with Recovery | Tertiary overflow and explicit danger confirmation |
| P-11 | Recover from an empty publishing queue | 回到工作台開始切篇 | — | The only solid empty-state action |

An expanded “收合發布” control is still a disclosure. Use a stronger soft selection, border or adjacent panel treatment instead of the full primary fill; the solid emphasis belongs to “複製內容” or “保存發布紀錄” inside the active task.

### Settings

The Settings page is a collection of independent decision cards. It may contain one primary action per card or setup stage, but should not make every configurable feature look simultaneously urgent. A save action becomes prominent only when its fields are editable or dirty.

| ID | User goal | Main action | Supporting actions | Visual priority |
| --- | --- | --- | --- | --- |
| S-01 | Load private Google configuration on a new device | 匯入 settings.json | Manual Client ID and API Key entry | Solid only when import is the recommended missing setup step; otherwise outlined |
| S-02 | Save changed Google integration values | 保存 Google 整合設定 | 取消更新、重新匯入 | Solid only while valid unsaved changes exist; disabled or quiet when unchanged |
| S-03 | Authenticate after configuration is ready | 登入 Google | 更新設定、重新匯入 | The single solid action for this setup stage |
| S-04 | Choose or reconnect the StoryFlow folder | 連接資料夾／重新連接 | 重新檢查 | Solid only while the folder is required and disconnected; connected state becomes status, not a button CTA |
| S-05 | Add or maintain publishing platforms | 新增平台 | Rename, reorder or remove platform | Tinted or outlined list-management action; removal uses danger treatment after confirmation |
| S-06 | Change platform formatting | 保存 changed setting through normal workspace persistence | Preview or reset individual values | Controls and status, not a permanent solid CTA; surface unsaved/error state instead |
| S-07 | Inspect or create a manual backup | 建立目前備份 | 重新檢查、下載、匯入、恢復 | Normally tinted or outlined; an explicit import/restore confirmation becomes solid inside its decision panel |
| S-08 | Temporarily unlock phone editing | 開啟本次編輯 | Return to read-only | State switch with warning, not a blue primary CTA; saving or conflict resolution owns any primary action |
| S-09 | Clear browser-held private state | 離開此裝置 | — | Danger outline/text followed by confirmation; never blue primary |

Settings cards may each have a task action, but visual emphasis should follow state: missing setup, dirty values or an active confirmation. Completed configuration is displayed as readable status with quiet maintenance controls.

### Global navigation and search

Global controls help the user move or locate content; they do not compete with the active page's task action.

| ID | User goal | Main action | Supporting actions | Visual priority |
| --- | --- | --- | --- | --- |
| G-01 | Move between Workspace, Works, Publishing and Settings | Sidebar or mobile navigation item | Collapse sidebar | Active-location treatment in navigation chrome, not page-primary styling |
| G-02 | Find a work, chapter or publishing article | 搜尋／keyboard shortcut | Optional body search | Search trigger stays neutral; the selected result uses a soft active state |
| G-03 | Open the selected search result | Enter／click result | Arrow-key navigation, Escape or `×` | The active row is emphasized; no persistent solid confirmation button is needed |
| G-04 | Check Google and folder readiness | Connection status chips | Open the relevant connection action | Status-first treatment; disconnected chips may invite action without becoming the page's dominant CTA |
| G-05 | Collapse or expand desktop navigation | Sidebar toggle | — | Tertiary icon control with clear focus state |

The active sidebar item may use a dark selected background because it communicates location inside persistent navigation. That treatment is separate from a solid page CTA and does not imply that clicking it is the recommended next task.

### First use, reconnect and recovery

Connection and recovery surfaces are global states that may interrupt any page. They use progressive disclosure so only the action that resolves the current blocker is primary.

| ID | User goal | Main action | Supporting actions | Visual priority |
| --- | --- | --- | --- | --- |
| O-01 | Configure StoryFlow for the first time | 匯入 settings.json or save manually entered integration values | Explanatory setup copy | One solid action matching the currently chosen setup route |
| O-02 | Restore a remembered folder permission | 快速重新連接 | Choose another folder | One solid recovery action; alternatives outlined |
| O-03 | Open existing work without Google Docs access | 連接 StoryFlow 資料夾 | Import settings later | Folder access may be primary because manuscript data is local; Google remains a separate optional prerequisite for source refresh |
| O-04 | Resolve a newer file on disk | 載入較新版本 | 保留目前版本並覆蓋、稍後處理 | The safest recommended resolution is solid; overwrite is secondary and requires explicit confirmation |
| O-05 | Recover an unreadable workspace | 從備份恢復 | 匯入工作區檔案、稍後處理 | One recoverable path is solid; file import becomes solid only after a candidate passes validation |
| O-06 | Use StoryFlow on a phone | Read and preview in “唯讀” mode | Reconnect folder, open Settings | “唯讀” is a status label, not a button; editing remains an explicit Settings decision |

Recovery is the exception where a solid button may appear outside the normal page task. It should still present only one recommended safe action at a time; potentially destructive overwrite paths stay visually secondary until their confirmation step.

## Create a work

Creating a work is a transaction, not a navigation side effect.

```text
新增作品 → 選擇「長文作品／圖文系列」
          ├─ 長文 → 選來源 → 填寫或選取內容 → 預覽（可選） → 確認 → 建立並切換作品
          └─ 圖文 → 系列名稱 → 建立空系列／同時新增第一則 → 確認 → 圖文工作台
任何階段取消 → 回到原作品，不寫入
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
- Manual mode gives the chapter text most of the width, hides the previous-part column and renders one compact full-width line after every eligible paragraph. Quiet candidate labels appear only on hover or keyboard focus; the current “本篇結尾” line stays visible and draggable.
- The review toolbar shows both current-part and remaining-unconfirmed character counts while manual mode is active. The current title, start boundary and source text remain unchanged when the end moves.
- Leaving manual mode rerenders the normal chapter view and keeps the confirmed “這一篇結束” marker in view, so the author can verify the surrounding prose without searching for the cut again.
- Scene-level controls remain available outside manual mode. Closing the confirmation dialog exits manual mode, and confirmed or published parts are never retroactively re-split by this interaction.
- A single source paragraph cannot be cut internally. The author must first add a real paragraph break to the source if sentence-level splitting is required.
- Platform paragraph spacing and scene separation are independent. Compact paragraph output uses one newline between ordinary paragraphs, but every original scene boundary keeps either the configured marker or, when the marker is hidden, one blank line.

## Navigating a long chapter list

- The chapter list is an independently scrollable source rail on desktop. Selecting a lower chapter rerenders the active state without returning the rail or page to the top.
- A row's `⋯` menu opens toward the available space. Near the bottom it opens upward; opening or closing it never expands the source card or moves SMART SPLIT.
- “編輯章節” opens the selected manual article in the same large editor used by “手動新增文章”. The article field fills the remaining height and the actions stay attached to the bottom; cancel or close returns to the same work without changing the chapter.

## Destructive actions

Deletion, replacement and source refresh follow the safety rules in [ARCHITECTURE.md](ARCHITECTURE.md). “離開此裝置” clears browser-held connection and settings state but does not delete files in the selected folder.

## Article afterwords

```text
發布 → 管理發布 → 後記 → 編輯／保存 → 關閉燈箱 → 預覽／複製
                                                   ↘ 可排除後記，只輸出正文
```

- One publishing article owns one shared afterword; platform-specific variants are intentionally out of scope.
- The expanded article shows only a compact body/image/afterword summary. “後記” opens a focused dialog, so platform rows remain visible without scrolling past a large textarea.
- Saving updates `workspace.json` and, when the StoryFlow folder is connected, rewrites that article Markdown with `正文 → 分隔線 → 後記`.
- Source refresh may update a chapter draft but must not change an existing publishing part or its afterword.
- Preview and copy use the article-level `includeAfterword` choice consistently across platforms.
- Deleting an article or rewinding later split points warns how many affected articles contain afterwords before Recovery and deletion begin.

## Publishing titles

```text
發布 → 管理發布 → 平台「預覽／複製」→ 修改此平台標題 → 保存
                                         ↘ 改回沿用文章名稱
                         複製內容 → 可選「標題放最前面」→ 大標題／粗體
```

- The internal article name remains the stable source and Markdown filename; editing the publishing title never renames either one.
- A platform-specific title is edited only inside that platform's preview/copy dialog. Empty values fall back to the internal article name; legacy shared titles remain a compatibility fallback.
- The article and platform rows expose a compact summary instead of a permanent title form. A custom platform title is shown quietly beneath its platform name.
- “複製標題” remains separate. “複製內容” can optionally prepend the current platform title as a heading or bold text; rich clipboards receive HTML and plain-text destinations receive equivalent Markdown.
- Source refresh keeps existing platform titles unchanged. Renaming or removing a platform migrates or removes its title together with status and publication records.

## Article images

```text
發布 → 管理發布 → 文章圖片 → 匯入圖片 → 系統檔案選擇器 → 複製到私人 assets 資料夾
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
搜尋／⌘ K（Windows/Linux：Ctrl K）→ 輸入名稱 → 選擇結果 → 切換作品並開啟章節／發布文章
            ↘ 勾選「同時搜尋正文」→ 顯示片段 → 開啟內容位置或預覽
```

- Name search covers loaded works, chapters, internal article names and publishing titles.
- Body search is opt-in because it is broader and may return both the source chapter and its publishing article.
- Results are generated in memory from the current workspace and are discarded when the dialog closes; no persistent or remote index is created.
- `↑` / `↓`, Enter and Escape support a keyboard-first desktop flow. The sidebar detects the operating system before showing its shortcut and hides shortcut hints on touch layouts. The visible close button is `×`; opening a result closes search before navigating, and an already-open decision dialog prevents search from appearing on top of it.

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
