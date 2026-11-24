// Question -> model -> query -> BeingDB, with a bounded repair loop driven by
// BeingDB's own validation errors. The model never sees or alters result rows.
//
// BeingDB first diagnoses each reply and applies any repair it can prove
// (MAX_PROVEN_PASSES at most), then validates and executes the query. If the
// query is invalid, its errors go back to the model (MAX_REPAIRS at most).
// This is beingdb-webllm's "proven-only" policy.
import { parseReply, repairMessage } from "./prompt.js";

export const MAX_REPAIRS = 2;
// Greedy first attempt; repairs sample (seeded) so the model does not simply
// repeat the query BeingDB just rejected.
export const REPAIR_TEMPERATURE = 0.7;
// Proven BeingDB repairs applied to one model reply before giving up on them.
export const MAX_PROVEN_PASSES = 2;

// generator: { complete(messages, format, { temperature }) -> { text, ms, usage } }
// db: wrapBeingDB(...) ; schema: buildSchema(...) ; prompt: buildPrompt(...)
export async function ask({ question, generator, db, schema, prompt, onProgress }) {
  const t0 = performance.now();
  const messages = prompt.messages(question);
  const attempts = [];
  let dbMs = 0;
  let format = prompt.format;
  for (let i = 0; i <= MAX_REPAIRS; i++) {
    onProgress?.({ attempt: i + 1, repair: i > 0 });
    const gen = await generator.complete(messages, format, { temperature: i === 0 ? 0 : REPAIR_TEMPERATURE });
    const reply = parseReply(gen.text);
    const attempt = { raw: gen.text, reply, llmMs: gen.ms, usage: gen.usage };
    attempts.push(attempt);
    if (reply.status === "unsupported") break;
    if (reply.status !== "ok") {
      attempt.feedback = `Your reply was not usable: ${reply.error}. Reply with only the query.`;
      format = prompt.format;
    } else {
      const proven = applyProvenRepairs(reply.dsl, db);
      dbMs += proven.ms;
      if (proven.dsl !== reply.dsl) attempt.reply = { ...reply, dsl: proven.dsl, modelDsl: reply.dsl };
      attempt.db = db.query(proven.dsl);
      dbMs += attempt.db.ms;
      if (attempt.db.status === "ok") break;
      const repair = repairMessage(attempt.db.response, schema);
      attempt.feedback = repair.text;
      format = repair.allowUnsupported ? prompt.format : prompt.fixFormat;
    }
    if (i === MAX_REPAIRS) break;
    // After a proven BeingDB repair, the conversation shows the query BeingDB actually judged.
    messages.push({ role: "assistant", content: attempt.reply.modelDsl ? attempt.reply.dsl : gen.text }, { role: "user", content: attempt.feedback });
  }
  const last = attempts.at(-1);
  const outcome = last.reply.status === "unsupported" ? "unsupported" : last.db?.status === "ok" ? "ok" : "failed";
  return {
    question,
    outcome,
    attempts,
    repairs: attempts.length - 1,
    llmMs: attempts.reduce((n, a) => n + a.llmMs, 0),
    dbMs,
    totalMs: performance.now() - t0,
  };
}

// Diagnose, and apply BeingDB-proven repairs (re-diagnosing each result) at most
// MAX_PROVEN_PASSES times; never revisits a query, so it cannot loop.
function applyProvenRepairs(dsl, db) {
  const seen = new Set([dsl]);
  let ms = 0;
  for (let pass = 0; ; pass++) {
    const diagnosis = db.diagnose(dsl);
    ms += diagnosis.ms;
    const repaired = diagnosis.response.repair?.query;
    if (!repaired || pass >= MAX_PROVEN_PASSES || seen.has(repaired)) return { dsl, ms };
    seen.add(repaired);
    dsl = repaired;
  }
}
