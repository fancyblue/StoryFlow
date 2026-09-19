# StoryFlow UI system

> 狀態：現行 UI 規範（已落地，持續維護；最後同步：2026-09-01）

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

`node scripts/dead-declarations.mjs` reports declarations that cannot affect anything —
same selector text, same property, both unconditional, one overriding the other by the
recorded order. Cross-file pairs involving that indeterminate tail are excluded.
`--apply` removes them and the rules they empty.

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

Current shared disclosures include workspace work switching, Smart Split preferences, publishing project switching, publishing project filtering and Publishing work-group collapse.

## Action hierarchy

- Primary: the single action that advances or confirms the current task.
- Ghost/secondary: preview, return, cancel or supporting actions.
- Overflow (`⋯`): infrequent row management and destructive actions.
- Close (`×`): dismisses a dialog; in pending creation it also cancels the transaction.

Page-level task order and the resulting primary action are defined in [UX_FLOW.md](UX_FLOW.md). Frequency alone does not justify a solid fill, and a page may change its primary action as the current workflow stage changes.

Do not place a destructive action beside the primary action when an overflow menu can keep the decision hierarchy clearer.

A destructive action must never be the only enabled control in an empty state. When there is nothing to destroy it is disabled, and it must also *render* as disabled: danger controls are selected by id or by a single class, which outranks the shared `.button:disabled` treatment, so the disabled rule is restated at matching specificity in the theme layer. "清除 Google 設定" follows this, staying disabled until integration settings exist.

One action carries one label and one weight wherever it appears. Connecting the StoryFlow folder is reached from the Settings folder card and from the backup centre, so both read "連接資料夾" and both stay outlined; the backup control only proxies the owning card and must not out-emphasize it. Sidebar chrome ranks below navigation: the collapse toggle rests on a translucent fill, never on the `--denim-800` used by an active nav item, so a utility control cannot read as the current destination.

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
| Accent (黛) | `--dai-700` the accent · `--dai-800` hover · `--dai-soft` active fill | Primary and active |
| Pigments | `--vermilion` destructive · `--ochre` warning · `--moss` published | Semantic states |

Three rules hold this together.

**The accent is the only thing that is not paper or ink.** It is what makes a 12%-saturation
purple-grey read as meaningful: nothing else competes with it. The palette it replaced was a
seven-step blue ramp doing three jobs at once — the dark end was body text, the middle was the
primary action, the light end was borders — which is why every screen read as uniformly blue
regardless of what it was trying to say.

**One value per role.** Before this palette the loaded stylesheets held 408 distinct colours,
most of them a few percent of lightness apart: fifteen pale blues for "a surface", a dozen for
"a line". They are now 33, and `npm run test:palette` fails on the thirty-fourth. Adding one is
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
closes up to `gap: 0` so the hairlines are what separate one row from the next. The panel a
list sits inside keeps its frame; the rows inside it do not get one each.

Two rules make this work.

**The row owns the state, not the control inside it.** A chapter row is a title button plus
a `⋯` button. Filling only the button left the state stopping short of the `⋯`, which read
as the row being half-selected. The row carries the fill and the marker, so both reach the
full width.

**The active marker's gutter is reserved on every row.** Each row has
`border-left: 2px solid transparent`, so marking one active colours a border that is already
there instead of adding 2px and pushing every other row's text sideways.

Active is two signals, not one: the accent left marker plus `--dai-soft`. Where a row also
carries a badge naming the state — "目前作品" — the badge lifts to `--paper-1` so the tint it
sits on does not swallow it. The badge is the half of that signal which does not depend on
seeing colour.

### Which hairline

`--rule-1` is for lines drawn **on paper**. `--rule-2` is for lines drawn **on the page
ground**, which is six lightness steps darker: `--rule-1` against it is 1.1:1, which is not a
line anyone can see. The chapter list lives inside a `--paper-1` panel and uses `--rule-1`;
the works list and the statistics strip sit on the ground and use `--rule-2`.

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
| `.sf-disclosure-chevron` | The chevron, pointing the same way for the same state |

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

