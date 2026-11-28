/**
 * Page translator for Hindi mode. Many components render English text directly (not through t()),
 * so while Hindi is on this walks the page and swaps every English text node, placeholder, label
 * and tooltip for its Hindi version, and keeps doing so as React updates the page. Switching back
 * to English restores the original text.
 *
 * Matching, in order: the whole text → the text without surrounding punctuation → each part of
 * "A · B", "A: B" or "A — B" → "{name}"-style patterns → known phrases inside the text. Dates and
 * times ("Sat, 28 Nov, 6:30 am") get Hindi day and month names. Names, numbers, codes and anything
 * people typed (inputs, text areas) are left as they are. Mark an element data-no-translate to skip it.
 */

const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG", "svg"]);
const SEPARATORS = [" · ", ": ", " — ", " – ", " | ", " + ", ", "];
const EDGE = /^([\s·•,:;.!?—–\-()[\]"“”'‘’…→←★₹#]*)(.*?)([\s·•,:;.!?—–\-()[\]"“”'‘’…→←★]*)$/s;
const DAYS: Record<string, string> = { Mon: "सोम", Tue: "मंगल", Wed: "बुध", Thu: "गुरु", Fri: "शुक्र", Sat: "शनि", Sun: "रवि" };
const MONTHS: Record<string, string> = { Jan: "जन॰", Feb: "फ़र॰", Mar: "मार्च", Apr: "अप्रैल", May: "मई", Jun: "जून", Jul: "जुलाई", Aug: "अग॰", Sep: "सित॰", Sept: "सित॰", Oct: "अक्तू॰", Nov: "नव॰", Dec: "दिस॰" };
const UNITS: Record<string, string> = { pincode: "पिनकोड", session: "सत्र", day: "दिन", review: "समीक्षा", credit: "क्रेडिट", item: "आइटम", year: "वर्ष", yr: "वर्ष", order: "ऑर्डर", plan: "प्लान", pack: "पैक" };
/** Single words are only replaced inside longer text when they are state names (never people's or shop names). */
const STATES = new Set(["Assam", "Bihar", "Goa", "Gujarat", "Haryana", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Telangana", "Tripura", "Uttarakhand", "Chhattisgarh"]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createTranslator(dict: Record<string, string>) {
  // "{name}" entries become patterns; multi-word entries are also searched for inside longer text.
  const patterns: { re: RegExp; out: string; names: string[] }[] = [];
  const phrases: string[] = [];
  for (const [en, hi] of Object.entries(dict)) {
    if (/\{\w+\}/.test(en)) {
      const names: string[] = [];
      const re = new RegExp("^" + en.split(/(\{\w+\})/).map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (m) { names.push(m[1]); return "([^·|—]+?)"; }
        return escape(part);
      }).join("") + "$", "s");
      patterns.push({ re, out: hi, names });
    } else if ((/[^A-Za-z]/.test(en) && (en.length >= 10 || /[^A-Za-z\s]/.test(en))) || STATES.has(en)) {
      phrases.push(en);
    }
  }
  phrases.sort((a, b) => b.length - a.length);
  const phraseRe = phrases.length
    ? new RegExp(phrases.map((p) => `${/^[A-Za-z]/.test(p) ? "(?<![A-Za-z])" : ""}${escape(p)}${/[A-Za-z]$/.test(p) ? "(?![A-Za-z])" : ""}`).join("|"), "g")
    : null;

  const lower = new Map(Object.entries(dict).map(([en, hi]) => [en.toLowerCase(), hi]));
  const exact = (s: string): string | undefined => {
    const hit = dict[s] ?? lower.get(s.toLowerCase());
    if (hit !== undefined) return hit;
    for (const p of patterns) {
      const m = p.re.exec(s);
      if (m) return p.names.reduce((out, name, i) => out.replace(`{${name}}`, m[i + 1]), p.out);
    }
    return undefined;
  };

  const dates = (s: string) =>
    /\d/.test(s)
      ? s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, (d) => DAYS[d])
          .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b/g, (m) => MONTHS[m])
          .replace(/(\d)\s?(am|AM)\b/g, "$1 पूर्वाह्न").replace(/(\d)\s?(pm|PM)\b/g, "$1 अपराह्न")
          .replace(/\b(\d+)\s?min\b/g, "$1 मिनट").replace(/\b(\d+)\s?hrs?\b/g, "$1 घंटे")
          .replace(/\bUpdated (\d+)s ago\b/g, "$1 सेकंड पहले अपडेट हुआ")
          .replace(/\b(\d+) (pincodes?|sessions?|days?|reviews?|credits?|items?|years?|yrs|orders?|plans?|packs?)\b/g, (_, n: string, u: string) => `${n} ${UNITS[u.replace(/s$/, "")] ?? u}`)
      : s;

  /** Hindi for one piece of text, or null when nothing in it is known. */
  function translate(text: string, depth = 0): string | null {
    const s = text.replace(/\s+/g, " ").trim();
    if (!s || !/[A-Za-z]/.test(s)) return null;
    const direct = exact(s);
    if (direct !== undefined) return direct;
    const [, pre, core, post] = EDGE.exec(s) ?? ["", "", s, ""];
    if (core && core !== s) {
      const inner = exact(core);
      if (inner !== undefined) return pre + inner + post;
    }
    const latin = (x: string) => (x.match(/[A-Za-z]/g) ?? []).length;
    // Known phrases inside the whole text.
    const dated = dates(s);
    let changed = dated !== s;
    const whole = phraseRe ? dated.replace(phraseRe, (m) => { changed = true; return dict[m]; }) : dated;
    let best: string | null = changed ? whole : null;
    // Each part of "A · B", "A: B"…; keep whichever leaves less English.
    if (depth < 3) {
      for (const sep of SEPARATORS) {
        if (!s.includes(sep)) continue;
        const parts = s.split(sep);
        let any = false, out = "";
        parts.forEach((p, i) => {
          const last = i === parts.length - 1;
          const withSep = last ? undefined : exact(p.trim() + sep.trimEnd());
          if (withSep !== undefined) { any = true; out += withSep + " "; return; }
          const t = translate(p, depth + 1);
          if (t !== null) any = true;
          out += (t ?? dates(p)) + (last ? "" : sep);
        });
        if (any && (best === null || latin(out) < latin(best))) best = out;
        break;
      }
    }
    return best;
  }

  // Original English for everything we changed, so switching back restores it.
  const textOrig = new WeakMap<Text, { en: string; hi: string }>();
  const attrOrig = new WeakMap<Element, Map<string, { en: string; hi: string }>>();
  const touchedText = new Set<WeakRef<Text>>();
  const touchedEls = new Set<WeakRef<Element>>();
  let observer: MutationObserver | null = null;
  let titleEn: string | null = null;

  const skipped = (el: Element | null): boolean => {
    for (let e = el; e; e = e.parentElement) {
      if (SKIP.has(e.tagName) || e.hasAttribute("data-no-translate") || e.getAttribute("translate") === "no" || (e as HTMLElement).isContentEditable) return true;
    }
    return false;
  };

  function doText(node: Text) {
    const prev = textOrig.get(node);
    if (prev && node.data === prev.hi) return; // our own change
    if (skipped(node.parentElement)) return;
    const hi = translate(node.data);
    if (hi === null) return;
    const lead = /^\s*/.exec(node.data)![0], trail = /\s*$/.exec(node.data)![0];
    const value = lead + hi + trail;
    textOrig.set(node, { en: node.data, hi: value });
    touchedText.add(new WeakRef(node));
    node.data = value;
  }

  const attrSkipped = (el: Element): boolean => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      if (e.hasAttribute("data-no-translate") || e.getAttribute("translate") === "no" || (e as HTMLElement).isContentEditable) return true;
    }
    return false;
  };

  function doAttrs(el: Element) {
    if (attrSkipped(el)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const map = attrOrig.get(el);
      if (map?.get(a)?.hi === v) continue;
      const hi = translate(v);
      if (hi === null) continue;
      const m = map ?? new Map();
      m.set(a, { en: v, hi });
      if (!map) { attrOrig.set(el, m); touchedEls.add(new WeakRef(el)); }
      el.setAttribute(a, hi);
    }
  }

  function walk(root: Node) {
    if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (SKIP.has(el.tagName)) { doAttrs(el); return; }
    doAttrs(el);
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      // Look inside skipped elements only for their own attributes (e.g. an input's placeholder).
      acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE || !SKIP.has(n.parentElement?.tagName ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
      else doAttrs(n as Element);
    }
  }

  function doTitle() {
    const t = document.title;
    const hi = translate(t);
    if (hi !== null && hi !== t) { titleEn = t; document.title = hi; }
  }

  return {
    start() {
      if (observer || typeof document === "undefined") return;
      walk(document.body);
      doTitle();
      observer = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "characterData") doText(r.target as Text);
          else if (r.type === "attributes") doAttrs(r.target as Element);
          else r.addedNodes.forEach(walk);
          if (r.target.nodeName === "TITLE" || r.target.parentNode?.nodeName === "TITLE") doTitle();
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
      const title = document.querySelector("title");
      if (title) observer.observe(title, { subtree: true, childList: true, characterData: true });
    },
    stop() {
      observer?.disconnect(); observer = null;
      for (const ref of touchedText) {
        const n = ref.deref(); const o = n && textOrig.get(n);
        if (n && o && n.data === o.hi) n.data = o.en;
        if (n) textOrig.delete(n);
      }
      for (const ref of touchedEls) {
        const el = ref.deref(); const m = el && attrOrig.get(el);
        if (el && m) for (const [a, o] of m) if (el.getAttribute(a) === o.hi) el.setAttribute(a, o.en);
        if (el) attrOrig.delete(el);
      }
      touchedText.clear(); touchedEls.clear();
      if (titleEn !== null) { document.title = titleEn; titleEn = null; }
    },
    translate,
  };
}
