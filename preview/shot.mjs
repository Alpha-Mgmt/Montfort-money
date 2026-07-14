// Screenshot every preview screen in dark + light themes (mobile viewport).
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.join(ROOT, "out/dist");
const SHOTS = path.join(ROOT, "out/shots");
fs.mkdirSync(SHOTS, { recursive: true });

const screens = fs
  .readdirSync(DIST)
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.replace(".html", ""));

const browser = await chromium.launch();

const errors = [];

async function capture(page, suffix) {
  for (const s of screens) {
    await page.goto(`file://${DIST}/${s}.html`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${s}-${suffix}-dark.png`, fullPage: true });
    await page.evaluate(() =>
      document.documentElement.classList.add("theme-light")
    );
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}/${s}-${suffix}-light.png`, fullPage: true });
    await page.evaluate(() =>
      document.documentElement.classList.remove("theme-light")
    );
    console.log(`shot: ${s} (${suffix})`);
  }
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
mobile.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
mobile.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
await capture(mobile, "mobile");

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desktop.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
desktop.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
await capture(desktop, "desktop");

await browser.close();
if (errors.length) {
  console.log("\nJS ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("all screens rendered without JS errors");
