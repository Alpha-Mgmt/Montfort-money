// Offline preview builder: copies src, redirects next/* + supabase to stubs,
// bundles each screen with bun, emits static HTML pages for screenshots.
// Container-only tooling — the real app builds with `npm run build` / Vercel.
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const WORK = path.join(ROOT, "out/work");
const DIST = path.join(ROOT, "out/dist");
const GLOBAL_NM = "/home/claude/.npm-global/lib/node_modules";

fs.rmSync(path.join(ROOT, "out"), { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });

// 1. copy src + stubs
fs.cpSync(path.join(ROOT, "../src"), path.join(WORK, "src"), {
  recursive: true,
});
fs.cpSync(path.join(ROOT, "stubs.tsx"), path.join(WORK, "stubs.tsx"));

// 2. tsconfig with path redirects (bun honors "paths")
fs.writeFileSync(
  path.join(WORK, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        jsx: "react-jsx",
        baseUrl: ".",
        paths: {
          "@/*": ["./src/*"],
          "next/link": ["./stubs.tsx"],
          "next/navigation": ["./stubs.tsx"],
          "@supabase/ssr": ["./stubs.tsx"],
        },
      },
    },
    null,
    2
  )
);

// 3. react resolution via global node_modules
fs.symlinkSync(GLOBAL_NM, path.join(WORK, "node_modules"));

// 4. screens
const screens = [
  { name: "landing", import: "../src/app/page", path: "/", layout: false },
  { name: "login", import: "../src/app/login/page", path: "/login", layout: false },
  { name: "signup", import: "../src/app/signup/page", path: "/signup", layout: false },
  { name: "dashboard", import: "../src/app/app/page", path: "/app", layout: true },
  { name: "transactions", import: "../src/app/app/transactions/page", path: "/app/transactions", layout: true },
  { name: "budgets", import: "../src/app/app/budgets/page", path: "/app/budgets", layout: true },
  { name: "forecast", import: "../src/app/app/forecast/page", path: "/app/forecast", layout: true },
  { name: "tasks", import: "../src/app/app/tasks/page", path: "/app/tasks", layout: true },
  { name: "settings", import: "../src/app/app/settings/page", path: "/app/settings", layout: true },
];

fs.mkdirSync(path.join(WORK, "entries"), { recursive: true });
for (const s of screens) {
  const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import Page from "${s.import}";
${s.layout ? `import AppLayout from "../src/app/app/layout";` : ""}
(globalThis as any).__previewPath = "${s.path}";
const el = document.getElementById("root")!;
createRoot(el).render(${s.layout ? "<AppLayout><Page /></AppLayout>" : "<Page />"});
`;
  fs.writeFileSync(path.join(WORK, `entries/${s.name}.tsx`), entry);
  execSync(
    `bun build entries/${s.name}.tsx --outfile ../dist/${s.name}.js --target browser`,
    { cwd: WORK, stdio: "inherit" }
  );
}

// 5. CSS: globals minus @tailwind lines + generated tw subset
const globals = fs
  .readFileSync(path.join(ROOT, "../src/app/globals.css"), "utf8")
  .replace(/@tailwind [^;]+;/g, "");
execSync(`node ${path.join(ROOT, "twgen.mjs")} ${path.join(ROOT, "../src")} ${path.join(DIST, "tw.css")}`, { stdio: "inherit" });
const tw = fs.readFileSync(path.join(DIST, "tw.css"), "utf8");

const baseCSS = `
:root { --font-display: system-ui; --font-body: system-ui; }
* { box-sizing: border-box; margin: 0; padding: 0; }
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
a { color: inherit; text-decoration: none; }
input, select { font: inherit; }
svg { display: inline-block; vertical-align: middle; }
${globals}
${tw}
`;
fs.writeFileSync(path.join(DIST, "styles.css"), baseCSS);

// 6. HTML shells
for (const s of screens) {
  fs.writeFileSync(
    path.join(DIST, `${s.name}.html`),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="styles.css">
<title>${s.name}</title>
</head>
<body>
<script>window.process={env:{NEXT_PUBLIC_SUPABASE_URL:"http://preview",NEXT_PUBLIC_SUPABASE_ANON_KEY:"preview"}}</script>
<div id="root"></div>
<script src="${s.name}.js"></script>
</body>
</html>`
  );
}
console.log("preview built:", screens.map((s) => s.name).join(", "));
