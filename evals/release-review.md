# Release review

An independent first-round reviewer examined the runtime, generated skill bundles, instructions, packaging and synthetic tests for the initial release. The automated Codex review request had not produced an acknowledgement, reaction or review, so the independent review was used under the maintainer's explicit authorization.

The reviewer reproduced three correctness defects using synthetic containers and local Git remotes:

| Finding | Correction | Regression evidence |
| -- | -- | -- |
| Positional pointers could select another node if a browser wrote between inspection and planning. | Require the inspection commit when planning and reject changed snapshots. | A prepended folder rejects the old inspection; fresh inspection and regenerated pointers rename the intended folder. |
| Ambient `push.followTags` could publish unrelated annotated tags. | Explicitly disable follow-tags for the branch push. | A successful bookmark publication leaves the synthetic annotated tag local. |
| Unknown numeric metadata could overflow or round during JSON parsing. | Compare numeric tokens against their JSON round-trip decimal values before parsing. | Overflow, underflow, rounded integers and high-precision decimals are refused; equivalent decimal spellings and safe values survive an unrelated rename. |

The pack's checks include generated-file freshness, pinned-schema validation, synthetic tests and coverage gates. The installer smoke test uses an isolated project workspace for Codex and Claude Code. No personal bookmark repository or global agent configuration is modified by these evaluations.

Final local verification passes 28 tests on Node 22. Data-module coverage is 96.60% lines, 82.59% branches and 98.18% functions, above the 90/75/85 gates. The authoring lint reports no errors or warnings. Independent targeted verification confirms all three original findings are resolved; this is a repair verification, not a claim that every possible defect has been eliminated.
