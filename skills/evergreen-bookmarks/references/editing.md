# Operations and preservation

Node IDs are position pointers, not browser IDs or stable UUIDs. Each operation sees the result of
the previous operation; removing or moving a sibling shifts subsequent pointers. Prefer one plan per
structural merge, or account for those shifts explicitly. Plans bind origin, default branch, checkout,
base commit and raw container hash. Supply the inspection's `commit` as `--base-commit` when planning. If a browser changes the repo between inspection and planning, the helper rejects the operations. Inspect again and select fresh pointers. A stale plan must be rebuilt, not replayed.

An operations file is a JSON array:

```json
[
  {"op":"add","parent":"/bookmarksBar","node":{"type":"folder","title":"Research","children":[
    {"type":"bookmark","title":"Agent Skills specification","url":"https://agentskills.io/specification"}
  ]}}
]
```

| Operation | Fields |
| -- | -- |
| `add` | `parent` children-array pointer; `node` bookmark or folder; optional insertion `index` |
| `rename` | `target` node pointer; nonblank `title` |
| `move` | `target` node pointer; `parent` children-array pointer; optional `index` measured after removal |
| `merge-folders` | `source` and `target` different folder pointers; source is removed after union into target |
| `dedupe` | `parent` children-array pointer; optional `recursive: true` |

Examples of pointers: `/bookmarksBar`, `/otherBookmarks/2`, `/bookmarksBar/0/children`.
Added references require HTTP(S) without embedded credentials; existing bookmarklets are preserved.
There is deliberately no bulk-delete operation.

Folder merging requires identical title and other folder metadata. Keep the target's order, append
unseen source children in source order, and recursively union same-metadata folders. Different-title
bookmarks sharing a URL remain; bookmarks are deduplicated only when their complete objects match
within one sibling list. Same URLs in different topics remain unless those topics are explicitly
merged. Different unknown metadata prevents merging rather than being discarded.

For same-content folders with different names, explicitly rename first if that is what the user
wants. Audit reports are evidence, not authorization to deduplicate globally. Source folder removal
does not remove its unique children. Reordering is an explicit `move`, never automatic sorting.

Use `plan --base-commit <inspect-commit> --operations FILE`, inspect its result, then `apply --plan <returned-plan-path>`.
Plans and operation files are private local data. After publication, Evergreen detects the new
`lastModified` / provider `lastSynced` timestamp and updated agent identity on its next pull.

Unknown fields and providers are preserved. Numeric metadata that cannot round-trip through JavaScript JSON is refused before editing rather than rounded or converted to null. Publication pushes only the requested default-branch commit, not unrelated local tags.
