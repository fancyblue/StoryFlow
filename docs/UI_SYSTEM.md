# StoryFlow UI system

> 狀態：現行 UI 規範（已落地，持續維護；最後同步：2026-10-17）

This is the small shared UI contract for StoryFlow's desktop-first interface. Prefer these patterns over page-specific variants.

## Cascade order

The order stylesheets appear in `index.html` is **not** the order they resolve in.
`ensureThemeOrder()` in `src/settings/settings-page.js` re-appends theme, mobile-visual,
workspace-ux, connection-status, ui-system, layout-integrity and desktop-responsive to
`<head>` at startup, and `ensureStyleLast()` in `src/source/project-source-sync.js` and
`src/source/source-article-ux.js` each move one more. A rule that looks last in the
document can therefore lose, and a rule that looks early can win.

Reason about a conflict from the runtime order, not from `index.html`. Two consequences
worth stating plainly: adding a stylesheet late in the document does not make it
authoritative, and the two `ensureStyleLast()` modules are in a standing race with each
other that only settles because of the order they happen to run in.

That startup order is fixed, so it is recorded in `scripts/cascade-order.json` and
asserted against the running page by `tests/browser/cascade-contract.spec.js`. What is
not fixed is the tail: `ensureStyleLast()` re-appends its own stylesheet every time its
view renders, so `project-source-mode.css`, `source-article-ux.css` and
`chapter-management.css` change places during ordinary use — confirming a split moves
`chapter-management.css` out of last position. Those three currently contest no
property with each other, so nothing renders differently, but a future rule placed in
two of them would resolve differently depending on what the user had done. Keep them
free of shared properties, or give them a fixed order instead of a race.

`npm run test:css` fails on CSS that cannot affect anything, in two forms that are provable from the
text alone:

- `scripts/dead-selectors.mjs` — a selector that names a class or id nothing in the app produces.
  Names built at run time from a prefix (`'is-' + state`) count as produced, and names inside
  `:not()`, `:is()`, `:where()` and `:has()` are not judged.
- `scripts/dead-declarations.mjs` — a declaration the same selector overrides later under the same
  conditions (none, or the same `@media`/`@supports` chain) by the recorded order, and a rule with
  no declarations at all. Cross-file pairs involving the indeterminate tail are excluded.

Both take `--list` to explain and `--apply` to remove. The header connection chip is what they were
written against: its markup was gone, but its rules were still spread across six stylesheets, and
each of them looked like one more layer a change had to beat. The first pass removed 93 selectors,
191 declarations and 82 empty rules — about 500 lines — and a computed-style comparison of every
element in 87 states at 1440, 820 and 390px found none whose resolved style changed.

When a change has to beat an existing rule, change that rule. A second rule with the same selector
that wins is exactly what the check refuses, because it is how these layers grew.

## Hiding elements

`[hidden]` is a global contract declared once in `styles/layers/foundation.css` as
`[hidden]{display:none!important}`. Author rules that set `display` — including
`.field-label{display:block}` and mobile `.nav-item{display:grid!important}` —
otherwise outrank the user-agent rule, so `element.hidden = true` fails silently.
That is how an orphaned `作品名稱` label survived beside its hidden input.

Use `hidden` for state — this element has nothing to show right now — and never for
breakpoint visibility. A control that one width shows and another hides is a
stylesheet decision: express it with breakpoint rules on both sides, as the Settings
nav item and sidebar gear now do. Setting `hidden` and relying on a media-query
`display` rule to override it reads as a bug even when the intent is deliberate, and
it stops working the moment the cascade is corrected. Do not add per-component
`[hidden]{display:none}` patches either; the global rule already covers them.

## Disclosure controls

Use disclosure only when the same control opens and closes adjacent content or a menu.

