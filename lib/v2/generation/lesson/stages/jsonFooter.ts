/** Appended to every stage user message so JSON rules sit next to the ask. */
export const USER_JSON_FOOTER = `
JSON OUTPUT (mandatory — reply with nothing else)
- ONE JSON object only. No markdown fences. No commentary before or after.
- Double-quoted keys and strings. No trailing commas. Escape " inside strings as \\".
- Finish every array and object. Do not truncate.
`.trim();

export function withJsonFooter(body: string): string {
  return `${body.trim()}

${USER_JSON_FOOTER}`;
}
