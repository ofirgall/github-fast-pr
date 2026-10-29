// linguist-generated rules from .gitattributes, matched the way git matches attribute patterns.

export const GITATTRIBUTES_PATH = ".gitattributes";
const ATTR = "linguist-generated";

export interface GeneratedRule {
  pattern: string;
  generated: boolean;
}

/** The pattern at the start of a line, unquoting a C-style quoted one; null when malformed. */
function splitPattern(line: string): { pattern: string; rest: string } | null {
  if (!line.startsWith('"')) {
    const m = /^(\S+)\s*(.*)$/.exec(line);
    return m ? { pattern: m[1], rest: m[2] } : null;
  }
  let out = "";
  for (let i = 1; i < line.length; i++) {
    const c = line[i];
    if (c === "\\" && i + 1 < line.length) out += line[++i];
    else if (c === '"') return { pattern: out, rest: line.slice(i + 1).trim() };
    else out += c;
  }
  return null;
}

/** Lines that set or unset linguist-generated, in file order. */
export function parseGenerated(text: string): GeneratedRule[] {
  const rules: GeneratedRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("[attr]")) continue;
    const parts = splitPattern(line);
    // Git rejects negative patterns; a trailing slash never matches a file.
    if (!parts || parts.pattern.startsWith("!") || parts.pattern.endsWith("/")) continue;
    let generated: boolean | null = null;
    for (const a of parts.rest.split(/\s+/)) {
      if (a === ATTR || a === `${ATTR}=true`) generated = true;
      else if (a === `-${ATTR}` || a === `!${ATTR}` || a === `${ATTR}=false`) generated = false;
    }
    if (generated !== null) rules.push({ pattern: parts.pattern, generated });
  }
  return rules;
}

const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Git wildmatch (pathname mode): `*` and `?` stay within a segment, `**` spans them. */
export function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.includes("/");
  const p = pattern.startsWith("/") ? pattern.slice(1) : pattern;
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*") {
      const atStart = i === 0 || p[i - 1] === "/";
      const after = p[i + 2];
      if (atStart && after === "/") {
        re += "(?:.*/)?";
        i += 2;
        continue;
      }
      if (atStart && after === undefined) {
        re += ".+";
        i += 1;
        continue;
      }
      re += "[^/]*";
      i += 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[") {
      const end = p.indexOf("]", i + 2);
      if (end === -1) {
        re += "\\[";
        continue;
      }
      let body = p.slice(i + 1, end);
      const neg = body.startsWith("!") || body.startsWith("^");
      if (neg) body = body.slice(1);
      re += `[${neg ? "^" : ""}${body.replace(/[\\\]]/g, "\\$&")}]`;
      i = end;
    } else if (c === "\\" && i + 1 < p.length) re += escape(p[++i]);
    else re += escape(c);
  }
  return new RegExp(`${anchored ? "^" : "(?:^|/)"}${re}$`);
}

/** Whether a path is generated: the last matching rule wins, unmatched is not generated. */
export function compileGenerated(rules: GeneratedRule[]): (path: string) => boolean {
  const compiled = rules.map((r) => ({ re: patternToRegex(r.pattern), generated: r.generated }));
  return (path) => {
    let out = false;
    for (const r of compiled) if (r.re.test(path)) out = r.generated;
    return out;
  };
}
