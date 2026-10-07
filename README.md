# Evergreen skills

Use your saved bookmarks while working with an AI agent. Merge duplicate folders, organize a
collection, save a research paper's references by topic, or bring relevant saved resources into a
new task. Requested edits are committed and pushed to your bookmark repository; Evergreen pulls
them into your native browser bookmarks on the next sync.

This public, MIT-licensed pack is separate from your **private bookmark data** and from the extension
source. It contains no hosted service or telemetry. Exports stay local unless you request a specific
destination. Browser installation: [Chrome Web Store](https://chromewebstore.google.com/detail/evergreen/akcophjionmmcheonnmfoailhdolemin)
and [Firefox Add-ons](https://addons.mozilla.org/addon/evergreen-bookmarks/).

<!-- generated:skills:start (build-manifests.mjs; do not edit) -->

| skill | what it does |
| -- | -- |
| [`evergreen-bookmarks`](skills/evergreen-bookmarks/SKILL.md) | Inspect and edit bookmarks stored in an Evergreen sync repository. |
| [`evergreen-context`](skills/evergreen-context/SKILL.md) | Find bookmarks you already saved in an Evergreen repository and export relevant sources. |

<!-- generated:skills:end -->

## Install

Choose **one route below**. They provide the same two skills; these are alternatives, not
consecutive setup steps. For multiple tools on one machine, start with Option A.

### Option A — Standalone skills (recommended)

Use the [skills installer](https://github.com/vercel-labs/skills) and select your agent in its prompts:

```sh
npx skills add coalesce-labs/evergreen-skills --skill '*' -g
```

`-g` installs for your user account; omit it for a project-only installation. Select the supported
tools you use, such as Codex, Claude Code or Gemini CLI. Don't also install the pack as a plugin.

**Verification:** isolated project installs for Codex and Claude Code were tested from this public
repository. Global installs and the other tools have not been tested end to end.

### OR Option B — Native plugin (Codex or Claude Code)

Choose the commands for your tool, instead of Option A.

**Codex CLI:**

```sh
codex plugin marketplace add coalesce-labs/evergreen-skills
codex plugin add evergreen-skills@evergreen-skills
```

This uses the marketplace/plugin support in current Codex CLI releases. If your CLI has no
`plugin` command, use Option A. See [OpenAI's plugin documentation](https://developers.openai.com/plugins/build/plugins).

**Claude Code:** run these slash commands inside Claude Code:

```text
/plugin marketplace add coalesce-labs/evergreen-skills
/plugin install evergreen-skills@evergreen-skills
```

**Verification:** the manifests are validated in CI and the Codex command syntax was checked against
the installed CLI. Native plugin installation has not been tested end to end in either tool.

### OR Option C — Gemini CLI's skills installer

Inside a terminal, use Gemini's [native skills installer](https://geminicli.com/docs/cli/using-agent-skills/):

```sh
gemini skills install https://github.com/coalesce-labs/evergreen-skills --path skills
```

`--path skills` selects the directory containing both skills. Then run `/skills list` inside Gemini
CLI to check discovery. This installs **skills**, not a Gemini
extension: this repository does not include a `gemini-extension.json`. Use this instead of Option A,
not in addition to it.

**Verification:** this route follows Gemini CLI's documentation; it has not been tested end to end.

### Requirements for every route

Before switching routes, remove the previous installation to avoid duplicate skills. Each skill
is self-contained; its scripts need **Node 22+ and Git**, and authenticated **GitHub CLI** for discovery and cloning.
No runtime npm install, database, API key in a prompt, or extension-source checkout is needed.

## Choose your bookmarks repository

On first use, either skill checks local setup state and asks before cloning or saving configuration. Approve the repository and checkout location once; both skills remember successful setup on that machine. Declining leaves setup untouched. This permission covers setup only, not bookmark edits, page fetching or uploads. A different repository or machine needs its own setup.

By default the helper looks for `<authenticated-github-user>/evergreen-bookmarks`. Override it with
`--repo owner/name`, `EVERGREEN_BOOKMARK_REPO`, or a saved configuration:

```sh
node <installed-skill-dir>/scripts/evergreen.mjs setup-status --repo owner/my-bookmarks
# Only after you approve setup:
node <installed-skill-dir>/scripts/evergreen.mjs setup --approved --repo owner/my-bookmarks
node <installed-skill-dir>/scripts/evergreen.mjs ensure
```

`<installed-skill-dir>` is the folder containing that skill's `SKILL.md`; the agent resolves it for
you. The default data checkout is `$XDG_DATA_HOME/evergreen/repos/github.com/<owner>/<repo>`
(`~/.local/share` when unset). Plans, exports and receipts use `$XDG_STATE_HOME/evergreen`
(`~/.local/state`); repo configuration uses `$XDG_CONFIG_HOME/evergreen` (`~/.config`).
Setup receipts are private files under that configuration directory, scoped to checkout and origin.
Use `--repo-path /absolute/checkout` for an existing data checkout. Read
[repository selection and recovery](skills/evergreen-bookmarks/references/repository.md) for details.

## Try it

- “Check whether my Evergreen bookmark repository is current and find duplicate folders.”
- “Merge these two AI Coding folders, keeping all unique links and their order.”
- “Save the references from this paper in a Research folder, grouped by section.”
- “Find my saved resources about browser extensions and export them as context.”
- “Do I have any bookmarks about software engineering automation?”
- “Have I already bookmarked this URL?”
- “Suggest useful resources missing from this topic; show me before saving anything.”

Editing is a two-step helper workflow: `plan --base-commit <inspect-commit> --operations FILE`, then `apply --plan FILE`.
Planning checks the commit that supplied the pointers. The plan binds a fetched commit and data hash. Apply commits only `bookmarks.json` and pushes to
the remote default branch, never force-pushes. A concurrent browser write rejects the edit rather
than being overwritten; stale pointers must be regenerated. Duplicate URL findings are not permission
to delete references across topics. Folder merges preserve the union, not just the largest copy.

Support is limited to the frozen Evergreen **v1** container. New generations are refused rather
than migrated. `--offline` permits clearly labeled cached reads, never edits. Git freshness does not
prove every browser has pulled the latest commit. Notebook/project exports prepare source lists;
live uploads depend on an available connector and an explicitly chosen destination.

For a safe first run, use the [manual testing scenarios](docs/try-the-skills.md). Start with read-only questions and use a disposable folder for the publication test.

You do not have to call either skill by name. Installed descriptions route saved-link questions
to the context skill and edit requests to the management skill. Today's helper searches titles,
folder paths and URLs with literal matching; it does not search page contents. See the
[natural-language evaluation](evals/natural-language/RESULTS.md) for observed selection and lookup
results, and the [search roadmap](docs/search-roadmap.md) for proposed local SQLite/FTS, optional
page extraction and browser search. Those roadmap features are not installed by this pack.

## Development

```sh
npm ci
npm run generate
npm run check
npm test
npm run test:coverage
node scripts/discovery-eval.mjs prompt /tmp/discovery.prompt.txt
node scripts/discovery-eval.mjs score /tmp/predictions.json
node scripts/discovery-fixture.mjs
```

`src/` is canonical; installed helpers are generated copies. `pack.json` is the version source;
generated manifests, skill versions and the table above are checked in CI. JSON Schemas are pinned
with hashes in `schemas/schemas.lock.json`. Tests use synthetic containers and local bare Git remotes,
including stale-plan and push-failure cases. No test touches your bookmarks.

The discovery prompt exposes only names/descriptions and unlabeled natural requests. Give it to
an independent model, save its JSON response, then score it. The fixture command prepares an
isolated installed-pack workspace for an ordinary lookup task; follow its returned prompt with a
fresh agent. See the evaluation report for grading criteria. Neither script calls a model API or
requires credentials. CI tests the scorer deterministically; paid model runs are opt-in.

CI enforces 90% line, 75% branch and 85% function coverage for the data modules exercised by the
suite (`src/bookmarks.mjs` and `src/repository.mjs`). The generated CLI is exercised end-to-end;
packaging scripts and generated copies are excluded from these coverage percentages.

CI runs on every PR. Review instructions and behavioral evaluation cases are in `AGENTS.md` and
`evals/`. Agent Skills layout and overlays follow the authoring-skills and skill-creator guidance;
the public pack's tooling is independently implemented and MIT licensed.
