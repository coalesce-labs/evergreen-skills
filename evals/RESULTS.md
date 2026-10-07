# Initial behavioral evaluation

An independent agent followed both installed skills from an isolated directory, using synthetic
v1 data, private XDG paths and a local bare Git remote. No live data, accounts or uploads were used.

- Requested duplicate-folder merge published successfully; one sibling Research folder remained.
- Target order was preserved: A, Papers[X,Y], B. Only the exact duplicate A was removed.
- Unknown container fields/providers and unrelated bookmarks survived; only bookmarks.json changed.
- A focused Papers export contained X and Y, with snapshot provenance and mode 0600.
- Context export created no additional commit or upload.
- Trigger-case review found that prompts omitting “bookmarks” could misroute generic project
  exports. Those positive cases were narrowed to explicitly identify the source as bookmarks.

Remaining usability limitations: the shared helper lists editing commands even for the read-only
context skill, whose instructions restrict their use; plan previews show operations and statistics,
not a rendered final-tree diff. Neither limitation prevented the observed task from succeeding.

These results are a behavioral smoke evaluation, not a claim that every possible model or harness
was tested. Deterministic Git/data safety tests run separately in CI.

Additional natural-language routing and unforced lookup tests, their results and limitations are
recorded in [natural-language/RESULTS.md](natural-language/RESULTS.md).

First-use consent, decline, approved setup and later reuse are recorded in
[first-use-setup/RESULTS.md](first-use-setup/RESULTS.md).
