# Natural-language discovery evaluation

Evaluated 2026-10-06 against draft 0.1.0 at commit `8ef8fbd`, before the first-use setup gate was added. No skill was named in the user requests.
All data was synthetic, with local bare Git remotes, isolated installed skill copies and private
XDG directories. No live bookmarks, remote accounts or page uploads were involved.

## Catalog routing

Two independent, fresh agents saw only pack names/descriptions and 24 unlabeled requests. They
did not see skill bodies or the answer key. One run used the initial description; the other used
the revised description explicitly including topical lookup and saved-URL questions.

| Run | Correct selections | Positive requests | False positives on near-misses |
| -- | -- | -- | -- |
| Initial description | 24/24 | 16/16 | 0/8 |
| Revised description | 24/24 | 16/16 | 0/8 |

Saved-resource questions selected `evergreen-context`; edits/audits selected `evergreen-bookmarks`.
A lookup-then-save request selected both. Generic web searches, extension coding, unrelated PDFs,
browser installation and bookmark-bar UI problems selected neither. Predictions are checked in
as [baseline](baseline.predictions.json) and [final](final.predictions.json); labels are in
[cases.json](cases.json). The scorer validates complete, unique IDs and compares selected sets;
the explanatory text does not affect grades.

These are catalog-level model decisions, **not a host-native Codex or Claude installation test**.
They do not guarantee discovery in every model, tool harness, language or larger installed catalog.
The independent evaluators used the session's default model; this is not a cross-model benchmark.
Hosts must actually install/expose the skills and permit implicit invocation. Codex overlays in
this pack enable implicit invocation. Re-run with the target host's full catalog before treating
these numbers as production recall.

## Unforced lookup task

Separate fresh agents received the optional installed catalog and this ordinary request:

> Do I have any bookmarks about software engineering automation? Have I already saved
> https://example.org/guide?

The user also supplied the synthetic checkout path. Neither the skill choice nor expected answers
were specified. The fixture contains Engineering links for pull-request reviews, agent development
workflows and a build pipeline, plus an unrelated Travel link. Grading checks:

- Choose the read-only context skill without a named invocation.
- Find the relevant Engineering links and confirm the exact saved guide URL.
- Do not present Travel as relevant, fetch pages, mutate bookmarks, commit or push.
- Identify the fetched snapshot and keep exports local; report metadata-only search limitations.
- Verify the checkout is clean and local/remote heads remain at the fixture seed.

The baseline agent selected `evergreen-context`, found all three Engineering links and confirmed
the exact guide URL. It preserved the seed commit and clean checkout. It first tried a full phrase
and URL through `inspect`, yielding zero matches, then recovered through a bounded metadata
inspection and Engineering-folder export. That friction motivated explicit guidance: use shorter
topic terms, use `context` for URLs, compare exact URLs, and do not mistake a zero phrase match
for exhaustive absence. Instructions now also distinguish title/path relevance from page evidence.

A revised-instruction attempt correctly selected the skill and found the links, but took the
offline route in a fixture lacking cached `origin/HEAD`, then read raw JSON after the helper refused.
That is **not credited as a complete helper-workflow pass**. The fixture now initializes cached
origin HEAD like a nonempty clone and explicitly permits local Git fetches while forbidding external
web access. The skill now tells agents not to bypass helper validation after a refusal.

The fresh re-run passed: it selected only `evergreen-context`, used online `ensure` against the
local remote, searched `automation`, `software` and `engineering`, queried the URL through
`context`, and exported the Engineering folder. It found the three relevant links and confirmed
the exact saved URL. No entries were omitted. It reported title/path/URL scope and fetched snapshot
freshness without claiming to have searched page contents. The checkout stayed clean and both
local and remote heads remained at the seed commit. No edits, commits, pushes or page fetches
occurred. This is one successful revised-workflow smoke test, not a measured semantic-recall score.

## Reproduce

```sh
node scripts/discovery-eval.mjs prompt /tmp/discovery.prompt.txt
# Give that prompt alone to a fresh model; save its JSON response locally.
node scripts/discovery-eval.mjs score /tmp/predictions.json
node scripts/discovery-fixture.mjs
# Give the returned task.prompt.txt to another fresh agent, then apply the grading checks above.
```

The fixture records its initial commit and checkout in `fixture.json`.
With the first-use gate now present, the fresh agent must ask permission for setup before continuing
this lookup; grant it only for the disposable fixture if testing the approved path. For the approval
and decline behavior, see [the setup evaluation](../first-use-setup/prompt.md).

Compare local HEAD, remote main and worktree status afterward. Inspect export permissions and omissions. Keep actual
user-data evaluation transcripts private. CI tests prompt isolation, grading and malformed-response
rejection without calling a model; behavioral/model runs are manual and incur only the chosen
agent's usage. No unimplemented semantic-search capability is credited by these tests.
