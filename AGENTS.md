# Evergreen skills

This public MIT-licensed pack manages user-owned Evergreen data repositories. It is not extension
source. Use synthetic fixtures and local Git remotes in tests; never exercise mutation against a
person's live bookmarks or publish their paths, titles, URLs, exports or credentials.

Canonical runtime: `src/*.mjs`. Each installed skill carries a generated self-contained copy in
`scripts/`; run `npm run generate` after source changes. Canonical pack metadata: `pack.json`.
Generated manifests, bundle files and README skill table must pass `npm run check`.
Run `npm ci`, `npm test`, `npm run check`. Node 22+; no runtime npm dependencies.

Keep v1 compatibility and preservation constraints in the management skill's repository/editing
references. Data publication is a plain non-force Git push to the bookmark repo's default branch,
not a software PR. Never replay stale position pointers or silently reset a checkout.

Software changes go through a PR. Every automated review (including Codex) must receive a response:
fix it, or explain with evidence why no fix is appropriate. Resolve every review thread before
merging and require all CI checks to pass. A clean automated review may be a thumbs-up reaction or
comment rather than a formal review. Do not equate absence of review threads with a completed review.
