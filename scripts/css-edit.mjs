// Shared by the scripts that remove CSS: once a rule or declaration is cut out, the
// whitespace on either side of the cut meets. Collapse that run to what a hand edit would
// leave — one blank line between blocks, none just inside a brace — so a removal reads as
// a removal and not as a gap.
export function tidyJunction(text, position) {
  let start = position;
  let end = position;
  while (start > 0 && /\s/.test(text[start - 1])) start -= 1;
  while (end < text.length && /\s/.test(text[end])) end += 1;
  const run = text.slice(start, end);
  const newlines = (run.match(/\n/g) || []).length;
  const indent = run.slice(run.lastIndexOf('\n') + 1);
  let replacement;
  if (start === 0) replacement = '';
  else if (end === text.length) replacement = '\n';
  else if (text[start - 1] === '{' || text[end] === '}') replacement = `\n${indent}`;
  else replacement = `\n\n${indent}`;
  if (newlines <= (replacement.match(/\n/g) || []).length) return text;
  return text.slice(0, start) + replacement + text.slice(end);
}