Longform chapters/articles and visual entries share this rule. Their list-level create action sits below the list, and every editable row keeps a persistent trailing `⋯`. Manual-article and visual-entry menus use the same order: edit first, delete second. A visual entry is deleted as `⋯ → 刪除圖文`; do not add a second destructive button to the editor footer or make Workspace, Works and Publishing use different delete entry points. All entry deletion paths must reach the same confirmation and Recovery guard.

On the Works page, “管理章節／管理圖文” is the most likely next step and uses the same emphasized light-blue treatment on every work card. Both content types use “工作台” for the active work and “開啟” for inactive works; never substitute type-specific open labels for that open action. “管理發布” is a quieter tinted shortcut. The “目前作品” badge and card treatment alone communicate which work is active; action color must not duplicate selection or make identical labels look like different functions. Expanded management uses a stronger soft selection with an inset accent, never a solid primary fill. Manual chapters and visual entries show direct “編輯” plus a persistent trailing `⋯` for Recovery-guarded deletion.

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

A surface gets a frame when it is the thing being read, or when it holds a region that has to read as belonging to one row. Everything between those two is a level in a list, and a level is drawn with a rule and indentation, never a box. Publishing had grown five nested frames between the page and the manuscript — work group, chapter group, article row, preview panel, content — so the text arrived at the bottom of a funnel. It now has two: the expanded row, and the manuscript inside it.

Two shapes make a boundary look broken rather than drawn. A panel inset inside a tinted card shows its own left and right edges while its bottom runs into the card's padding, so the eye reports a line that stopped; use a rule across the card's content width instead. And a column separator sized to its own content stops partway down the split; stretch the column so its rule spans the whole of it.

Expanding “管理發布” is two columns: the manuscript on the left, the versions of it on the right. Picking a version in the rail switches the left column in place; nothing opens over the row that is already open. The rail's first entry is the StoryFlow default output — an absence of platform settings is still a version, and making it an entry means every version is reached the same way. Everything that acts on the selected version — “記錄發布／發布紀錄”, the published toggle, “複製內容” — sits at the foot of the left column, beside the content it is about, and is never repeated in the rail.

Summary, Hashtags and afterword are available for both longform and visual content; longform-only article-image maintenance remains a separate focused tool because visual images are managed in the visual workspace. Compact “附圖 N 張” and “有後記 N 字” badges expose state without opening those tools. The list-level “預覽” selects the default output in that panel rather than opening anything. Publishing titles, title style, shared summary, platform Hashtags and afterword composition appear only once a platform is selected. The platform preview combines title controls and content-composition options in one compact settings card; the main body/image preview remains dominant and the panel ends with the primary “複製內容” action.

Copy options belong to one article-and-platform pairing, not to the panel element. The panel is rebuilt by any re-render of the list, so those options live in module state and survive it; leaving a platform and coming back is a fresh decision and resets them.

A value is authored in one place. A visual entry's summary is written about the entry, so it is written in the visual editor beside its title and body and autosaves with them; publishing shows and copies it but does not edit it. Hashtags are not the same case — a platform may override them — so they stay with publishing. The article-level 摘要與 Hashtags tool remains the home for a longform part's summary, which has no editor of its own.

The visual editor and its entry rail both carry no card. One framed column beside an unframed one is the worst of the two: the framed one ends partway down the page, leaving an edge with nothing on the other side of it. They share the page's ground and one hairline between them, the same shape Publishing uses for a manuscript and its rail. The workspace grid already separates the entry rail from the editor, and the editor's fields carry its structure; a frame there would draw a boundary that is drawn twice. The longform workbench keeps its panels, because there the frames separate three different tools rather than enclosing one. Entry rows follow the same list contract as chapters and works: the row owns the separator, the hover fill and the 2px current marker, and the button inside it owns none of them.

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

Toasts stack above the mobile navigation and dismiss on a timer, but on a phone they overlay the list they are reporting on. A tap or click anywhere on a toast dismisses it immediately so the covered row can be read without waiting out the timer.

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
