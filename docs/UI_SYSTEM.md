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

“管理章節” and “管理發布” are frequent sibling disclosure/navigation actions in a work card. They use the same discoverable light-blue fill, blue border, 40 px height and matching typography. The solid denim fill is reserved for the current “工作台” destination and an actively expanded management region; inactive “開啟” remains outlined. This keeps management easier to find than a white ghost button without presenting three simultaneous primary actions.

Split confirmation has two precision levels. “少一個場景／多一個場景” are coarse directional actions and keep their arrows; “手動微調” is a pressed-state mode button, not a disclosure. In manual mode, the full-chapter column is the primary surface: the previous-part column and coarse scene buttons are hidden, the current ending is a compact solid draggable blue line, and alternative paragraph endings are quiet dashed full-width targets whose labels appear only on hover or focus. Every target must still work by click and keyboard. The toolbar reports “本篇／後續” character counts. Manual targets appear only for the current unconfirmed range and never imply that source prose is editable. Returning to normal review must scroll the chapter view to the selected end marker instead of retaining a now-invalid manual-mode scroll offset.

Character counts in review headers are supporting metadata, not headings: keep them smaller and quieter than the article title and action label. In the works library, “工作台”, “開啟”, “管理發布” and “管理章節” share one control height, font size and weight. The current Workbench destination uses the darkest fill; the two frequent management destinations use a light-blue tinted fill; inactive “開啟” remains white and outlined. This separates current location from frequent navigation without making the management actions disappear into card chrome.

The publishing list uses the same light-blue management identity and 40 px / 14 px geometry for “管理發布”. “預覽預設設定” remains white and outlined, while “⋯” remains tertiary, so the three actions read as preview → manage → more instead of three equal choices. An expanded “收合發布” state becomes solid denim. Identical actions should not change weight or size merely because the user reached them from another page.

Top-level and empty-state CTAs that lead to the same task use the same 40 px / 14 px control scale. This includes “＋ 新作品” and “建立第一個作品”, the publishing empty-state return action, and the workspace publishing CTA. Settings form actions use that same scale within each decision group; compact 34 px controls are reserved for filters, segmented controls and dense row utilities. Navigation icons use one 21 px stroke-SVG family so Chrome renders them consistently across macOS and Windows.

Publishing rows keep article-level editing inside the expanded “管理發布” region. The publishing-title editor appears first, followed by private article images, the afterword editor and platform status because these article-level values affect every platform. The list uses the reader-facing publishing title as the primary label and adds the internal name only when different. Compact “附圖 N 張” and “有後記 N 字” badges expose state without expanding the row, while the preview dialog owns the final include/exclude choice. Preview keeps “複製標題” and “複製內容” separate.

Image rows use thumbnail → filename/facts → metadata fields → actions. Alternative text, caption and placement remain visible together; ordering actions stay secondary, “保存圖片資訊” is primary, and removal stays visually quiet until its decision dialog. The dialog makes “只從文章移除” and “備份後刪除檔案” unambiguous. A missing image keeps its row and shows a dashed warning state. Full-size preview uses a modal lightbox rather than opening or exposing a persistent local URL.

Each platform row uses two information lines: platform/status first, publication date and URL presence second. Keep the three actions ordered as “預覽／複製”, “記錄發布／發布紀錄”, then the status toggle. The record dialog is the only editor for date and URL; the row remains a readable summary rather than an inline form. On narrow screens the three actions share one row when space permits and wrap without horizontal overflow.

## Dialog behavior

- One dialog represents one decision step.
- Focus starts at the first missing required field.
- Source chooser → editor → preview are handoffs, so only one dialog is open at a time.
- Closing a creation dialog preserves the existing work and creates nothing.
- Validation happens in place before the dialog advances.
- Manual article creation and chapter editing use the same large dialog dimensions. The textarea flexes to consume the available writing area and owns its scrolling; the action footer closes the card at the bottom. Reducing blank space must never be implemented by shrinking edit mode or leaving an empty region below its footer.

## Long lists and contextual menus

- The desktop chapter rail owns its vertical scrolling. Selecting a chapter preserves that rail position even when the list rerenders.
- Opening a chapter overflow menu must not change the source panel from contained scrolling to page-height content. Near the panel bottom, the menu opens upward and remains inside the visible viewport.
- Main workspace content must keep its grid position while the source rail scrolls or a row menu opens.

## Command search

- The sidebar search action uses a magnifier and displays the detected desktop shortcut: `⌘ K` on Apple platforms and `Ctrl K` on Windows/Linux. Touch/coarse-pointer layouts hide the keyboard hint; search remains a command, not a destination with persistent selected navigation state.
- The command dialog keeps one search field, one optional body-search checkbox and one scrollable result list. Result type, primary title and location form a consistent three-level hierarchy.
- Keyboard focus begins in the search field. Arrow keys move the active result, Enter opens it and Escape closes the dialog. The visible close control is always `×`; `Esc` remains a keyboard affordance in the desktop footer, not the close-button label.
- Do not open command search over another visible modal decision. The search footer states that only currently loaded private data is searched.

## Responsive scope

Desktop Chrome is the primary work environment. Controls still need to wrap safely at narrow widths, but mobile should preserve essential reading and recovery rather than duplicate every dense desktop composition.

On phones, the main surface shows only a compact amber “唯讀” state label (or blue “可編輯” while the current session is unlocked). The bottom navigation keeps workspace, works, publishing, settings and search in one five-column row; shortcut text is hidden, but search remains available for reading. Explanation and the two-way editing switch live in the full Settings page under “手機使用模式”; the control becomes full-width at narrow widths. Mutating controls look unavailable while read-only; folder reconnect, settings import, navigation, filters and preview remain usable. Hide the normal workspace save copy while read-only so it cannot imply a completed save or cloud sync.
