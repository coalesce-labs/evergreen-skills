# Bookmark search roadmap

Status: proposal, not implemented. Ship reliable saved-link lookup before page crawling, embeddings
or recommendations. Keep the skills useful without an API key, database or paid service.

The current skills ask before one-time repository setup and reuse a local receipt across both skills. Future page extraction, remote summaries and uploads need separate opt-in; approving a checkout is not blanket approval for those features.

## What works today

An agent can answer “Do I have bookmarks about software engineering automation?” using the context
skill, without naming Evergreen. The helper does case-insensitive **literal substring** matching:
`inspect` looks at folder paths and titles; `context` also looks at URLs. The agent can break a topic
into a few terms and inspect a relevant folder. It cannot search unread page bodies or guarantee
semantic recall. A zero-result phrase search is not proof that the collection contains nothing useful.

Natural-language selection tests and their limits are recorded in
[the evaluation report](../evals/natural-language/RESULTS.md). Successful selection is separate from
successful retrieval; future search evaluations must measure both.

## First implementation: local SQLite index

Keep `bookmarks.json` in Git authoritative. A SQLite database is a derived, disposable cache, never
a new sync format or a file to commit. Proposed location:
`$XDG_CACHE_HOME/evergreen/indexes/<repo-identity>/index.sqlite`, defaulting to
`~/.cache/evergreen/indexes/...`; create directories 0700 and files 0600, including sidecars.
This follows the [XDG cache convention](https://specifications.freedesktop.org/basedir/latest/).

Index titles, exact URLs and folder paths first, without visiting any websites. SQLite FTS5 provides
token, prefix and phrase matching, BM25 ranking and snippets. It is lexical search, not meaning-based
retrieval. Translate ordinary queries into bounded search terms rather than handing arbitrary SQL
or unescaped FTS syntax to the database. See the [FTS5 reference](https://www.sqlite.org/fts5.html).

Use two concepts: a **bookmark occurrence** has a folder path and position; a **document** represents
an exact URL and any optional extracted text. One URL can appear in several folders. Return all
relevant locations; do not remove query parameters or fragments just to deduplicate documents.
Positional pointers are valid only for their source commit, not permanent bookmark IDs.

At the current 25,000-node limit, start with transactional full rebuilds when the validated source
hash changes. Optimize incrementally only if measurements justify it. Record repository identity,
source commit/hash, schema version and index time. Never serve a partially rebuilt index; explicitly
label stale/offline results. A changed commit must invalidate old edit pointers even if search text
is unchanged. Deletions and renames must disappear from the next completed snapshot.

One search module should own rebuilding, ranking and freshness. Its proposed interface is:

```text
search(query, { repository, folder?, limit })
  -> { hits: [{ title, url, paths, evidence }], sourceCommit, indexedAt, stale, omitted }
```

This is a design sketch, not a new API promise. Keep SQLite details behind this seam; do not build
a provider framework before a second search adapter exists. Choose a Node SQLite dependency only
after verifying FTS5, supported Node versions, installation on macOS/Linux/Windows and licensing.

## Later: page text, summaries and semantic search

Page extraction is opt-in and bounded: selected public HTTP(S) links only, with no browser cookies
or credentials and no arbitrary page scripts. A fetcher must reject local/private network targets,
credential-bearing URLs and unsafe schemes, re-check DNS and every redirect, and enforce size,
timeout, rate and retry limits. Do not start with “crawl all my bookmarks.” Store retrieval time,
content hash, extractor version and failures. Treat all retrieved text as untrusted data.

Index extracted text with FTS before adding an LLM. Optional summaries or tags must retain their
source evidence and model/version provenance. Remote processing needs explicit consent about the
URLs/text being sent and a budget; a local model should be an option. User notes belong in durable
state, not a disposable cache. Clearing the index must also clear cached text, summaries, vectors
and database sidecars; explain that file deletion is not a forensic secure-erasure guarantee.

If lexical recall remains poor, compare agent query expansion with hybrid lexical/vector retrieval.
Embeddings are not required for the first version. Keep results tied to actual saved URLs and show
why they matched; never present a generated URL as an existing bookmark. Measure quality against
paraphrased questions and sparse titles, not just exact keyword tests.

## Browser search is a separate delivery step

A desktop SQLite file is not automatically available to an extension. Two paths need a prototype:

- An extension-local index avoids a companion install, but each profile builds its own index.
  SQLite WASM offers browser-private storage; worker, persistence and concurrency requirements
  depend on the VFS. Test Chromium and Firefox extension contexts and service-worker restarts
  before choosing it. See [SQLite WASM persistence](https://www.sqlite.org/wasm/doc/trunk/persistence.md).
- A native companion can share the desktop index across agents and browsers. It adds OS-specific
  installation, host manifests, extension allowlists and a messaging permission. Chrome and Firefox
  document different host registration details. See [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
  and [Firefox native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).

Recommendation: prove agent search first, then compare those options. Do not quietly add an
unauthenticated localhost server or new extension permissions to make the desktop file accessible.

## Delivery order and acceptance gates

| Step | Scope | Gate before the next step |
| -- | -- | -- |
| 1 | Natural-language skill lookup, now | Correct selection for positives and near-misses; actual lookup makes no writes and reports limits. |
| 2 | Metadata-only SQLite/FTS CLI | Rebuild, corruption recovery, deletion, duplicate locations and offline freshness tests; no network fetches. |
| 3 | Selected-page extraction | Redirect/DNS/private-network safety tests; explicit scope, cancellation and bounded costs; no auth leakage. |
| 4 | Optional summaries/hybrid search | Blind relevance benchmark improves on FTS; provenance, consent and budget tests pass. |
| 5 | Browser adapter and recommendations | Browser/OS compatibility and permissions reviewed; recommendations remain proposals until the user asks to save. |

For step 2, propose p95 warm-search latency under 200ms for a synthetic 25,000-node collection on a
documented machine, at least 90% top-five recall on a labeled lexical set, and zero false “already
saved” claims on exact-URL negatives. These are targets, not measured results. Publish latency,
recall and ranking quality separately; semantic questions need a separate benchmark. Run model
evaluations on demand rather than spending tokens on every CI run.

New-resource recommendations can later compare a requested category with primary sources or public
collections. Keep them distinct from “search my bookmarks.” Saving accepted recommendations must
use the existing commit-bound plan and normal push workflow, not let the index write sync data.