```html
<button type="button" aria-expanded="false">
  <span>設定</span>
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

Current shared disclosures include workspace work switching, the split head's 設定 (閱讀設定 and 切篇偏好), publishing project switching, publishing project filtering and Publishing work-group collapse.

## Action hierarchy

- Primary: the single action that advances or confirms the current task.
- Ghost/secondary: preview, return, cancel or supporting actions.
- Soft (`.sf-soft`): a toolbar control — the segment's `--paper-2` fill, no frame, `--paper-1` under the pointer or while its disclosure is open. The format select, 設定, 讀稿檢視, 回到工作台, the reading view's 閱讀設定 icon and 切換作品 are soft.
- Quiet (`.sf-quiet`): a control used rarely enough to rest as text, taking the hover fill only under the pointer. 更新作品來源 and ＋ 新增文章／＋ 新增圖文 are quiet.
- Overflow (`⋯`): infrequent row management and destructive actions.
- Close (`×`): dismisses a dialog; in pending creation it also cancels the transaction.

A toolbar is one family of controls. The 切篇預覽 head once framed five — the format select,
閱讀設定, 切篇偏好, 讀稿檢視 and, below them, both scene buttons — and then, with the frames thinned,
still showed four kinds of thing: a framed field, a filled segment, bare text and a framed button.
They are all ways of looking at one preview, so they are all soft now: the segment's fill and no
frame. The suggestion's status (建議／低於偏好) is a state rather than a control, so it is a dot and
its word with no fill at all. 閱讀設定 and 切篇偏好 sit together behind one 設定 disclosure. It opens a
panel anchored under the head's actions, laid over the preview rather than pushing it down, with
閱讀設定 above 切篇偏好; both are changed far less often than the preview is read.

Two actions that are one decision in opposite directions are one control. `.sf-button-group`
draws 少一個場景／多一個場景 as the segment's fill with neither half raised (neither is a current
state) and a hairline between them, in the split panel's title row and the reading view's foot.

Page-level task order and the resulting primary action are defined in [UX_FLOW.md](UX_FLOW.md). Frequency alone does not justify a solid fill, and a page may change its primary action as the current workflow stage changes.

Do not place a destructive action beside the primary action when an overflow menu can keep the decision hierarchy clearer.

A destructive action must never be the only enabled control in an empty state. When there is nothing to destroy it is disabled, and it must also *render* as disabled: danger controls are selected by id or by a single class, which outranks the shared `.button:disabled` treatment, so the disabled rule is restated at matching specificity in the theme layer. "清除 Google 設定" follows this, staying disabled until integration settings exist.

One action carries one label and one weight wherever it appears. Connecting the StoryFlow folder is reached from the Settings folder card and from the backup centre, so both read "連接資料夾" and both stay outlined; the backup control only proxies the owning card and must not out-emphasize it. Sidebar chrome ranks below navigation: the collapse toggle rests on no fill at all and takes the shared hover tint only under the pointer, never the `--denim-800` used by an active nav item, so a utility control cannot read as the current destination.

## Toolbar controls

A row of controls is one height. The 切篇預覽 head used to hold a 40px format select, a 40px
預覽／原始 MD segment and 34px buttons, at three corner radii and two label sizes. Nothing chose
that: the select's own `height:34px` lost to a shared `!important`, and the segment's height was
its 34px buttons plus 3px of padding on each side. Side by side, the taller boxes made every
label in the row look undersized.

| Part | Value |
| --- | --- |
| Height | `--sf-control-sm` — 34px on desktop, 40px at 820px and below |
| Label | `--sf-font-control` (14px) |
| Corner | 8px; a segment's inner buttons 6px |
| Surface | no frame; `--paper-2` fill (the segment's), `--paper-1` under the pointer or while open, on buttons and selects alike |
| Segmented control | outer box `--sf-control-sm`; inner buttons `calc(var(--sf-control-sm) - 6px)` |

`.button.tiny` is this tier, so it applies wherever that class is used, and the select, the
segment, 設定, 讀稿檢視, 切換作品, 更新作品來源 and the scene button group all resolve to it.
A control that needs a different height belongs on a different row. `cascade-contract.spec.js`
measures the split head and the source head together and fails if any of them drifts.

## One control, one size

A button's height decides its corner and its label, and the same control is the same size on
every page that shows it. A pass over every page found the same thing decided twice and
settled differently each time: Works drew its row's 開啟 at 9px corners, 管理發布 at 8px and its
`⋯` 6px shorter than both, beside a Publishing row that was 40px throughout; 全部類型／長文／圖文
was a 31px chip with an 11px label on Works and a 34px, 12px chip on Publishing, selected in the
recessed fill on one and the ground on the other; and dismissing a dialog was a 40px framed `×`,
a 36px framed `×` with a 24px glyph in search, or a bare 34px icon in the publishing lightbox.

| Tier | Height | Corner | Label | Used for |
| --- | --- | --- | --- | --- |
| Standard | `--sf-control` (40px) | 10px | 14px | Page and section actions, dialog footers, form fields, and every list row's actions on Works and Publishing |
| Compact | `--sf-control-sm` (34px) | 8px | 14px | `.button.tiny`: toolbars, tool buttons inside a task, a nested chapter or entry row's 編輯 and `⋯` |
| Segment | 34px outer, 28px inner | 8px / 6px | 14px | 預覽／原始 MD, the reading view's 讀稿／接縫, 少一個場景／多一個場景 |
| Chip | 34px | pill | 12px | Filters: 作品, 全部類型／長文／圖文 on Works and Publishing alike, publishing status |
| Menu item | 36–40px | 7px | — | Row menus and the work switchers |
| Close `×` | 34px square | 8px, no frame | 22px glyph at 400 | Every dialog head, global search and the publishing lightbox |

Rules that follow from it:

- **A list row's actions are the standard tier**, owned once in `ui-system.css`; Works and
  Publishing set only their colours. The row's `⋯` is as tall as its neighbours and square.
- **The same management action rests the same way.** 管理章節 and Publishing's 管理發布 both rest
  on the ground's fill inside the ordinary frame, and take the darker frame and full ink only
  under the pointer or while open. 管理章節 used to rest in its open state.
- **Selected on paper is the ground** for every chip: the type chips now take it like the
  status chips beside them. The 圖文 chip keeps its moss when selected, because that colour is
  the content type, not the selection.
- **A sort is not a chip, but it is the toolbar's height.** 最新在前／章節順序 is 34px at 8px
  corners and keeps one weight in both states, so the pair no longer shifts when it changes.
- **Closing is never the decision a dialog asks for**, so `×` carries no frame and no fill
  until the pointer reaches it. A destructive menu item is separated from 編輯 by a rule drawn
  in the gap, not by a top border that would square off its corners.
- `#confirmBtn` (確認並存成 Markdown, 46px at 11px) stays the one exception: a lone, final
  action that competes with nothing beside it.

`cascade-contract.spec.js` measures Works' and Publishing's row actions, both pages' type chips
and the three close controls together, and fails when one of them drifts from the others.

## A disabled control explains itself, and looks disabled

Two halves, and the second is the one that gets lost.

**It says why, in text.** A `title` attribute is not the explanation: it is invisible on
touch, and a keyboard user cannot reach it on a control that cannot take focus while
disabled. The reason sits beside the control — 「需要先連接資料夾」 next to a disabled
＋ 新增作品 — and is wired with `aria-describedby`. The `title` can stay as a second copy; it
cannot be the only one.

**It looks disabled.** `.button:disabled` sets the inactive treatment in `theme.css`, and any
rule that colours a specific button by id overrides it — `--ink-faint` is the palette's step
for inactive controls, and it never reached the one control that most needed it. The result
was a button that said it could not be used, showed `cursor: not-allowed` on hover, and
otherwise looked entirely usable.

