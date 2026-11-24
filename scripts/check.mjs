// Check chatbot.json against the built facts, using the same BeingDB WASM
// runtime as the page (in Node, no model): every example query must run and
// return rows. Run by `npm run build`; `npm run check` re-runs it on dist/site/.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wrapBeingDB } from "../src/beingdb.js";
import { buildSchema } from "../src/schema.js";
import { buildPrompt } from "../src/prompt.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const site = path.join(root, "dist", "site");

// Above this the prompt crowds a small model's context window (about 4,000 tokens).
const PROMPT_WARN_CHARS = 9000;

function loadRuntime(dataFile) {
  // runtime/package.json marks the loader as CommonJS for Node.
  const wasmDir = path.join(root, "runtime");
  return new Promise((resolve, reject) => {
    globalThis.onBeingDBReady = (BeingDB) => {
      const summary = JSON.parse(BeingDB.load(readFileSync(dataFile, "utf8")));
      if (summary.error) reject(new Error(summary.error.message));
      else resolve({ db: wrapBeingDB(BeingDB), summary });
    };
    // In Node the wasm_of_ocaml loader resolves its assets next to require.main.
    process.mainModule = { filename: path.join(wasmDir, "main.bc.wasm.js") };
    createRequire(import.meta.url)(path.join(wasmDir, "main.bc.wasm.js"));
  });
}

export function configProblems(config) {
  const problems = [];
  for (const key of ["title", "tagline", "topic", "greeting", "placeholder"])
    if (typeof config[key] !== "string" || !config[key].trim()) problems.push(`"${key}" must be a non-empty string`);
  if (config.model !== undefined && typeof config.model !== "string") problems.push(`"model" must be a WebLLM model id`);
  if (!Array.isArray(config.suggestions) || !config.suggestions.length || !config.suggestions.every((s) => typeof s === "string" && s.trim()))
    problems.push(`"suggestions" must be a list of questions`);
  if (!Array.isArray(config.examples)) problems.push(`"examples" must be a list`);
  else {
    config.examples.forEach((e, i) => {
      const where = `examples[${i}]`;
      if (typeof e?.question !== "string" || !e.question.trim()) problems.push(`${where} needs a "question"`);
      if ((typeof e?.query === "string") === (typeof e?.unsupported === "string"))
        problems.push(`${where} needs either a "query" or an "unsupported" reason`);
    });
    if (!config.examples.some((e) => typeof e?.query === "string")) problems.push(`"examples" needs at least one example with a "query"`);
  }
  return problems;
}

export async function check() {
  const config = JSON.parse(readFileSync(path.join(root, "chatbot.json"), "utf8"));
  const problems = configProblems(config);
  if (problems.length) return problems.map((p) => `chatbot.json: ${p}`);

  const dataFile = path.join(site, "data", "facts.browser.json");
  if (!existsSync(dataFile)) return [`${path.relative(root, dataFile)} is missing; run 'npm run build' first`];
  const { db, summary } = await loadRuntime(dataFile);
  console.log(`check: ${summary.predicates} predicates, ${summary.facts} facts`);

  config.examples.forEach((e, i) => {
    if (e.query === undefined) return;
    const r = db.query(e.query);
    const errors = r.response.errors || (r.response.error ? [r.response.error] : []);
    if (r.status !== "ok") problems.push(`chatbot.json examples[${i}] ("${e.question}"): ${errors.map((x) => x.message).join("; ")}`);
    else if (!r.response.results.length) problems.push(`chatbot.json examples[${i}] ("${e.question}"): the query returns no rows`);
  });

  const prompt = buildPrompt(buildSchema(db), config.examples);
  console.log(`check: ${config.examples.length} examples, model instructions ${prompt.chars} characters`);
  if (prompt.chars > PROMPT_WARN_CHARS)
    console.warn(
      `check: warning: the model instructions are long (${prompt.chars} characters). Small models answer worse with long instructions: ` +
        `use fewer examples, or describe fewer, broader predicates.`,
    );
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = await check();
  for (const p of problems) console.error(`error: ${p}`);
  if (problems.length) process.exit(1);
  console.log("check: ok");
  process.exit(0);
}
