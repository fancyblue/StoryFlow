# StoryFlow UI system

> 狀態：現行 UI 規範（已落地，持續維護；最後同步：2026-08-29）

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

Page-level task order and the resulting primary action are defined in [UX_FLOW.md](UX_FLOW.md). Frequency alone does not justify a solid fill, and a page may change its primary action as the current workflow stage changes.

Do not place a destructive action beside the primary action when an overflow menu can keep the decision hierarchy clearer.

Longform chapters/articles and visual entries share this rule. Their list-level create action sits below the list, and every editable row keeps a persistent trailing `⋯`. Manual-article and visual-entry menus use the same order: edit first, delete second. A visual entry is deleted as `⋯ → 刪除圖文`; do not add a second destructive button to the editor footer or make Workspace, Works and Publishing use different delete entry points. All entry deletion paths must reach the same confirmation and Recovery guard.

On the Works page, “管理章節／管理圖文” is the most likely next step and uses the same emphasized light-blue treatment on every work card. Both content types use “工作台” for the active work and “開啟” for inactive works; never substitute type-specific open labels such as “管理圖文”. “管理發布” is a quieter tinted shortcut. The “目前作品” badge and card treatment alone communicate which work is active; action color must not duplicate selection or make identical labels look like different functions. Expanded management uses a stronger soft selection with an inset accent, never a solid primary fill.

Split confirmation has two precision levels. “少一個場景／多一個場景” are coarse directional actions and keep their arrows; “手動微調” is a pressed-state mode button, not a disclosure. In manual mode, the full-chapter column is the primary surface: the previous-part column and coarse scene buttons are hidden, the current ending is a compact solid draggable blue line, and alternative paragraph endings are quiet dashed full-width targets whose labels appear only on hover or focus. Every target must still work by click and keyboard. The toolbar reports “本篇／後續” character counts. Manual targets appear only for the current unconfirmed range and never imply that source prose is editable. Returning to normal review must scroll the chapter view to the selected end marker instead of retaining a now-invalid manual-mode scroll offset.

Character counts in review headers are supporting metadata, not headings: keep them smaller and quieter than the article title and action label. In the works library, “工作台”, “開啟”, “管理發布” and “管理章節” share one control height, font size and weight. All “管理章節” buttons use one emphasized light-blue treatment; Workbench stays outlined and publishing uses a paler tinted treatment.

The publishing list uses one action vocabulary for both content types: “預覽／複製”, “管理發布”, then the persistent trailing `⋯`. “管理發布” uses the light-blue management identity and 40 px / 14 px geometry; “預覽／複製” remains white and outlined, while `⋯` remains tertiary. An expanded “收合發布” state uses a stronger soft selection or border rather than the primary fill; solid emphasis belongs to copy or save actions inside the active task.

Top-level and empty-state actions use the same 40 px / 14 px control geometry without automatically sharing the same visual weight. “建立第一個作品” is the solid empty-state action, while “＋ 新作品” becomes tinted or outlined once works exist. The publishing empty-state return action may be solid; the workspace publishing CTA is solid only when confirmed pending content makes publishing the valid next step. Settings form actions use the same scale within each decision group; compact 34 px controls are reserved for filters, segmented controls and dense row utilities. Navigation icons use one 21 px stroke-SVG family so Chrome renders them consistently across macOS and Windows.

Publishing rows prioritize platform work. Expanding “管理發布” shows one compact article-supplement row followed immediately by platform rows; images and the afterword open in focused dialogs instead of permanently occupying the expanded area. Compact “附圖 N 張” and “有後記 N 字” badges expose state without opening those tools. Publishing titles are platform-specific and live in that platform’s preview-and-copy dialog because title variations are part of platform output, not general article maintenance. The preview combines title controls and content-composition options in one always-visible compact settings card; the main body/image preview remains dominant and the footer ends with the primary “複製內容” action.

Image rows use thumbnail → filename/facts → metadata fields → actions. Alternative text, caption and placement remain visible together; ordering actions stay secondary, “保存圖片資訊” is primary, and removal stays visually quiet until its decision dialog. The dialog makes “只從文章移除” and “備份後刪除檔案” unambiguous. A missing image keeps its row and shows a dashed warning state. Full-size preview uses a modal lightbox rather than opening or exposing a persistent local URL.

Each platform row uses two information lines: platform/status first, publication date and URL presence second. For visual entries, a small summary indicator reveals the optional summary below the icon on hover or keyboard focus without being clipped by the row, and the effective Hashtags string appears after each platform name as a compact click-to-copy control. Keep row actions focused on publishing: “預覽與複製”, “記錄發布／發布紀錄”, then the status toggle. Platform-specific Hashtags are edited only inside the preview’s bottom optional-information section, where one collapsed editor inherits the common value until explicitly overridden and “沿用共用” removes the override. The record dialog is the only editor for date and URL; the row remains a readable summary rather than an inline form. On narrow screens the actions wrap without horizontal overflow. Publishing filters expose content type (“全部類型／長文／圖文”) separately from status, and every work-group heading repeats its “長文／圖文” badge. Type counts are work counts after the current work selection; status counts remain entry counts. The work, type and status filter controls share the same font size, weight, line height and control height.

## Dialog behavior