That is the same shape as the specificity note under [one hierarchy](#one-hierarchy-two-pages):
a rule that takes over a property takes over all of its states too. If a selector sets
`color` on a button, it owes that button a `:disabled` rule as well.

## Palette

The interface is warm paper, warm ink, and one restrained accent. Colour values are defined
once in `styles/layers/theme.css`; `--sf-*` in `ui-system.css` and the legacy `--denim-*`
names are aliases onto them, not a second set of values.

| Family | Values | What it is for |
| --- | --- | --- |
| Paper | `--paper-0` ground · `--paper-1` raised · `--paper-2` recessed | Surfaces. Warm white, not `#fff` |
| Ink | `--ink-1` body · `--ink-1-soft` strong label · `--ink-2` secondary · `--ink-3` metadata · `--ink-faint` | Text |
| Rules | `--rule-1` hairline · `--rule-2` emphasis | Lines |
| Accent (黛) | `--dai-700` the accent · `--dai-800` hover · `--dai-soft` (drop-target label only) | Primary and active |
| Pigments | `--vermilion` destructive · `--ochre` warning · `--moss` published | Semantic states |

Three rules hold this together.

**The accent is the only thing that is not paper or ink.** It is what makes a 12%-saturation
purple-grey read as meaningful: nothing else competes with it. The palette it replaced was a
seven-step blue ramp doing three jobs at once — the dark end was body text, the middle was the
primary action, the light end was borders — which is why every screen read as uniformly blue
regardless of what it was trying to say.

**One value per role.** Before this palette the loaded stylesheets held 408 distinct colours,
most of them a few percent of lightness apart: fifteen pale blues for "a surface", a dozen for
"a line". They are now 32, and `npm run test:palette` fails on the thirty-third. Adding one is
a deliberate act — put it in `PALETTE` in `scripts/palette-contract.mjs` with the role it
serves, and the diff records the decision.

**Every text pair clears AA.** This is the constraint that shaped the ink ramp, and it is why
the ramp does not match the design sketch exactly. The sketch's third ink step, `#968f80`, is
3.1:1 on paper — below 4.5:1 at reading size — so the step is split: `--ink-3` (`#6f6759`) is
the readable one for units, timestamps and placeholders, and `--ink-faint` keeps `#968f80` for
the two places where the requirement does not apply, inactive controls and hairline borders.
The same rule forces the dark rail to carry its own destructive colour: `--vermilion` clears
5.7:1 on paper but 2.5:1 on the rail, so `.sidebar-logout` uses a lightened pigment rather than
the rail being made lighter.

### One elevation, and it is for overlays only

Panels, cards, rows, inputs, the statistics strip and the manuscript surface carry no
shadow. They separate the way the palette intends them to: a `--paper-1` surface on the
`--paper-0` ground, with a `--rule-1` hairline where an edge needs stating. Thirty-five
elevation shadows were removed to get there, and `--sf-shadow-card` / `--shadow-card` /
`--shadow-pop` went with them once nothing referenced them.

`--sf-shadow-pop` is the one that stays. An overflow menu, a filter menu, a row action menu,
the recovery dialog, a toast and `dialog` itself all float over content of their own colour,
and neither a surface step nor a hairline can say "this is in front" when the thing behind
is the same paper. That is the whole remaining brief for elevation: not depth as decoration,
but the one case where flatness would be ambiguous.

### An opaque box-shadow is a ring, not a shadow

Elevation in this palette is always translucent ink. So a `box-shadow` carrying an *opaque*
colour is not elevation at all — it is a ring, a halo, or an edge marker, which is to say a
border drawn by another name, and it takes the line and surface steps by lightness like any
other border.

Missing that distinction is not hypothetical. The repalette classified `box-shadow` as one
thing and mapped every colour in it to ink, which turned a pale lavender focus glow into a
solid near-black ring, a 4px pale-blue halo around a 9px status dot into a 4px near-black
one, and a light marker bar on the active rail item into ink on ink — invisible. Eight of
them shipped. `scripts/palette-contract.mjs` now fails on any opaque `box-shadow` using
`--ink-1`, which is the signature of exactly that mistake.

Focus indicators are the exception within the exception: they carry their own 3:1
requirement, so they do not take the line steps either. They use `--focus` / `--sf-focus`,
or the accent where a token does not reach.

### Colour is not covered by the visual baselines

Playwright compares screenshots with pixelmatch, whose `threshold` defaults to 0.2 of the
maximum perceptual distance. This palette was built to preserve the lightness of what it
replaced, so repainting every surface in the app changed 97% of the pixels in a baseline and
the suite still passed at that threshold. That is useful evidence — the swap was purely
chromatic, and nothing structural moved — and it is useless as a guard.

So colour is checked statically by `scripts/palette-contract.mjs`, and the pixel baselines are
left to do what they are good at: geometry. When changing colour, run `npm run test:palette`.
Do not lower `threshold` in `playwright.config.mjs` to compensate: the baselines are generated
on one Chromium build and verified on another, and the tolerance that absorbs that difference
is the same one a tightened threshold would consume.

## Lists are rows, not cards

Chapters, works and the statistics strip are lists. Each row carries a `border-bottom`
hairline and nothing else: no fill of its own, no radius, no border around it, and the list
closes up to `gap: 0` so the hairlines are what separate one row from the next. Where the
panel a list sits inside still has a frame, the rows inside it do not get one each.

**A shared card rule may not name a row.** Both `ui-polish.css` and `ui-system.css` carry a
rule that gives `.panel` and a list of named components a border, a 16px radius and a
`--paper-1` fill, and `.project-library-card` was in that list. It loads after
`works-library.css`, at the same specificity and also `!important`, so the row contract that
file states — no border, no radius, no fill — never rendered once in the app: every work drew
a card. The list's own rule across its top then met a rounded corner one pixel below it,
which reads as the card pushing through the line rather than as a list starting. Nothing
caught it, because the markup was right the whole time and a one-work baseline changes fewer
pixels than the tolerance; `cascade-contract.spec.js` now asserts the resolved values.
Naming a component in a shared card rule is a claim about what it is, so a component that has
decided it is a row has to come out of that list, not out-specify it.

Two rules make this work.

**The row owns the state, not the control inside it.** A chapter row is a title button plus
a `⋯` button. Filling only the button left the state stopping short of the `⋯`, which read
as the row being half-selected. The row carries the fill and the marker, so both reach the
full width.

**The active marker's gutter is reserved on every row.** Each row has
`border-left: 2px solid transparent`, so marking one active colours a border that is already
there instead of adding 2px and pushing every other row's text sideways.

Active is two signals, not one: the accent left marker plus the `--paper-0` fill (on paper, selected is a piece of the ground). Where a row also
carries a badge naming the state — "目前作品" — the badge lifts to `--paper-1` so the tint it
sits on does not swallow it. The badge is the half of that signal which does not depend on
seeing colour.

### A rail is a column, not a card

Both workspaces show a list beside the thing it describes: chapters beside the split panel,
entries beside the entry editor. Drawing each side as a card stated the boundary twice — the
grid gap already puts them apart — and the rail's frame ended wherever its list ended, which
left an edge partway down the page with nothing on the other side of it. That reads as a
broken line rather than a drawn one.

On desktop the change of surface says it instead: the rail sits on the ground and the subject
on paper (see [Left to right](#left-to-right)), so the boundary is where ground meets paper and
no line is drawn at all. It was a hairline between the columns until the subject became a sheet
of paper; a line along an edge that a colour change already draws is the boundary stated twice.
The rail is transparent with no border or radius, and both rails resolve to the same shape;
`cascade-contract.spec.js` asserts it rather than leaving it to a reading of two baselines.
Stacked below 820px the page is paper throughout, so the two columns part along a horizontal
hairline at the rail's bottom.

Flattening a panel exposes whatever was drawn inside it in the same paper. The Smart Split
platform bar had carried a `--paper-1` fill from the theme layer while its own rule asked for
transparent — invisible against a card of the same colour, a strip across the page without
one. A local rule that a shared `!important` was overriding has to be restated at its own
specificity, not left to be discovered by the next change of ground.

### Which hairline

`--rule-1` is for lines drawn **on paper**. `--rule-2` is for lines drawn **on the page
ground**, which is six lightness steps darker: `--rule-1` against it is 1.1:1, which is not a
line anyone can see.

The weak pairing this section warned about — both source rails drawing `--rule-1` row
separators and a `--rule-1` column divider on the ground — is gone rather than recoloured: the
rails draw no lines at all now. Their rows are separated the way the menu's items are, and the
current one is a rounded `--paper-1` fill — a piece of the paper the work column is drawn on,
and the one fill on the ground lighter than the `--paper-2` hover (see [What a chapter row says](#what-a-chapter-row-says)).
`--dai-soft` was used there first: a cool grey on the warm ground, darker than the hover fill, it
was the least visible thing in the rail. The rule runs both ways: selected is the *other*
surface. On paper (Works, Publishing, the filter chips, sort options, menus and search results)
it is `--paper-0`, a piece of the ground, darker than the `--paper-2` hover; `--sf-surface-active`
and `--sf-primary-soft` name it. `--dai-soft` is no longer a selected state anywhere.
The Works and Publishing lists keep the row contract above, with its hairlines and marker gutter.

### Space before lines

A rule is drawn where an edge cannot be seen otherwise, not where one section ends and the next
begins. The workbench had seven horizontal lines before the first sentence of the manuscript: a
rule under each of the two heads, a rule under the progress line, two rules 15px apart between
the Google Docs source row and 章節清單, the list's top rule, and an outline around the manuscript.
Space now separates the head, the source row, the list head and the progress line.

What stays is what has no substitute: the progress bar, which is data. The rails' list top rule
and row separators went with the rails' lines (above). On desktop the manuscript is text on the
work column's paper, with no outline and no inset of its own. Below 820px the page itself is
paper, so the outline returns for the split preview and the reading view alike.

### Left to right

On desktop a page unfolds from left to right, and brightens as it goes: the menu and, in the
workbench, the chapter or entry rail sit on the `--paper-0` ground; what you are working on is
one sheet of `--paper-1` that meets the window's top, right and bottom edges. Each view takes the
whole of `.main` (its padding moves inside it, so nothing in it moves), and the workbench's
background turns from ground to paper exactly where its rail ends — `--sf-rail-width`, the one
token both the grid track and that edge read. Works, Publishing and Settings are paper from the
menu's edge; the reading view is paper throughout, since it replaces both columns.

The paper used to stop 35px short of the right edge and below the page title, which made it one
more box among the others. A card on the paper says the same thing again, so the manuscript is
text on it, the Publishing queue is rows on it (its unframed rule now names both its classes,
because the shared `.panel` card rule loaded later at one class and drew the frame anyway), and
Settings keeps its cards only because they group form fields.

What you work on is one **page** on that sheet, in both content modes: in longform the split
preview's toolbar, progress line and prose, in visual the editor's fields (and its empty state),
share one width — `--sf-page-width`, the reading measure, or 600px (the toolbar's own width) when
the measure is narrower — and the page sits in the middle of what the paper has. A toolbar running
the sheet's full width over prose held to its measure left a blank strip down the right; centred,
what is left of the paper is an even margin. 閱讀設定's measure widens the page with the prose.

**The rail's edge can be dragged.** A handle (`.sf-rail-resizer`, `src/ui/rail-resize.js`) sits
on the line where ground turns to paper in both workspaces; it shows a line only under the
pointer, while dragging or with keyboard focus (←／→ move 16px, Shift ×4, Home restores), and a
double click restores the default. The choice is this browser's, in `localStorage`
(`storyflow.ui.railWidth`) like the sidebar collapse and 閱讀設定 — never work data. The script
only sets the wish (`--sf-rail-user` and `[data-rail-width]` on `<html>`, 240–640px);
`desktop-responsive.css` turns it into `--sf-rail-width` and stops it where the work column would
drop under 600px (or at the breakpoint's default, where even that leaves less), so a width chosen
on a wide screen never squeezes a narrower window. The breakpoint widths are `--sf-rail-default`.
Stacked (≤820px) there is no edge and no handle.

A view arriving unfolds rather than appears: the page fades in over 220ms and the work column
follows 60ms later. It is opacity only, so nothing moves under the pointer and no measured
position changes, and it is off under `prefers-reduced-motion`.

### What a chapter row says

A chapter row is one line: number · name · length · a mark for how far its split has got — ✓ in
`--moss` once finished, an accent dot part-way, nothing before the first cut. The figures
(「未開始」, 「已切 3 篇 · 剩 2,610 字」, 「已切完 · 2 篇」) are the row's tooltip and its text for
assistive technology. They were written under every row once, and that line repeated the progress
line the split panel gives for the open chapter; the mark answers which chapter to split next
without repeating it. The list head adds the finished count: 「10 章 · 已切完 2 章」. Rows close up
with no gap, so the current row's fill meets the hairlines on both sides of it.

A leading 「01、」「序、」 is the chapter's number, not its name, and sits in a column of its own as
wide as the widest number in the list (`--chapter-no-width`), so names start on one line and
numbers stack. Only the display changes; the title is stored and exported as written. A title
that is only a number (「終、」) shows 「（無標題）」 in `--ink-3`. Names are 500 and the current
chapter's is 700: ten bold rows left the selected one nothing to be heavier with. The length is
500 in `--ink-3` and shares the name's baseline.

Above the list, the work's name is text edited in place (`.rail-work-name`): no frame until it
has focus, the hover fill to say it can be changed, and its 作品名稱 label kept for assistive
technology only. The Google Docs source row sits directly under it with a quiet 更新作品來源.
The visual rail uses the same name, the same quiet 新增圖文 and the same row weights.

### Chapter progress

The four chapter figures used to be a strip of cards across the top of the main column. They
are one line inside the split panel now, because that is what they are about: every one of
them describes the chapter being split, and a strip above the panel put them above the work
rather than inside it.

The line is a bar and three figures. The bar states the confirmed/total ratio without being
read; the figures carry the exact values, including the two a bar cannot show — how much is
left, and how many parts exist. An empty chapter has no ratio, so the bar shows none rather
than full.

## One hierarchy, two pages

Works and Publishing both show 作品 › 章節 (› 篇). Works expands to chapters; Publishing
expands to parts, and then to platforms inside a part. They are built by different renderers
from different data, and that is fine — what is not fine is each of them deciding separately
how deep a level sits and what separates one row from the next. Works indented a chapter row
21px and drew hairlines under each; Publishing indented nothing at all and drew them as a
`border-top` on every row after the first. Same hierarchy, two readings of it.

`styles/domains/list-hierarchy.css` owns the part that should not differ:

| Class | What it fixes |
| --- | --- |
| `.sf-hier-nest` | One `--sf-hier-step` (16px) of indent. Two levels down is two steps, and nothing is ever half a step |
| `.sf-hier-row` | The hairline under a row, none under the last, and the 2px left gutter the current marker lives in |
| `.sf-hier-head` | A level's header line: what the level is, then its count or controls at the far end |
| `.sf-chevron` (in `styles/layers/ui-system.css`) | The chevron, pointing the same way for the same state |

What a row *contains* stays each page's business. A chapter row on Works carries 編輯章節; a
part row on Publishing carries 預覽與複製; neither belongs in the shared file.

The disclosure is shared in behaviour, not in appearance: both expanders carry
`aria-expanded` and rotate the same chevron, but a work row's expander is also a named action
("管理章節" / "收合章節") while a chapter group's is a bare control. Giving the work row a bare
chevron would drop an action label that [action hierarchy](#action-hierarchy) requires.

`cascade-contract.spec.js` pins it: both pages' nested level, row separator and marker gutter
must come back identical, and the step must be exactly 16px. A page that drifts to "about the
same depth" fails there rather than being noticed a year later.

### Owning a property means owning all of it

`publishing.css` had `.publishing-chapter-group .publish-list-item{border:0!important}` from
when the group drew its own separators. Two classes beat one, so the shared contract lost
regardless of load order, and the contract's border never rendered. That rule now zeroes only
the top and right — the card edges a row inside a group should not have — and leaves bottom
and left to the contract. When a shared rule and a local one both claim a property, the local
one has to give back the part it no longer owns; lowering the shared rule's specificity is not
available, because specificity is what made the local rule win in the first place.

## Type weight

The interface uses exactly three weights: **400**, **500**, **700**. No other numeric value
may enter a stylesheet.

The reason is the font stack, not taste. StoryFlow renders Traditional Chinese in system
families (PingFang TC, Noto Sans TC, Microsoft JhengHei); no webfont is loaded, because a CJK
face is measured in megabytes and the app is expected to open offline. Those families ship
Regular and Bold, and at most a Medium. A declared `800` or `850` therefore has no matching
face: the browser either resolves it to the same Bold that `700` gets — making the distinction
imaginary — or synthesises a faux bold that thickens strokes uniformly and fills in the
counters of dense glyphs at small sizes. The stylesheets used to name thirteen weights, `800`
alone in 83 places; none of them bought a rendered difference worth the ambiguity.

- **700** — headings, statistic numbers, primary action labels, the state half of a status chip.
- **500** — small secondary text: field labels, hints, checkbox labels, chip labels, format
  summaries, the unit that trails a statistic.
- **400** — article body, textarea and input content.

Small muted text takes 500 rather than 700. Bolding 11.5 px grey Chinese is the specific
failure this scale exists to prevent: the glyph is already dense, the contrast is already low,
and weight adds noise instead of rank.

Do not raise a weight to separate two adjacent items. Size, colour and spacing carry that
distinction — a statistic's label and its number are 12.5 px muted against 26 px ink, and both
are 700 because the separation is already unmistakable.

## Navigation rail and page heads

The desktop rail (`min-width: 821px`) is a quiet, flat column: 208 px wide (76 px collapsed),
36 px items with a 14 px / 500 label and an 18 px stroke icon, 8 px radii, and no edge bar,
shadow or gradient anywhere in it — the brand mark is a flat `--denim-700` square. It sits on
the page ground with a `--rule-1` hairline at its edge: it was the darkest thing on every screen
for the control used least. The active item is the rail's one fill, the same rounded
`--paper-1` the chapter and entry rails use, and it does not change weight: the fill already
says where you are, and a bolder label would only shift the text. These
colours are desktop-only (ui-system.css's desktop navigation block); the phone's bottom bar
keeps its dark ground. The rail's
width lives in `sidebar-layout.css`, `--sf-sidebar-width` in `desktop-responsive.css` and the
toast centre in `app-ux.css`; change all three together. The phone's bottom bar keeps its own
icon and label sizes in `layout-integrity.css`'s phone block.

A page head is its title alone. Works, the workbench, Publishing and Settings once carried an
English eyebrow (`STORYFLOW / WORKSPACE`) above a 30 px Chinese title, which restated the
navigation in a second language and spent two lines on a label. The title is now one line at
`--sf-font-page` — 22 px on desktop, 20 px at 820 px and below — with the page's subtitle, if
it has one, under it.

The same goes for every other head. Sections, rail lists and dialogs once carried their own
English eyebrow (`SOURCE`, `SMART SPLIT`, `CHAPTERS`, `MANUAL SOURCE`, `PUBLICATION RECORD` and
two dozen more), each a translation of the Chinese title under it. They are gone, `.eyebrow`
with them; a head is its title, and a region that needs a name has a Chinese one.
`cascade-contract.spec.js` pins the rail's active item, its width, the page head's size and
that no `.eyebrow` is rendered.

## Reading measure

Rendered prose — the split preview, the platform preview, the source preview — is the only
content in the app that is read rather than scanned, and it is capped at **36em** with one
declaration on `.sf-preview-rendered-root`. At its 16px that is a 576px column, about 36
Chinese characters to the line, whatever width the surrounding panel happens to have. Before
the cap, the platform preview ran 53 characters to the line at 1440px and grew from there;
Chinese sets comfortably at roughly 30-40, and past that the return sweep starts landing on
the wrong line.

The column is aligned to the start, not centred. The preview panel's heading, its border and
the dialog's controls share one left edge, and centring the text breaks that edge while
leaving a short paragraph looking pushed to the right. The width left over is right-hand
margin, which is the point.

Size and leading (16px / 1.8) live on that same element rather than on each surface. The three
surfaces used to repeat `15px/1.9` while `ui-system.css` set their containers to 16px, so the
container declared one size and the text rendered another.

Those three values are **defaults**, not fixed values. **閱讀設定** (`src/ui/reading-settings.js`) lets
each browser choose a size from 14 to 20px, leading 1.6 / 1.8 / 2.0 (緊湊／標準／寬鬆) and a
measure of 28 to 44 characters. It sets `--sf-reading-size`, `--sf-reading-leading` and
`--sf-reading-chars` on `<html>`, and `.sf-preview-rendered-root` reads them, so all three surfaces
follow one choice. The measure stays a character count: the cap is
`calc(var(--sf-reading-chars) * 1em)`, a measure at whatever size is chosen, and the reading
view's one column grows with it (`--sf-reading-column` is the measure plus the flow's padding).

The same panel chooses an interface density, 舒適 or 緊湊. 緊湊 sets
`html[data-sf-reading-density="compact"]`, which only changes custom properties
(`--sf-reading-flow-pad`, `--sf-preview-pad`, `--sf-split-gap`, `--sf-split-title-gap`) that the
rules owning those gaps already read. Nothing is added to outrank them.

The choice belongs to the browser, not to a work: how much prose fits depends on the screen.
It is kept in `localStorage` under `storyflow.ui.readingSettings`, like the sidebar collapse,
and lasts only the session where storage is refused. In the workbench the controls are the first group of the split head's 設定 panel. In the reading
view they open from a quiet icon button labelled 閱讀設定, immediately before 回到工作台. Both draw
the same controls from `reading-settings.js` and show the one current choice.

Raw mode is deliberately exempt from all of this. `.sf-preview-raw-root` stays monospace and
uncapped because it exists to show the exact Markdown that will be pasted; re-wrapping it at a
reading measure would misrepresent the output.

## Which collapses are remembered

Two collapse controls exist and they persist differently on purpose; do not make them agree.

The **sidebar collapse** is remembered across reloads in `localStorage` under
`storyflow.ui.sidebarCollapsed`. It is a statement about how much width the navigation should
take on this screen, so re-asking every reload made the control worthless. It is deliberately
*not* kept in `state.ui` beside `lastView`: `state` belongs to the active work and
`switchProject()` replaces it wholesale, so a work switch would expand the sidebar again.
Reading or writing may fail (private windows, blocked site data); both are wrapped and fall
back to the previous session-only behaviour rather than breaking the toggle. Every
`.sidebar-collapsed` rule lives inside `sidebar-layout.css`'s `@media (min-width: 821px)`
block, so restoring the class is inert on narrow layouts.

The **Publishing work-group collapse** (UX_FLOW P-13) stays session-only. It hides one work's
body in a long queue for the task at hand; remembering it would leave a work you collapsed
weeks ago still hidden, which reads as missing data rather than as a view preference.

The distinction is scope, not inconsistency: window chrome is remembered, content filtering
is not.

Menus that open against a row are positioned by one shared module,
`src/ui/anchored-menu.js`. The chapter rail, the visual entry list and the works-page rows
all use it; previously the first two carried near-identical copies of the logic and the
third had none, opening downwards unconditionally. Two separate faults came out of that
split, and both are answered in the shared version:

- **Size is not settled when a menu is unhidden.** `manual-chapter-edit.js` prepends an
  item to the chapter menu after render — 73px before, 87px after — so a decision made
  from that first reading opened the menu downwards off the screen about once in twelve.
  The module observes the open menu's own size, which stays correct whichever code
  decorates it first; waiting a frame only bets on the usual order.
- **Room is the panel and the window, not the panel alone.** A scroll panel can extend
  past the bottom of the window, so a menu could sit inside its 972px panel and still end
  73px below a 900px viewport. Space is the intersection of the two, and where a row has
  no scroll panel — the works page — the window is the only limit.

Any new menu of this shape uses the module rather than a fourth copy. A test pins the last
works-page row against the bottom of the window and asserts the menu both flips and stays
on screen; it fails if either fault returns.

Verify this kind of fix with full-suite runs, not with a single test repeated. The first
attempt at the size fault was checked by running its own test 20 times in isolation and
looked settled; the failure only appears in the ordering of a whole suite run, so that
method confirmed nothing.

A control that is allowed to start an action must be allowed to finish it. Mobile read-only mode lists the buttons that stay usable in `SAFE_READ_CONTROL_SELECTOR`, but a file picker's real work happens in the `change` event that follows, so the inputs those buttons open are listed in `SAFE_READ_INPUT_SELECTOR` too. Allowing only the button left the settings import openable and uncompletable, answering a chosen file with nothing but the read-only notice.

A disabled control states why it is unavailable. The split scene controls carry the reason in `title` and in an `aria-label` suffix rather than repeating only what the action would have done. When several controls share one reason, that reason is written once and pointed at: the work-creation options carry `title` for a pointer and `aria-describedby` to the note above them, so a screen reader keeps each option's own name and hears the reason after it, instead of an `aria-label` replacing the name with a copy of the explanation.

A control selected by class rather than `.button` does not inherit the shared disabled treatment, so it restates it — including opting its `:hover` out with `:not(:disabled)`, since a disabled button still matches `:hover` and would otherwise light up under the cursor. Anything nested inside dims with it; an unavailable option with a lit icon reads as enabled in a grey box.

Longform chapters/articles and visual entries share this rule. Their list-level create action sits below the list as a quiet control (`.sf-quiet`), and every editable row keeps a trailing `⋯` in a fixed place. In the two workspace rails, on a device with a pointer, that `⋯` waits for its row: it shows under the pointer, on the current row, while focus is inside the row and while its menu is open, and it stays focusable at all times. On touch, and on the Works page, it is always shown. Manual-article and visual-entry menus use the same order: edit first, delete second. A visual entry is deleted as `⋯ → 刪除圖文`; do not add a second destructive button to the editor footer or make Workspace, Works and Publishing use different delete entry points. All entry deletion paths must reach the same confirmation and Recovery guard.

On the Works page, “管理章節／管理圖文” is the most likely next step and uses the same emphasized light-blue treatment on every work card. Both content types use “工作台” for the active work and “開啟” for inactive works; never substitute type-specific open labels for that open action. “管理發布” is a quieter tinted shortcut. The “目前作品” badge and card treatment alone communicate which work is active; action color must not duplicate selection or make identical labels look like different functions. Expanded management uses a stronger soft selection — the darker frame and full ink over the same ground fill — never a solid primary fill. Manual chapters and visual entries show direct “編輯” plus a persistent trailing `⋯` for Recovery-guarded deletion.

## The reading surface

Reading a chapter and deciding where to cut it are one surface with two views, `讀稿` and
`接縫`, not two places. It is a page inside the workbench (`#readingView`), not a dialog: both
workbench rails collapse and the chapter takes their place, because a modal that covers the
work in order to show the same work is only a lid.

One flow carries what three columns used to. The text before this part, this part, and what is
still ahead are told apart by **ink depth** — `--ink-3`, `--ink-1`, `--ink-2` — plus the
`這一篇開始／結束` markers. Nothing is duplicated into a second column to be comparable; the
previous part is literally the paragraphs above the start.

Head, hint, text and actions are one column with one shared left edge, and the width left over
is right-hand margin, as everywhere else prose is read. That column is a **length**
(`--sf-reading-column`), not an `em`: these children run from 12 px to 21 px, and an `em`
measure would hand each of them a different column. It is wide enough for the 36 em reading
measure inside the flow plus its padding.

`接縫` is a view, not a mode. `少一個場景／多一個場景` are coarse directional actions and keep
their arrows in both views; the seam view adds one compact full-width cut point after every
eligible paragraph. The current ending is a solid draggable line; candidates are quiet dashed
lines whose labels appear only on hover or keyboard focus, and every one must work by click and
by keyboard. Cut points appear only for the current unconfirmed range and never imply that
source prose is editable. The `顯示 預覽／原始 MD` switch steps aside while the seam view is
showing, because raw Markdown would throw away the buttons that view is made of. Switching
views keeps the cut where the author put it and scrolls the flow to the marker that view is
about, rather than keeping the other view's now-meaningless offset.

The bottom actions — character counts, the two scene buttons, `確認並存成 Markdown` — are
identical in both views. That is the evidence the two were one surface all along.

Character counts in review headers are supporting metadata, not headings: keep them smaller and quieter than the article title and action label. In the works library, “工作台”, “開啟”, “管理發布” and “管理章節” share one control height, font size and weight. All “管理章節” buttons use one emphasized light-blue treatment; Workbench stays outlined and publishing uses a paler tinted treatment.

The publishing list uses one action vocabulary for both content types: “預覽”, “管理發布”, then the persistent trailing `⋯`. “管理發布” uses the light-blue management identity and 40 px / 14 px geometry; “預覽” remains white and outlined, while `⋯` remains tertiary. An expanded “收合發布” state uses a stronger soft selection or border rather than the primary fill; solid emphasis belongs to copy or save actions inside the active task. A chapter group inside a work earns its header by separating one chapter from another or by labelling several parts at once. One chapter holding one part does neither, so that case is unwrapped and the row states its own chapter name — suppressed in turn when the chapter and the part share a name. A single chapter with several parts keeps its header but drops its count, which could only repeat the work count above it. Visual entries have no chapter and are never grouped: the synthetic list they used to form restated the work header. Each Publishing work-group heading ends with a compact chevron-only disclosure beside its item count. It collapses only that work's chapter/visual-entry body, defaults to expanded after reload, retains its session state through filter rerenders, and must expose the full work name through `aria-label` without becoming a large text button.

Top-level and empty-state actions use the same 40 px / 14 px control geometry without automatically sharing the same visual weight. “建立第一個作品” is the solid empty-state action, while “＋ 新作品” becomes tinted or outlined once works exist. The publishing empty-state return action may be solid; the workspace publishing CTA is solid only when confirmed pending content makes publishing the valid next step. Settings form actions use the same scale within each decision group; compact 34 px controls are reserved for filters, segmented controls and dense row utilities. Navigation icons use one 21 px stroke-SVG family so Chrome renders them consistently across macOS and Windows.

A surface gets a frame when it is the thing being read, or when it holds a region that has to read as belonging to one row. Everything between those two is a level in a list, and a level is drawn with a rule and indentation, never a box. Publishing had grown five nested frames between the page and the manuscript — work group, chapter group, article row, preview panel, content — so the text arrived at the bottom of a funnel. It now has two: the lightbox an opened article appears in, and the manuscript inside it.

Those two frames have to be whole, and nothing between them may borrow a frame's shape. A collapsed article is a row under the shared hierarchy contract: no radius, and its 2px marker gutter reserved in transparent until the row is current — a shared layer once gave it a 12px radius and coloured that gutter, so every row drew half a box, a left edge curving into the rule beneath it. An opened article's row stays a row — the current one, in the ground tone — because what opened is the lightbox above the queue. The work-group heading's rule spans exactly the rows it heads rather than overhanging them. Opening a row is shown by the tinted “收合發布” control, not by an inset bar on it. The current work wears the same “目前作品” badge on Publishing as on Works; one label, one appearance.

Two shapes make a boundary look broken rather than drawn. A panel inset inside a tinted card shows its own left and right edges while its bottom runs into the card's padding, so the eye reports a line that stopped; use a rule across the card's content width instead. And a column separator sized to its own content stops partway down the split; stretch the column so its rule spans the whole of it.

“管理發布” opens the article in a **lightbox** over the queue. It used to unfold inside the list, where a chapter of preview between two rows made the queue several screens long and the platforms and “複製內容” scrolled away with it. The lightbox covers the page beside the menu, not the menu: the menu stays usable, and leaving for another view and coming back finds the same article open. Its head carries the title, length and status, ‹ › to step to the neighbouring article in the queue (keeping the platform, since publishing a run of chapters to one platform is what stepping is for), 放大／縮小 and ✕; Esc and a click on the scrim close it, and closing returns focus to the row's “管理發布”. 放大 lifts the same lightbox over the whole site, menu included — still a window with rounded corners on a scrim, 16px from the edges — and the choice is this browser's (`localStorage`, `storyflow.ui.publishLightboxMaximized`). Inside, it is two columns: the manuscript on the left, the versions of it on the right, each scrolling on its own, with the manuscript a page centred in whatever width the window has. The window lays out from its own width through a container query, not the viewport's, so a narrow window — a small screen, or the normal size beside a wide menu — stacks the versions above the manuscript in one scrolling column; on a phone the lightbox is the screen above the bottom bar and has no 放大. A rebuild of the row (a save, a version switch) keeps the size, the scroll position of the same version and the focused control. Picking a version in the rail switches the left column in place; nothing opens over the lightbox but the focused tools (摘要與 Hashtags, 文章圖片, 後記) and the publication record. Row actions such as delete stay in the queue's `⋯`. The rail's first entry is the StoryFlow default output — an absence of platform settings is still a version, and making it an entry means every version is reached the same way. Everything that acts on the selected version — “記錄發布／發布紀錄”, the published toggle, “複製內容” — sits at the foot of the left column, beside the content it is about, held there while the manuscript scrolls, and is never repeated in the rail.

Summary, Hashtags and afterword are available for both longform and visual content; longform-only article-image maintenance remains a separate focused tool because visual images are managed in the visual workspace. Compact “附圖 N 張” and “有後記 N 字” badges expose state without opening those tools. The list-level “預覽” opens the same lightbox on the default output. Publishing titles, title style, shared summary, platform Hashtags and afterword composition appear only once a platform is selected. “附上後記” there is that platform's own choice; the 後記 tool sets the article's default, which platforms without a choice follow, and the rail notes a platform that decided differently. The platform preview combines title controls and content-composition options in one compact settings card; the main body/image preview remains dominant and the panel ends with the primary “複製內容” action.

Copy options belong to one article-and-platform pairing, not to the panel element. The panel is rebuilt by any re-render of the list, so those options live in module state and survive it; leaving a platform and coming back is a fresh decision and resets them.

A control is built in one place. Five modules each filled the platform `<select>` their own way, so its empty option read 預設格式, 預設設定 or StoryFlow 預設格式 depending on which of them rebuilt it last, two read only the built-in platforms and missed any the writer had added, and two refilled it on `focus` and `pointerdown` — the one moment a `<select>` must not be rebuilt, because its options are replaced while the popup is opening. `StoryFlowShared.fillPlatformSelect` is now the only builder, and it runs when the platform list changes, never when someone is reaching for the control.

A value is authored in one place. A visual entry's summary is written about the entry, so it is written in the visual editor beside its title and body and autosaves with them; publishing shows and copies it but does not edit it. Hashtags are not the same case — a platform may override them — so they stay with publishing. The article-level 摘要與 Hashtags tool remains the home for a longform part's summary, which has no editor of its own.

Surfaces that sit side by side agree on their lines. The 作品與章節 and 切篇預覽 heads share one height, so their rules read as one line across the workbench, and both titles sit centred in a row as tall as 切換作品, so they share one top edge too; the split head's buttons sit beside its title, where 切換作品 sits in the source head. Both rails head their list the same way — name and count over the rule the rows start under: “章節清單 N 章” in longform, “圖文清單 N 則” in visual — and the work name above them is an ordinary field in both, not a bold heading in one. Opening 切換作品 changes nothing in the rail: the rail stops clipping so the menu can hang past it, and holds the width its scrollbar gutter reserved so its fields do not widen.

A dialog's head is part of its card: the same paper, and a rule that reaches the card's edge. It was a white band, and a scrollbar gutter the card reserved whether or not it scrolled stopped the rule 15px short. A preview box inside a dialog stops short of the pinned action bar's rule rather than sitting on it. Two text fields stacked in one form read as one kind of field, so 手動建立's chapter title takes the work name's size and weight. The global search head is its own field — no second box or focus ring inside it, and no browser clear cross beside the close cross; its selected result is tinted like any current row rather than boxed, and every result kind wears the same neutral label (green means published, which none of them do).

A scene marker is centred in every rendering of the manuscript: split preview, source preview, Publishing and the reading view. A preview is manuscript on paper everywhere, including the visual entry preview, which used to wear the palette's ochre warning pigment. Settings sections all open the same way — a 16px title over a muted line — and the publishing-format table's default row is a row like the platforms under it, not a box whose top rule bends down at both ends.

Pieces that do the same job agree wherever they appear. Every row menu — chapter, entry, publishing article, work — sets its glyph in one 18px box at one label size. The platform preview's actions sit at the foot of the manuscript column and start where the manuscript box does; they are no longer padded in as a dialog footer. An empty publishing queue says so inside the queue's panel, not in a second box of the same paper within it, and a tool dialog (摘要與 Hashtags, 文章圖片, 後記) is the only frame around its tool, with no heading that restates the dialog's. Where a column stacks on a phone, its separator turns with it: the platform rail above the manuscript parts from it along its bottom edge, and the tools, the 預覽 label, the manuscript and 複製內容 share one left edge. A phone row puts its primary actions whole: Works reads 開啟 | 管理發布 | ⋯ with the chapter disclosure across the next line, and 建立手動作品 puts the secondary actions on one line and 確定新增 across the last. Copy follows the content type: an empty summary on a longform article points to 摘要與 Hashtags, not the visual editor, and the rail says 選一個，預覽就換成它的版本 because on a phone the preview is below it, not to its left.

A tool dialog says each thing once. 後記 and 文章圖片 used to repeat the dialog's own title and its one-line explanation inside the body (後記 said "kept apart from the manuscript" three times); the line under the title now follows the tool's state, so 文章圖片's count changes as images are imported. In the image dialog, the two ways of removing an image sit on the left, the one that deletes the file in the destructive colour, and 保存圖片資訊 alone on the right. Editing a chapter never shows the creation flow's 返回建立方式 or work-name field. A visual entry's scene marker is centred in Publishing like an article's.

Every dialog head runs its rule to the card's edges — the compact dialogs (新增圖文, the visual preview and image dialogs, image removal, recovery) included, which kept theirs inside the card's padding. Closing a publishing tool never drops what was typed in it: 完成, ✕ and Esc all save pending edits to the afterword, the summary and Hashtags, or an image's alt text, caption and placement before the dialog closes, the way the visual editor autosaves; a read-only phone saves nothing on close. The split preferences open under their 切篇偏好 disclosure without repeating the name as a first line.

The visual editor and its entry rail both carry no card. One framed column beside an unframed one is the worst of the two: the framed one ends partway down the page, leaving an edge with nothing on the other side of it. On desktop the rail sits on the ground and the editor on the work column's paper, the same turn the longform workbench makes, and its fields are a page centred on that paper, the width of the split preview's page. The workspace grid already separates the entry rail from the editor, and the editor's fields carry its structure; a frame there would draw a boundary that is drawn twice. The longform workbench keeps its panels, because there the frames separate three different tools rather than enclosing one. Entry rows are drawn like chapter rows: the row owns the hover fill and the rounded current fill, with no separator, and the button inside it owns neither.

The image manager is grouped the way the output is: one group per placement (正文前 / 正文後、後記前 / 後記後), each with its own heading and count, and empty groups are not drawn. Ordering is only meaningful between neighbours that land in the same place, so “上移／下移” move within a group and are disabled at its ends. A row is identified by its stored id, not by the filename it displays — two imports of the same file share one original name. The manager states that copying never carries the image files, permanently and before any image exists, rather than only once there are images to warn about.

Image rows use thumbnail → filename/facts → metadata fields → actions. Alternative text, caption and placement remain visible together; ordering actions stay secondary, “保存圖片資訊” is primary, and removal stays visually quiet until its decision dialog. The dialog makes “只從文章移除” and “備份後刪除檔案” unambiguous. A missing image keeps its row and shows a dashed warning state. Full-size preview uses a modal lightbox rather than opening or exposing a persistent local URL.

Each rail entry states one version and selects it: platform and status first, then any custom title, publication date and URL presence. For both content types, a small summary indicator reveals the optional summary below the icon on hover or keyboard focus without being clipped by the row, and the effective Hashtags string appears under each platform name as a compact click-to-copy control. A rail entry carries no other actions. A button whose visible text names only the action — “取消已發布標記” — still needs an accessible name that says which version it acts on. Platform-specific Hashtags are edited only inside the preview’s bottom optional-information section, where one collapsed editor inherits the common value until explicitly overridden and “沿用共用” removes the override. The record dialog is the only editor for date and URL; the row remains a readable summary rather than an inline form. On narrow screens the actions wrap without horizontal overflow. Publishing filters expose content type (“全部類型／長文／圖文”) separately from status, and every work-group heading repeats its “長文／圖文” badge. Type counts are work counts after the current work selection; status counts remain entry counts. The work, type and status filter controls share the same font size, weight, line height and control height.

## Dialog behavior

- One dialog represents one decision step.
- Every dialog exposes its visible heading as the dialog's accessible name. Dynamic dialogs use the shared UI semantics helper instead of relying on the heading's visual proximity alone; compact surfaces without headings use explicit names (`搜尋 StoryFlow` and `圖片預覽`). A legacy dialog promoted into a page region, such as Settings, must not block global search or other true modal dialogs.
- Visual workbench preview is opened by an explicit “預覽圖文” button instead of occupying the editor canvas. Preview and save actions require clear spacing. The preview body scrolls as one surface; its content card must expand to contain every visual-upload row before optional summary and Hashtags sections begin. Publishing preview uses the same structure for longform and visual content: the default output shows only the main body/image sequence, while a platform's version adds one title-and-composition settings card above it, then optional shared summary and effective platform Hashtags below. Neither content type shows a “預覽／原始 MD” switch or repeats platform metadata above the settings card. In platform previews, optional summary and Hashtags sit below as contained click-to-copy rows with compact trailing “編輯” controls. Both editors use progressive disclosure inside that final section: show the effective value first and reveal one field only after “編輯”. Summary saves the shared optional value; platform Hashtags keep “儲存” plus “沿用共用” adjacent to the field. The edit control must remain inside its row at every supported width.
- A visible `×` close control always has the accessible name `關閉`; task-specific cancel or defer actions keep their own explicit labels.
- Settings is a full application view and is exposed as the named `設定` region, never as a modal dialog after its legacy form is moved into the page. It is a utility rather than a content destination, so the primary navigation stays the three content surfaces (Workspace / Works / Publishing) and desktop reaches Settings from the sidebar utility footer, beside connection status and leave-this-device. A phone has no persistent utility footer, so there and only there Settings is promoted into the five-item bottom bar. Exactly one of the two controls is visible at any width, and breakpoint CSS decides which — never the `hidden` attribute.
- Focus starts at the first missing required field.
- Source chooser → editor → preview are handoffs, so only one dialog is open at a time.
- Closing a creation dialog preserves the existing work and creates nothing.
- Validation happens in place before the dialog advances.
- Manual article creation and chapter editing use the same large dialog dimensions. The textarea flexes to consume the available writing area and owns its scrolling; the action footer closes the card at the bottom. Reducing blank space must never be implemented by shrinking edit mode or leaving an empty region below its footer.
- Split confirmation keeps its bottom “確認完畢，回到切篇” action fully visible when the dialog opens. The three comparison columns own vertical scrolling; the dialog card itself must not require a small final scroll merely to reveal the action.

## Long lists and contextual menus

- The desktop chapter rail owns its vertical scrolling. Selecting a chapter preserves that rail position even when the list rerenders. Chapter rows are 38 px on desktop (`min-width: 821px`) so long works show more of the rail at once; narrow and touch layouts keep the shared 44 px row.
- Opening a chapter overflow menu must not change the source panel from contained scrolling to page-height content. Near the panel bottom, the menu opens upward and remains inside the visible viewport.
- Main workspace content must keep its grid position while the source rail scrolls or a row menu opens.
- Longform and visual modes reuse the same `#workspaceView > .topbar`. Only the page title and mode-specific editing actions change; connection controls stay in the same place, and visual mode relies on its editor autosave status instead of duplicating a page-level save state.
- The desktop source rail and `.workspace-main-column` are independent vertical flows. The right column owns a single-line, at-most-50 px statistics strip and the splitter/editor stack with the shared section gap; a taller source rail must never stretch an empty grid row or push the splitter below the statistics.

## Transient feedback

On a desktop, toasts stack at the top of the content column, between the left-aligned page title and the right-aligned header action; the bottom-right corner they used to occupy is where each page keeps its main action (確認並存成 Markdown, 複製內容, 預覽圖文), and they covered it. On a phone, toasts stack above the mobile navigation and dismiss on a timer, but they overlay the list they are reporting on. A tap or click anywhere on a toast dismisses it immediately so the covered row can be read without waiting out the timer.

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
