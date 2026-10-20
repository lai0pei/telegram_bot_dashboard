import { escapeFor, usesPlaceholders } from "./templates";

/**
 * A tiny formatter for the dashboard's Telegram preview: Telegram's HTML subset and MarkdownV2 become a tree of
 * nodes that the preview renders as React elements. It never produces HTML, links carry no `href` and the preview
 * makes nothing clickable, so user-written text can't inject markup or a `javascript:` URL. Unknown or unbalanced
 * markup is kept as literal text, which is also roughly what the user will want to notice and fix.
 */
export type FormatTag = "b" | "i" | "u" | "s" | "code" | "pre" | "a" | "spoiler" | "quote";
export type FormatNode = string | { tag: FormatTag; children: FormatNode[] };

interface Frame {
  tag: FormatTag | "emoji" | null;
  /** The source text that opened it, restored as literal text if it is never closed. */
  open: string;
  children: FormatNode[];
}

const HTML_TAGS: Record<string, FormatTag | "emoji"> = {
  b: "b",
  strong: "b",
  i: "i",
  em: "i",
  u: "u",
  ins: "u",
  s: "s",
  strike: "s",
  del: "s",
  code: "code",
  pre: "pre",
  a: "a",
  "tg-spoiler": "spoiler",
  blockquote: "quote",
  "tg-emoji": "emoji",
};

const decodeEntities = (s: string) => s.replace(/&(amp|lt|gt|quot);/g, (_m, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"' })[name]!);

function closeAll(stack: Frame[]): FormatNode[] {
  // Unclosed formatting is shown as the literal text that started it.
  while (stack.length > 1) {
    const frame = stack.pop()!;
    stack[stack.length - 1].children.push(frame.open, ...frame.children);
  }
  return stack[0].children;
}

function parseHtml(src: string): FormatNode[] {
  const stack: Frame[] = [{ tag: null, open: "", children: [] }];
  const top = () => stack[stack.length - 1];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^<>]*)?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const text = (s: string) => {
    if (s) top().children.push(decodeEntities(s));
  };
  while ((m = re.exec(src))) {
    text(src.slice(last, m.index));
    last = re.lastIndex;
    const [whole, closing, rawName, attrs] = m;
    const name = rawName.toLowerCase();
    let mapped: FormatTag | "emoji" | undefined;
    if (name === "span") {
      // <span class="tg-spoiler"> is Telegram's other spelling of a spoiler; a </span> closes one only if it opened here.
      mapped = closing ? (top().open.toLowerCase().startsWith("<span") ? "spoiler" : undefined) : /tg-spoiler/.test(attrs) ? "spoiler" : undefined;
    } else {
      mapped = HTML_TAGS[name];
    }
    if (!mapped) {
      text(whole);
    } else if (!closing) {
      stack.push({ tag: mapped, open: whole, children: [] });
    } else if (stack.length > 1 && top().tag === mapped) {
      const frame = stack.pop()!;
      // <tg-emoji> only carries a custom emoji id; its fallback emoji is the content.
      top().children.push(...(mapped === "emoji" ? frame.children : [{ tag: mapped, children: frame.children } as FormatNode]));
    } else {
      text(whole);
    }
  }
  text(src.slice(last));
  return closeAll(stack);
}

const MARKERS: { token: string; tag: FormatTag }[] = [
  { token: "||", tag: "spoiler" },
  { token: "__", tag: "u" },
  { token: "*", tag: "b" },
  { token: "_", tag: "i" },
  { token: "~", tag: "s" },
];

const unescapeMd = (s: string) => s.replace(/\\(.)/g, "$1");

function findUnescaped(s: string, char: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === char) return i;
  }
  return -1;
}

function parseMarkdownInline(s: string): FormatNode[] {
  const stack: Frame[] = [{ tag: null, open: "", children: [] }];
  const top = () => stack[stack.length - 1];
  let buf = "";
  const flush = () => {
    if (buf) top().children.push(buf);
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (s.startsWith("```", i)) {
      const end = s.indexOf("```", i + 3);
      if (end > 0) {
        flush();
        top().children.push({ tag: "pre", children: [unescapeMd(s.slice(i + 3, end).replace(/^[A-Za-z0-9+#-]*\n/, ""))] });
        i = end + 3;
        continue;
      }
    }
    if (c === "`") {
      const end = findUnescaped(s, "`", i + 1);
      if (end > 0) {
        flush();
        top().children.push({ tag: "code", children: [unescapeMd(s.slice(i + 1, end))] });
        i = end + 1;
        continue;
      }
    }
    if (c === "[") {
      const close = s.indexOf("](", i + 1);
      const end = close >= 0 ? findUnescaped(s, ")", close + 2) : -1;
      if (close >= 0 && end >= 0) {
        flush();
        top().children.push({ tag: "a", children: parseMarkdownInline(s.slice(i + 1, close)) });
        i = end + 1;
        continue;
      }
    }
    const marker = MARKERS.find((m) => s.startsWith(m.token, i));
    if (marker) {
      flush();
      const frame = top();
      if (frame.tag === marker.tag && stack.length > 1) {
        stack.pop();
        top().children.push({ tag: marker.tag, children: frame.children });
      } else {
        stack.push({ tag: marker.tag, open: marker.token, children: [] });
      }
      i += marker.token.length;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return closeAll(stack);
}

function parseMarkdown(src: string): FormatNode[] {
  // Consecutive lines starting with ">" form one block quote; the rest is inline text.
  const out: FormatNode[] = [];
  const lines = src.split("\n");
  for (let n = 0; n < lines.length; ) {
    if (lines[n].startsWith(">")) {
      const quoted: string[] = [];
      while (n < lines.length && lines[n].startsWith(">")) quoted.push(lines[n++].slice(1).replace(/^ /, ""));
      out.push({ tag: "quote", children: parseMarkdownInline(quoted.join("\n")) });
    } else {
      const plain: string[] = [];
      while (n < lines.length && !lines[n].startsWith(">")) plain.push(lines[n++]);
      out.push(...parseMarkdownInline(plain.join("\n")), n < lines.length ? "\n" : "");
    }
  }
  return out;
}

export function formatPreview(text: string, mode: "HTML" | "MarkdownV2" | "" | null | undefined): FormatNode[] {
  if (mode === "HTML") return parseHtml(text);
  if (mode === "MarkdownV2") return parseMarkdown(text);
  return [text];
}

/** What `{placeholders}` show in the preview. */
export const SAMPLE_PERSON = { first_name: "Alex", last_name: "Morgan", username: "@alex", user_id: "123456789", payload: "promo" };

/** Synchronous stand-in for the server's `renderTemplate`: fills the placeholders with sample values, escaped for the mode. */
export function fillSample(text: string, mode: "HTML" | "MarkdownV2" | "" | null | undefined, commands: { command: string; description: string }[]): string {
  if (!usesPlaceholders(text)) return text;
  const m = mode || null;
  const list = commands.map((c) => escapeFor(`/${c.command} - ${c.description}`, m)).join("\n");
  return text.replace(/\{(first_name|last_name|username|user_id|payload|commands)\}/g, (_x, key: keyof typeof SAMPLE_PERSON | "commands") =>
    key === "commands" ? list : escapeFor(SAMPLE_PERSON[key], m)
  );
}
