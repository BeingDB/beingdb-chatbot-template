#!/usr/bin/env node
// Build the chatbot as a static site in dist/site/:
//   1. compile predicates/ with BeingDB and export the facts for the browser
//   2. copy the page, chatbot.json, the BeingDB WASM runtime and WebLLM next to them
//   3. check chatbot.json against the facts (scripts/check.mjs)
//
// Step 1 needs the `beingdb` command (on PATH, or BEINGDB=/path/to/beingdb),
// built from the BeingDB commit in runtime/runtime.json. The GitHub Action
// builds it for you; see the README to run it on your own computer.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, site } from "./check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BEINGDB = process.env.BEINGDB || "beingdb";

const fail = (msg) => {
  console.error(`build: error: ${msg}`);
  process.exit(1);
};

function run(cmd, args) {
  console.log(`$ ${path.basename(cmd)} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: root });
  if (result.error?.code === "ENOENT")
    fail(`'${cmd}' not found. Install BeingDB (see the README) or set BEINGDB=/path/to/beingdb.`);
  if (result.error) fail(`could not run ${cmd}: ${result.error.message}`);
  if (result.status !== 0) fail(`${path.basename(cmd)} ${args[0]} failed (exit status ${result.status})`);
}

if (!readdirSync(path.join(root, "predicates")).some((f) => f.endsWith(".pl"))) fail("predicates/ has no .pl files");
const webllm = path.join(root, "node_modules/@mlc-ai/web-llm/lib/index.js");
if (!existsSync(webllm)) fail("WebLLM is missing; run 'npm install' first");

rmSync(site, { recursive: true, force: true });
mkdirSync(path.join(site, "data"), { recursive: true });

const work = mkdtempSync(path.join(tmpdir(), "beingdb-chatbot-"));
try {
  run(BEINGDB, ["import", "--input", root, "--git", path.join(work, "git_store")]);
  run(BEINGDB, ["compile", "--git", path.join(work, "git_store"), "--pack", path.join(work, "pack_store")]);
  run(BEINGDB, ["export", "--pack", path.join(work, "pack_store"), "-o", path.join(site, "data", "facts.browser.json")]);
} finally {
  rmSync(work, { recursive: true, force: true });
}

const wasmAssets = readdirSync(path.join(root, "runtime/main.bc.wasm.assets")).filter((f) => f.endsWith(".wasm"));
if (wasmAssets.length !== 1) fail(`expected one .wasm file in runtime/main.bc.wasm.assets, found ${wasmAssets.length}`);
const copies = [
  ["index.html"],
  ["chatbot.json"],
  ...readdirSync(path.join(root, "src")).map((f) => [`src/${f}`]),
  ["runtime/main.bc.wasm.js"],
  [`runtime/main.bc.wasm.assets/${wasmAssets[0]}`],
  [path.relative(root, webllm), "vendor/web-llm/index.js"],
];
for (const [from, to = from] of copies) {
  const dest = path.join(site, to);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(path.join(root, from), dest);
  chmodSync(dest, 0o644);
}
// GitHub Pages: serve the files as they are, without Jekyll.
writeFileSync(path.join(site, ".nojekyll"), "");
const kb = (f) => (statSync(path.join(site, f)).size / 1024).toFixed(0);
console.log(`build: dist/site/ written (facts ${kb("data/facts.browser.json")} KB, BeingDB runtime ${kb(`runtime/main.bc.wasm.assets/${wasmAssets[0]}`)} KB)`);

const problems = await check();
for (const p of problems) console.error(`build: error: ${p}`);
if (problems.length) process.exit(1);
console.log(`build: ok. Preview it with 'npm run serve'.`);
process.exit(0);
