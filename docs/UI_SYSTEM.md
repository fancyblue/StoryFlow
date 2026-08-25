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

## Dialog behavior

- One dialog represents one decision step.
- Focus starts at the first missing required field.
- Source chooser → editor → preview are handoffs, so only one dialog is open at a time.
- Closing a creation dialog preserves the existing work and creates nothing.
- Validation happens in place before the dialog advances.

## Responsive scope

Desktop Chrome is the primary work environment. Controls still need to wrap safely at narrow widths, but mobile should preserve essential reading and recovery rather than duplicate every dense desktop composition.

On phones, the main surface shows only a compact amber “唯讀” state label (or blue “可編輯” while the current session is unlocked). Explanation and the two-way editing switch live in the full Settings page under “手機使用模式”; the control becomes full-width at narrow widths. Mutating controls look unavailable while read-only; folder reconnect, settings import, navigation, filters and preview remain usable. Hide the normal workspace save copy while read-only so it cannot imply a completed save or cloud sync.
