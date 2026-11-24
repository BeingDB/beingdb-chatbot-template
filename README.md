# BeingDB chatbot template

**Make a chatbot that answers questions from your own facts and runs entirely
in the visitor's web browser.** You don't need a server, an AI subscription or
API keys, and nothing typed into the chatbot leaves the visitor's computer.
Publish it free on GitHub Pages.

This template ships with a small bookshop catalogue so it works straight away.
Replace the facts with your own and you have your own chatbot.

## How it works

```
question
  -> small language model, in the browser (WebLLM)   writes a database query
  -> BeingDB, in the browser (WebAssembly)           checks the query and runs it on your facts
  -> answer                                          comes from the facts, never from the model's memory
```

The language model only translates the question into a query. The answer always
comes from your facts, and **Show the facts** under each answer lists the
exact facts it came from.

## Make your own chatbot

1. Click **Use this template** (top of this page) and create a repository.
2. In your new repository, open **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Put your facts in [`predicates/`](predicates/) (see [Write your facts](#write-your-facts)).
4. Describe your chatbot in [`chatbot.json`](chatbot.json) (see [Describe your chatbot](#describe-your-chatbot)).
5. Commit. The **Actions** tab shows the build. When it finishes, your chatbot is at
   `https://<your-user-name>.github.io/<your-repository>/`.

The first build takes about 10 minutes because it builds BeingDB. Later builds
take about a minute. If the very first build failed because Pages wasn't set
up yet, open **Actions**, pick the failed run and click **Re-run all jobs**.

You can do all of this in GitHub's web editor. To try changes on your own
computer first, see [Preview on your computer](#preview-on-your-computer).

## Write your facts

Facts live in `predicates/`, one file per kind of fact. For example,
[`predicates/written_by.pl`](predicates/written_by.pl):

```prolog
%! written_by(Book, Author)
% Relates a book to the author who wrote it.
written_by(pride_and_prejudice, jane_austen).
written_by(emma, jane_austen).
```

- **One fact per line**, ending with a full stop. Every fact in a file has the
  same name (`written_by`) and the same number of values.
- **The `%!` line names each value** (`Book`, `Author`), and the `%` line
  below it says what the fact means. Add both to every file: the language
  model reads them to understand your facts.
- **Values:** names are lowercase with underscores (`jane_austen`), text goes
  in quotes (`"A long title"`), numbers are plain (`42`, `7.99`), and dates
  start with `@` (`@1813`, `@1813-01`, `@1813-01-28`).
- **Use the same name for the same thing everywhere**, so facts connect:
  `written_by(emma, jane_austen)` and `published_in(emma, @1815)` together
  say when Jane Austen published *Emma*.
- **The chatbot displays names as words:** `jane_austen` is shown as
  "Jane Austen", so choose names that read well.

The full syntax is in BeingDB's
[query language guide](https://github.com/beingdb/beingdb/blob/main/docs/query-language.md).

## Describe your chatbot

[`chatbot.json`](chatbot.json) holds everything else about your chatbot:

| Field | What it is |
| --- | --- |
| `title` | The chatbot's name, shown at the top of the page. Its first letter is the logo. |
| `tagline` | One line under the title. |
| `topic` | What the facts cover, in a phrase: "a bookshop's catalogue: its books, their authors, …". The model uses it to recognise off-topic questions. |
| `greeting` | The chatbot's first message. |
| `placeholder` | Grey text in the empty question box. |
| `suggestions` | Example questions offered as buttons. Four are picked at random each time. |
| `examples` | Worked examples for the model (see below). |
| `model` | Optional: the [WebLLM model](https://github.com/mlc-ai/web-llm) to use by default. Visitors can choose another in the ☰ menu. |

### Examples teach the model your facts

The `examples` are the most important part of `chatbot.json`. Each one pairs a
question with the BeingDB query that answers it:

```json
{ "question": "What did Lewis Carroll write?", "query": "find Book\nwhere\n  written_by(Book, lewis_carroll)" }
```

or with the reason it can't be answered:

```json
{ "question": "Do you sell e-books?", "unsupported": "No predicate records formats." }
```

Aim for 10 to 15 examples that use your own facts and cover the kinds of
question people will ask: lookups, joins across two kinds of fact, dates,
counting ("how many"), ordering ("the longest"), and two or three questions
your facts can't answer. The [query language guide](https://github.com/beingdb/beingdb/blob/main/docs/query-language.md)
shows how to write queries; the examples in this template are a good start.

Every build checks every example query against your facts, and fails with a
clear message if one is wrong or returns nothing, so a broken example never
reaches your site.

## What visitors need

The language model runs on the visitor's graphics processor (WebGPU), so the
chatbot needs a recent **Chrome or Edge on a laptop or desktop**. The first
visit downloads the model (about 2 GB); the browser keeps it for later visits.
Phones and some browsers can't run it yet. The page says so instead of failing.

## Preview on your computer

You need [Node.js](https://nodejs.org/) 22 or later and the `beingdb` command,
built from the BeingDB commit in [`runtime/runtime.json`](runtime/runtime.json)
(see BeingDB's [installation guide](https://github.com/beingdb/beingdb/blob/main/docs/installation.md)).

```sh
npm install
npm run build    # compile the facts and check chatbot.json; BEINGDB=/path/to/beingdb if it isn't on your PATH
npm run serve    # http://localhost:8010/
```

`npm run build` writes the finished site to `dist/site/`. Any static web host
can serve that folder, not only GitHub Pages.

## What's in this repository

```
predicates/          your facts, one file per predicate
chatbot.json         title, topic, suggestions and examples
index.html, src/     the chat page (adapted from beingdb-webllm)
runtime/             BeingDB compiled to WebAssembly (from beingdb-wasm)
scripts/             build, check and preview
.github/workflows/   builds and publishes the site
```

You don't need to touch `src/` or `runtime/` to make your own chatbot. To change
the colours, edit the variables at the top of [`src/chat.css`](src/chat.css).

## Learn more

- [BeingDB](https://github.com/beingdb/beingdb): the database, its query language and server.
- [beingdb-wasm](https://github.com/beingdb/beingdb-wasm): BeingDB in the browser, and an
  [interactive tutorial](https://beingdb.github.io/beingdb-wasm/tutorial/) for the query language.
- [beingdb-webllm](https://github.com/beingdb/beingdb-webllm): the research behind this
  chatbot, with benchmarks of how well each model writes queries.

To move to a newer BeingDB, copy `main.bc.wasm.js`, `main.bc.wasm.assets/` and
`runtime.json` from beingdb-wasm's `prebuilt/` folder into `runtime/`. The
GitHub Action builds the matching BeingDB.

## License

MIT