- One dialog represents one decision step.
- Every dialog exposes its visible heading as the dialog's accessible name. Dynamic dialogs use the shared UI semantics helper instead of relying on the heading's visual proximity alone; compact surfaces without headings use explicit names (`搜尋 StoryFlow` and `圖片預覽`).
- Visual workbench preview is opened by an explicit “預覽圖文” button instead of occupying the editor canvas. Preview and save actions require clear spacing. The preview body scrolls as one surface; its content card must expand to contain every visual-upload row before optional summary and Hashtags sections begin. The preview dialog separates its reading surface from the closing action with a footer divider. Publishing preview uses the same compact structure for longform and visual content: one title-and-composition settings card, then the main body/image sequence, then optional visual metadata. Neither content type shows a “預覽／原始 MD” switch or repeats platform metadata above the settings card. Optional summary and Hashtags sit below as contained click-to-copy rows with compact trailing “編輯” controls. Both editors use progressive disclosure inside that final section: show the effective value first and reveal one field only after “編輯”. Summary saves the shared optional value; platform Hashtags keep “儲存” plus “沿用共用” adjacent to the field. The edit control must remain inside its row at every supported width.
- A visible `×` close control always has the accessible name `關閉`; task-specific cancel or defer actions keep their own explicit labels.
- Settings is a full application view and is exposed as the named `設定` region, never as a modal dialog after its legacy form is moved into the page.
- Focus starts at the first missing required field.
- Source chooser → editor → preview are handoffs, so only one dialog is open at a time.
- Closing a creation dialog preserves the existing work and creates nothing.
- Validation happens in place before the dialog advances.
- Manual article creation and chapter editing use the same large dialog dimensions. The textarea flexes to consume the available writing area and owns its scrolling; the action footer closes the card at the bottom. Reducing blank space must never be implemented by shrinking edit mode or leaving an empty region below its footer.
- Split confirmation keeps its bottom “確認完畢，回到切篇” action fully visible when the dialog opens. The three comparison columns own vertical scrolling; the dialog card itself must not require a small final scroll merely to reveal the action.

## Long lists and contextual menus

- The desktop chapter rail owns its vertical scrolling. Selecting a chapter preserves that rail position even when the list rerenders.
- Opening a chapter overflow menu must not change the source panel from contained scrolling to page-height content. Near the panel bottom, the menu opens upward and remains inside the visible viewport.
- Main workspace content must keep its grid position while the source rail scrolls or a row menu opens.
- The desktop source rail and `.workspace-main-column` are independent vertical flows. The right column owns the statistics strip and splitter/editor stack with the shared section gap; a taller source rail must never stretch an empty grid row or push the splitter below the statistics.

## Command search

- The sidebar search action uses a magnifier and displays the detected desktop shortcut: `⌘ K` on Apple platforms and `Ctrl K` on Windows/Linux. Touch/coarse-pointer layouts hide the keyboard hint; search remains a command, not a destination with persistent selected navigation state.
- The command dialog keeps one search field, one optional body-search checkbox and one scrollable result list. Result type, primary title and location form a consistent three-level hierarchy.
- Keyboard focus begins in the search field. Arrow keys move the active result, Enter opens it and Escape closes the dialog. The visible close control is always `×`; `Esc` remains a keyboard affordance in the desktop footer, not the close-button label.
- Do not open command search over another visible modal decision. The search footer states that only currently loaded private data is searched.

## Responsive scope

The longform “作品與章節” rail and visual “作品與圖文” rail use the same source-column contract: `--sf-workspace-source-columns` and `--sf-workspace-column-gap`. Content type may change the rail contents, but not its outer width, page alignment or breakpoint behavior.

Desktop Chrome is the primary work environment. Controls still need to wrap safely at narrow widths, but mobile should preserve essential reading and recovery rather than duplicate every dense desktop composition.

Responsive behavior follows Chrome's CSS viewport, including browser zoom and moving the window between a laptop and an extended monitor; it does not branch on a monitor's physical resolution. Validate the main desktop compositions at approximately 1366×768, 1440×900, 1920×1080 and 2560×1440 CSS px.

- The desktop workspace canvas grows normally through common laptop and 1080p widths, then stays centered at a maximum useful width of 1800 px. Extra ultrawide space becomes symmetric breathing room instead of stretching article rows and controls.
- From 1600 px upward, the chapter source rail may grow from 320 px to at most 380 px so long titles and row actions remain scannable. The split surface receives all remaining canvas width.
- Works and Publishing remain single-column task lists. A large monitor must not turn them into unrelated side-by-side card grids or enlarge button/font geometry.
- Settings is centered within a narrower 1440 px measure so paired cards and publishing-format controls stay visually related.
- Dialogs retain task-specific maximum widths and own their overflow. They do not expand to the full ultrawide canvas.

On phones, the main surface shows only a compact amber “唯讀” state label (or blue “可編輯” while the current session is unlocked). The bottom navigation keeps workspace, works, publishing, settings and search in one five-column row; shortcut text is hidden, but search remains available for reading. Explanation and the two-way editing switch live in the full Settings page under “手機使用模式”; the control becomes full-width at narrow widths. Mutating controls look unavailable while read-only; folder reconnect, settings import, navigation, filters and preview remain usable. Hide the normal workspace save copy while read-only so it cannot imply a completed save or cloud sync.
