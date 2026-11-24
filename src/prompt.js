// Model instructions: DSL rules + live schema + the examples in chatbot.json,
// and the decoding grammars. Model-agnostic: any WebLLM chat model can use it.
// Adapted from beingdb-webllm (prompt run14), where it is benchmarked.
import { buildGrammar } from "./grammar.js";

const UNSUPPORTED = "UNSUPPORTED: ";

export const RULES = `You translate questions about a BeingDB database into BeingDB queries.
BeingDB runs your query and returns the answer, so never answer from your own knowledge.
Reply with only the query. If no predicate below records what the question asks about, reply ${UNSUPPORTED}<reason>. Check the predicate names and descriptions before you do.

Query format:
find Var1, Var2
where
  predicate(Var1, Var2)
  Var2 > @1980

- One clause per line: a predicate from the list, or a comparison of a variable.
- Capitalised words are variables. Names of people, things, places and organisations are lowercase atoms joined by underscores: New York -> new_york.
- Keep each predicate's argument order: the roles show what goes where.
- Use the same variable in two clauses to join them. Every find variable must be used in a clause.
- Years are written @1979. Comparisons: =, !=, <, <=, >, >=, Y between @1975 and @1980.
- "not" on its own line, followed by indented clauses, excludes matches. "optional" keeps rows with no match.
- "order by Var ascending" only when the question asks for an order.
- For "how many", count in the query: "find count(Item)" gives one number, "find Group, count(Item)" one per group, and "order by count(Item) descending" ranks them. count counts distinct values.
- For totals, averages, earliest and latest, use sum(Var), avg(Var), min(Var), max(Var) the same way. Keep the thing being added up as a variable: amount(Item, Amount), not amount(_, Amount).
- When the question gives only a word or part of a name, do not guess an atom or put the word in a clause: use a variable and add Var contains "word" (ignores case).
- Counting is always allowed. Only questions that need arithmetic (subtract, divide, percentages) or a condition on a count or total ("people with more than five friends") are unsupported.`;

// The worked examples from chatbot.json: { question, query } or { question, unsupported: reason }.
export const exampleReply = (e) => (e.query !== undefined ? e.query : `${UNSUPPORTED}${e.unsupported}`);

export function buildPrompt(schema, examples) {
  const system = `${RULES}\n\n${schema.text}`;
  const shots = examples.flatMap((e) => [
    { role: "user", content: e.question },
    { role: "assistant", content: exampleReply(e) },
  ]);
  return {
    system,
    messages: (question) => [{ role: "system", content: system }, ...shots, { role: "user", content: question }],
    format: { type: "grammar", grammar: buildGrammar(schema.meta) },
    // For repairs where BeingDB found every predicate: the question is
    // expressible, so the model must fix the query rather than give up.
    fixFormat: { type: "grammar", grammar: buildGrammar(schema.meta, { allowUnsupported: false }) },
    chars: system.length + shots.reduce((n, m) => n + m.content.length, 0),
  };
}

export function parseReply(text) {
  const t = text.trim();
  if (t.startsWith(UNSUPPORTED.trim())) return { status: "unsupported", reason: t.slice(UNSUPPORTED.trim().length).trim() };
  if (t.startsWith("find")) return { status: "ok", dsl: t };
  return { status: "model_error", error: "reply is neither a query nor UNSUPPORTED" };
}

// One-line reminders of the DSL rule behind each BeingDB error code.
const HINTS = {
  syntax_error: "Use: find line, where line, then one clause per line.",
  unknown_predicate: "Use only predicates from the list.",
  arity_mismatch: "Give the predicate exactly the listed number of arguments.",
  unbound_projection: "Every find variable must appear in a clause; remove it or add the clause that binds it.",
  unbound_order_variable: "An order by variable must appear in a clause; remove the order by or bind it.",
  unsafe_negation: "Variables inside not must also appear in a clause outside it; otherwise use _.",
  disconnected_query: "All clauses must be joined through shared variables or constants.",
  literal_type_mismatch: "Check the literal type: years need @ (@1979), strings need quotes, names are lowercase_atoms.",
  comparison_type_mismatch: "Compare years with years (@1979) and numbers with numbers.",
};

// Feed BeingDB's own validation errors back, plus the signatures of the
// predicates they mention (or suggest), so the repair is grounded in the schema.
// Returns the message and whether "unsupported" stays an allowed reply.
export function repairMessage(response, schema) {
  const errors = response.errors || (response.error ? [response.error] : []);
  const lines = errors.map((e) => `- ${e.message}${e.line ? ` (line ${e.line})` : ""}`);
  const hints = [...new Set(errors.map((e) => HINTS[e.code]).filter(Boolean))];
  const mentioned = new Set();
  for (const e of errors) {
    for (const s of e.suggestions || []) mentioned.add(s);
    if (e.predicate && schema.names.has(e.predicate)) mentioned.add(e.predicate);
  }
  const sigs = [...mentioned].filter((n) => schema.signatures.has(n)).map((n) => `  ${schema.signatures.get(n)}`);
  const unknown = errors.some((e) => e.code === "unknown_predicate");
  const text =
    `BeingDB rejected that query:\n${lines.join("\n")}\n` +
    (hints.length ? `${hints.join("\n")}\n` : "") +
    (sigs.length ? `Relevant predicates:\n${sigs.join("\n")}\n` : "") +
    (unknown
      ? `Reply with the corrected query, or ${UNSUPPORTED}<reason> if no listed predicate records the needed information.`
      : `The predicates exist, so reply with the corrected query.`);
  return { text, allowUnsupported: unknown };
}
