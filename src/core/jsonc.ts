/**
 * JSONC to JSON: blanks out `//` and `/* *\/` comments and trailing commas outside
 * strings. Replaced characters become spaces (newlines are kept), so JSON.parse
 * error positions still point into the original text.
 */
export function stripJsonc(text: string): string {
  const out = text.split("");
  let lastComma = -1;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      lastComma = -1;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      i++;
    } else if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      const to = end === -1 ? text.length : end;
      blank(i, to);
      i = to;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const to = end === -1 ? text.length : end + 2;
      blank(i, to);
      i = to;
    } else {
      if ((c === "}" || c === "]") && lastComma !== -1) out[lastComma] = " ";
      if (!/\s/.test(c)) lastComma = c === "," ? i : -1;
      i++;
    }
  }
  return out.join("");
}
