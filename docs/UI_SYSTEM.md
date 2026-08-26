# StoryFlow UI system

This is the small shared UI contract for StoryFlow's desktop-first interface. Prefer these patterns over page-specific variants.

## Disclosure controls

Use disclosure only when the same control opens and closes adjacent content or a menu.

```html
<button type="button" aria-expanded="false">
  <span>切篇偏好</span>
  <span class="sf-chevron" aria-hidden="true"></span>
</button>
```

Rules:

- Use the CSS-drawn `.sf-chevron`; do not insert `⌄`, `⌃`, `▾`, `▴` or unrelated SVG arrows.
- The chevron points down when closed and rotates up through the parent button's `aria-expanded="true"` state.
- The chevron is decorative (`aria-hidden="true"`). The button label and `aria-expanded` communicate meaning to assistive technology.
- Menus use `aria-haspopup`; inline sections use only `aria-expanded` unless another ARIA relationship is required.
- Keep chevron size, stroke and motion shared. Page CSS may change only color or spacing.
- “更多” actions use the ellipsis pattern and do not use a chevron. Navigation arrows and directional actions are not disclosures.

Current shared disclosures include workspace work switching, Smart Split preferences, publishing project switching and publishing project filtering.

## Action hierarchy

- Primary: the single action that advances or confirms the current task.
- Ghost/secondary: preview, return, cancel or supporting actions.
- Overflow (`⋯`): infrequent row management and destructive actions.
- Close (`×`): dismisses a dialog; in pending creation it also cancels the transaction.

Do not place a destructive action beside the primary action when an overflow menu can keep the decision hierarchy clearer.

Publishing rows keep article-level editing inside the expanded “管理發布” region. The publishing-title editor appears first, followed by private article images, the afterword editor and platform status because these article-level values affect every platform. The list uses the reader-facing publishing title as the primary label and adds the internal name only when different. Compact “附圖 N 張” and “有後記 N 字” badges expose state without expanding the row, while the preview dialog owns the final include/exclude choice. Preview keeps “複製標題” and “複製內容” separate.

Image rows use thumbnail → filename/facts → metadata fields → actions. Alternative text, caption and placement remain visible together; ordering actions stay secondary, “保存圖片資訊” is primary, and removal stays visually quiet until its decision dialog. The dialog makes “只從文章移除” and “備份後刪除檔案” unambiguous. A missing image keeps its row and shows a dashed warning state. Full-size preview uses a modal lightbox rather than opening or exposing a persistent local URL.

Each platform row uses two information lines: platform/status first, publication date and URL presence second. Keep the three actions ordered as “預覽／複製”, “記錄發布／發布紀錄”, then the status toggle. The record dialog is the only editor for date and URL; the row remains a readable summary rather than an inline form. On narrow screens the three actions share one row when space permits and wrap without horizontal overflow.

## Dialog behavior

- One dialog represents one decision step.
- Focus starts at the first missing required field.
- Source chooser → editor → preview are handoffs, so only one dialog is open at a time.
- Closing a creation dialog preserves the existing work and creates nothing.
- Validation happens in place before the dialog advances.

## Command search

- The sidebar search action uses a magnifier and displays `⌘K` as a shortcut hint on desktop; it is a command, not a destination with persistent selected navigation state.
- The command dialog keeps one search field, one optional body-search checkbox and one scrollable result list. Result type, primary title and location form a consistent three-level hierarchy.
- Keyboard focus begins in the search field. Arrow keys move the active result, Enter opens it and Escape closes the dialog.
- Do not open command search over another visible modal decision. The search footer states that only currently loaded private data is searched.

## Responsive scope

Desktop Chrome is the primary work environment. Controls still need to wrap safely at narrow widths, but mobile should preserve essential reading and recovery rather than duplicate every dense desktop composition.

On phones, the main surface shows only a compact amber “唯讀” state label (or blue “可編輯” while the current session is unlocked). The bottom navigation keeps workspace, works, publishing, settings and search in one five-column row; shortcut text is hidden, but search remains available for reading. Explanation and the two-way editing switch live in the full Settings page under “手機使用模式”; the control becomes full-width at narrow widths. Mutating controls look unavailable while read-only; folder reconnect, settings import, navigation, filters and preview remain usable. Hide the normal workspace save copy while read-only so it cannot imply a completed save or cloud sync.
