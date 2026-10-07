# Repository selection and freshness

## One-time setup

Start with `setup-status`, passing the user's repository choice if given. This preflight only reads local configuration and receipts; it does not discover the GitHub user, clone, fetch, create directories or read bookmark contents. If setup is required, ask before doing any of those setup actions. Explain the selected repository, checkout location and that it will be remembered as the default for both skills. When no repository is selected, offer `<authenticated-github-user>/evergreen-bookmarks` as a convention to confirm, not proof of the user's actual extension configuration.

Example: “To look through your bookmarks, may I do a one-time setup using your Evergreen bookmark repository? I'll clone it into a separate private local checkout if needed, validate it, and remember it for both skills. This won't change or push bookmarks. Which repository should I use, or would you prefer an existing checkout?”

After explicit approval, run `setup --approved --repo owner/name` or `setup --approved --repo-path /absolute/checkout`. With approval of the default convention, `setup --approved` can discover the authenticated GitHub user. Ask the user to authenticate if needed; keep credentials out of prompts and do not install packages or start a login flow without their request. No repository is created remotely. Success requires `configured: true`; only a validated, fetched v1 checkout receives a receipt. A failure is incomplete setup, not permission to bypass validation.

Receipts live in `$XDG_CONFIG_HOME/evergreen/setups/`, bound to the canonical checkout and origin. Both skills reuse them; another repository, changed origin, lost receipt or another machine requires setup again. A ready receipt is consent state, not proof of freshness: normal commands still fetch and validate. If the user declines or has not answered, stop without creating a checkout, config, export or receipt. Do not infer setup approval from ordinary lookup/edit requests or add `--approved` to bypass the question. Existing explicit setup authorization for that selected repository can be honored without asking twice.

## Selection and normal use

Selection precedence: `--repo owner/name`, `EVERGREEN_BOOKMARK_REPO`, saved configuration, then
the authenticated GitHub user's `evergreen-bookmarks` during approved setup. Saved configuration may select a repository name or an existing checkout path. Use `setup --approved --repo owner/name` after permission to remember another repository; `configure --approved` is an alias. A command-line selection applies only to that invocation unless setup saves it as the default.

The automatic checkout is separate from application source, under
`$XDG_DATA_HOME/evergreen/repos/github.com/<owner>/<repo>` (lowercase). Configuration is
`$XDG_CONFIG_HOME/evergreen/skills.json`. Private plans, exports and transaction receipts live under
`$XDG_STATE_HOME/evergreen/`. Defaults are `~/.local/share`, `~/.config` and `~/.local/state`;
relative XDG environment values are ignored. New state directories are mode 0700 and files 0600.
An explicit `--repo-path` uses an existing checkout root; the selected default repository is not
consulted for that command. Pass `--repo` too if origin identity must match a particular GitHub repo.

Requirements: Node 22+, Git, and authenticated `gh` for discovery/cloning. Authenticate with
`gh auth login` and set up Git credentials with `gh auth setup-git` if needed. Use a credential
helper or SSH, not tokens in Git URLs, configuration, operation files, or agent prompts.
Existing explicit checkouts need Git authentication only. No GitHub token is stored by these skills.

The helper discovers origin's default branch, fetches it and fast-forwards a clean checkout already
on that branch. It refuses dirty, ahead/diverged or wrong-branch checkouts; preserve and resolve the
user's work instead of resetting or switching it. `--offline` is read-only and uses the last cached
origin HEAD; it is not proof of freshness. A remote data commit does not say whether a browser has
unsynced edits. Large reorganizations should happen while other profiles are not actively editing.
If no cached origin HEAD exists, run online `ensure` once when permitted; do not guess the default
branch or bypass the helper's validation by reading raw JSON after a refusal.

Only frozen Evergreen v1 `bookmarks.json` is supported (25,000 nodes, depth 128, compact limit
1.5 MiB, raw input limit 3 MiB). Unknown fields and providers are preserved. Other versions, malformed
containers, duplicate JSON keys, disabled providers and `.evergreen/manifest.json` generations are
refused. Valid leap-second timestamps are also conservatively refused by this editor.

Failed transactions remain under the state directory with a detached Git worktree and
`transaction.json`. `published.json` records a completed push; an interrupted push can succeed
without that receipt, so inspect origin history before retrying. Read the transaction's commit with
`git -C <worktree> log -1`; compare its hash against remote ancestry after fetching. Do not publish
the retained commit when remote has moved; regenerate a plan instead. After recovery, the owner may
remove the exact worktree with `git worktree remove <worktree>` and retain or delete its private
receipt files. An abandoned `evergreen-agent.lock` in the Git common directory needs owner inspection
before removal; the helper never steals a lock.
