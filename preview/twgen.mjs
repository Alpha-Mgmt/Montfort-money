// Minimal offline Tailwind-subset generator for preview screenshots.
// Scans source files for class tokens and emits matching CSS.
// Not a Tailwind replacement — just enough for pixel-honest previews
// in the no-npm cloud container. Unknown classes are reported.
import fs from "fs";
import path from "path";

const SRC = process.argv[2] ?? "../src";
const OUT = process.argv[3] ?? "out/tw.css";

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts|jsx|js)$/.test(f)) files.push(p);
  }
})(SRC);

const tokens = new Set();
const re = /class(?:Name)?\s*[:=]\s*(?:\{?\s*)?[`"']([^`"']+)[`"']/g;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(src))) {
    m[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach((t) => {
        if (!t.includes("${")) tokens.add(t);
      });
  }
}

const SPACING = (n) => {
  if (n === "px") return "1px";
  const v = parseFloat(n);
  return `${v * 0.25}rem`;
};

const SIZES = {
  full: "100%",
  fit: "fit-content",
  screen: "100vh",
  none: "none",
  xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem",
  "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem",
};

const TEXT = {
  xs: ["0.75rem", "1rem"], sm: ["0.875rem", "1.25rem"],
  base: ["1rem", "1.5rem"], lg: ["1.125rem", "1.75rem"],
  xl: ["1.25rem", "1.75rem"], "2xl": ["1.5rem", "2rem"],
  "3xl": ["1.875rem", "2.25rem"], "4xl": ["2.25rem", "2.5rem"],
  "5xl": ["3rem", "1"],
};

const ROUND = {
  "": "0.25rem", sm: "0.125rem", md: "0.375rem", lg: "0.5rem",
  xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", full: "9999px", none: "0",
};

function decls(base) {
  // returns array of [prop, value] or null
  const arb = base.match(/^(.+?)-\[(.+)\]$/);
  const A = arb ? arb[2].replace(/_/g, " ") : null;
  const B = arb ? arb[1] : base;

  const simple = {
    flex: [["display", "flex"]],
    grid: [["display", "grid"]],
    block: [["display", "block"]],
    hidden: [["display", "none"]],
    "inline-block": [["display", "inline-block"]],
    "mt-auto": [["margin-top", "auto"]],
    "overflow-x-auto": [["overflow-x", "auto"]],
    "flex-col": [["flex-direction", "column"]],
    "flex-row": [["flex-direction", "row"]],
    "flex-wrap": [["flex-wrap", "wrap"]],
    "flex-1": [["flex", "1 1 0%"]],
    "shrink-0": [["flex-shrink", "0"]],
    "items-center": [["align-items", "center"]],
    "items-end": [["align-items", "flex-end"]],
    "items-start": [["align-items", "flex-start"]],
    "items-baseline": [["align-items", "baseline"]],
    "justify-between": [["justify-content", "space-between"]],
    "justify-center": [["justify-content", "center"]],
    "place-items-center": [["place-items", "center"]],
    "mx-auto": [["margin-left", "auto"], ["margin-right", "auto"]],
    "min-h-screen": [["min-height", "100vh"]],
    "min-w-0": [["min-width", "0"]],
    "w-full": [["width", "100%"]],
    "w-fit": [["width", "fit-content"]],
    "h-full": [["height", "100%"]],
    truncate: [["overflow", "hidden"], ["text-overflow", "ellipsis"], ["white-space", "nowrap"]],
    "overflow-y-auto": [["overflow-y", "auto"]],
    "overflow-hidden": [["overflow", "hidden"]],
    "text-center": [["text-align", "center"]],
    "text-left": [["text-align", "left"]],
    "text-right": [["text-align", "right"]],
    "font-medium": [["font-weight", "500"]],
    "font-semibold": [["font-weight", "600"]],
    "font-bold": [["font-weight", "700"]],
    "leading-tight": [["line-height", "1.25"]],
    "leading-relaxed": [["line-height", "1.625"]],
    "tracking-tight": [["letter-spacing", "-0.025em"]],
    "tracking-wide": [["letter-spacing", "0.025em"]],
    uppercase: [["text-transform", "uppercase"]],
    capitalize: [["text-transform", "capitalize"]],
    underline: [["text-decoration-line", "underline"]],
    "line-through": [["text-decoration-line", "line-through"]],
    "underline-offset-4": [["text-underline-offset", "4px"]],
    fixed: [["position", "fixed"]],
    absolute: [["position", "absolute"]],
    relative: [["position", "relative"]],
    "inset-0": [["inset", "0"]],
    "border-t-0": [["border-top-width", "0"]],
    "border-0": [["border-width", "0"]],
    "border-l": [["border-left-width", "1px"], ["border-left-style", "solid"], ["border-left-color", "var(--border)"]],
    border: [["border-width", "1px"], ["border-style", "solid"], ["border-color", "var(--border)"]],
    "border-2": [["border-width", "2px"], ["border-style", "solid"], ["border-color", "var(--border)"]],
    "divide-y": [], // handled via selector below
    "rounded-b-none": [["border-bottom-left-radius", "0"], ["border-bottom-right-radius", "0"]],
    "font-display": [["font-family", "var(--font-display), system-ui, sans-serif"]],
    "font-body": [["font-family", "var(--font-body), system-ui, sans-serif"]],
    "font-normal": [["font-weight", "400"]],
    "w-auto": [["width", "auto"]],
    "pointer-events-none": [["pointer-events", "none"]],
    "top-1/2": [["top", "50%"]],
    "-translate-y-1/2": [["transform", "translateY(-50%)"]],
    "w-fit": [["width", "fit-content"]],
    "whitespace-pre-wrap": [["white-space", "pre-wrap"]],
    "max-h-80": [["max-height", "20rem"]],
    "animate-spin": [["animation", "twspin 1s linear infinite"]],
    "justify-end": [["justify-content", "flex-end"]],
    "shadow-lg": [["box-shadow", "0 10px 30px rgba(0,0,0,0.3)"]],
    "border-b": [
      ["border-bottom-width", "1px"],
      ["border-bottom-style", "solid"],
      ["border-bottom-color", "var(--border)"],
    ],
    "border-t": [
      ["border-top-width", "1px"],
      ["border-top-style", "solid"],
      ["border-top-color", "var(--border)"],
    ],
    "overflow-hidden": [["overflow", "hidden"]],
  };
  if (simple[base]) return simple[base];

  let m;
  if ((m = B.match(/^(-?)(m|p)(t|b|l|r|x|y)?$/)) && A) {
    return dirDecls(m[2] === "m" ? "margin" : "padding", m[3], A, m[1] === "-");
  }
  if ((m = base.match(/^(-?)(m|p)(t|b|l|r|x|y)?-(\d+(?:\.\d+)?|px)$/))) {
    return dirDecls(m[2] === "m" ? "margin" : "padding", m[3], SPACING(m[4]), m[1] === "-");
  }
  if ((m = base.match(/^gap-(\d+(?:\.\d+)?)$/))) return [["gap", SPACING(m[1])]];
  if ((m = base.match(/^gap-x-(\d+(?:\.\d+)?)$/))) return [["column-gap", SPACING(m[1])]];
  if ((m = base.match(/^gap-y-(\d+(?:\.\d+)?)$/))) return [["row-gap", SPACING(m[1])]];
  if ((m = base.match(/^grid-cols-(\d+)$/)))
    return [["grid-template-columns", `repeat(${m[1]}, minmax(0, 1fr))`]];
  if ((m = base.match(/^col-span-(\d+)$/)))
    return [["grid-column", `span ${m[1]} / span ${m[1]}`]];
  if (B === "grid-cols" && A) return [["grid-template-columns", A]];
  if ((m = base.match(/^(w|h)-(\d+(?:\.\d+)?|px)$/)))
    return [[m[1] === "w" ? "width" : "height", SPACING(m[2])]];
  if ((m = base.match(/^min-w-(\d+(?:\.\d+)?)$/)))
    return [["min-width", SPACING(m[1])]];
  if ((m = base.match(/^(top|left|right|bottom)-(\d+(?:\.\d+)?)$/)))
    return [[m[1], SPACING(m[2])]];
  if (base === "transition-colors" || base === "transition-all")
    return [["transition", "all 0.15s ease"]];
  if ((m = base.match(/^max-w-(\w+)$/)) && SIZES[m[1]])
    return [["max-width", SIZES[m[1]]]];
  if (B === "max-h" && A) return [["max-height", A]];
  if (B === "max-w" && A) return [["max-width", A]];
  if (B === "w" && A) return [["width", A]];
  if (B === "h" && A) return [["height", A]];
  if ((m = base.match(/^text-(\w+)$/)) && TEXT[m[1]])
    return [["font-size", TEXT[m[1]][0]], ["line-height", TEXT[m[1]][1]]];
  if ((m = base.match(/^rounded(?:-(.+))?$/)) && ROUND[m[1] ?? ""] !== undefined)
    return [["border-radius", ROUND[m[1] ?? ""]]];
  if (B === "rounded-b" && A)
    return [["border-bottom-left-radius", A], ["border-bottom-right-radius", A]];
  if ((m = base.match(/^z-(\d+)$/))) return [["z-index", m[1]]];
  if ((m = base.match(/^opacity-(\d+)$/)))
    return [["opacity", String(Number(m[1]) / 100)]];
  return null;
}

function dirDecls(prop, dir, val, neg) {
  const v = neg ? `-${val}` : val;
  switch (dir) {
    case "t": return [[`${prop}-top`, v]];
    case "b": return [[`${prop}-bottom`, v]];
    case "l": return [[`${prop}-left`, v]];
    case "r": return [[`${prop}-right`, v]];
    case "x": return [[`${prop}-left`, v], [`${prop}-right`, v]];
    case "y": return [[`${prop}-top`, v], [`${prop}-bottom`, v]];
    default: return [[prop, v]];
  }
}

function esc(cls) {
  return cls.replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
}

let css = "@keyframes twspin { to { transform: rotate(360deg); } }\n";
const unknown = [];
for (const t of [...tokens].sort()) {
  let variant = null;
  let base = t;
  const vm = t.match(/^(sm|md|lg|xl|hover|first|last|focus):(.+)$/);
  if (vm) {
    variant = vm[1];
    base = vm[2];
  }
  const important = base.startsWith("!");
  if (important) base = base.slice(1);

  if (base === "divide-y") {
    css += `.${esc(t)} > * + * { border-top: 1px solid var(--border); }\n`;
    continue;
  }

  const d = decls(base);
  if (!d) {
    // custom component classes (card, btn, …) live in globals.css — skip silently
    const custom = /^(card|card-soft|btn|btn-primary|btn-ghost|btn-danger|input|label|chip|muted|faint|progress-track|progress-fill|warn|over|divider|tabbar|active|text-grad|theme-light)$/;
    if (!custom.test(base)) unknown.push(t);
    continue;
  }
  if (d.length === 0) continue;

  const body = d
    .map(([p, v]) => `${p}: ${v}${important ? " !important" : ""};`)
    .join(" ");
  let sel = `.${esc(t)}`;
  let rule;
  if (variant === "hover") rule = `${sel}:hover { ${body} }`;
  else if (variant === "focus") rule = `${sel}:focus { ${body} }`;
  else if (variant === "first") rule = `${sel}:first-child { ${body} }`;
  else if (variant === "last") rule = `${sel}:last-child { ${body} }`;
  else if (variant === "sm") rule = `@media (min-width: 640px) { ${sel} { ${body} } }`;
  else if (variant === "md") rule = `@media (min-width: 768px) { ${sel} { ${body} } }`;
  else if (variant === "lg") rule = `@media (min-width: 1024px) { ${sel} { ${body} } }`;
  else if (variant === "xl") rule = `@media (min-width: 1280px) { ${sel} { ${body} } }`;
  else rule = `${sel} { ${body} }`;
  css += rule + "\n";
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, css);
console.log(`tw.css: ${[...tokens].length} tokens, ${unknown.length} unknown`);
if (unknown.length) console.log("UNKNOWN:", unknown.join(" "));
