# TaskUI personal v1 — tested vertical slice

TaskUI turns conversational plans into canonical, editable dependency-aware drafts. This refactors the original Node/Express/MCP diagnostic prototype. **Production persistence is disabled until a durable disk and OAuth are configured. This release is not yet daily-use-ready.** No Google Sheet is modified; no paid resources are provisioned.

## Use today

Open https://taskui-mcp-square-test.onrender.com/editor/ for the local planning editor. Enter project details, add/edit tasks, select task nodes, change prerequisites, review conflicts and export complete draft JSON. Import that JSON to resume; this tab does not silently save private data into browser storage. AI proposals come from ChatGPT using the full draft, not an embedded scheduling model. The optional MCP widget owns its entire state. Native adaptive forms remain the preferred ChatGPT flow, with full JSON sent through a conversation turn. Templates do not automatically render a native UI.

`examples/chrysler-synthetic.json` demonstrates diagnostic branching; all its statuses are synthetic.

## Development

Node >=22.13.0. `npm ci && npm run build && npm test`; `npx playwright install chromium && npm run test:ui`; `npm start`. `/health`, `/mcp`, `/editor/`. Production Docker builds and runs engine/storage/MCP tests before creating the runtime image. The lockfile fixes actual dependency resolution; GitHub checks also run Chromium interactions. Stateless Streamable HTTP and stdio diagnostics are preserved.

## Contracts

`lib/schema.mjs` is authoritative; generated schemas and flexible recipes live in `templates/`. `lib/engine.mjs` is shared with the editor. Immutable project/task/draft IDs, source revision and task versions are independent of display aliases and storage columns. Translate UI name/id/estimated_min using `adaptTask`; ambiguous mappings fail. Unknown estimates stay null. Pending conditional effort is separate from definite effort. Stored status, effective readiness, applicability, archival, provenance and proposal changes are separate dimensions. Saved exclusions remain historical; superseded split parents and new child IDs remain auditable.

`preview_project_changes` returns exact digest of canonical draft plus source snapshot. Connected preview reads the real store. After user approval, `commit_approved_changes` validates under a SQLite `BEGIN IMMEDIATE` transaction, checks project/task revisions, verifies digest/draft revision, updates snapshots/history, and verifies readback before commit. The same approval ID and identical payload are safely retryable; reuse for another request fails. Reviewed changes are not authorization until explicit user approval. Future-project defaults are blocked in v1.

Tools: `get_taskui_configuration`, `validate_project_draft`, `preview_project_changes`, `list_projects`, `load_project`, `commit_approved_changes`, optional `render_taskui_editor`; diagnostics `ping`, `echo_form`, `render_taskui_square`. Discovery in the installed ChatGPT plugin must be separately verified after deployment. A raw MCP client discovering tools does not prove ChatGPT has refreshed its registry.

## Storage and auth

See [storage setup](docs/STORAGE.md). SQLite is the implemented transactional path; local reopen tests prove real disk persistence on the test machine only. Render free-service filesystem is ephemeral and is never used for saved project data. Production storage requires an actual persistent disk mounted at `/var/data` and supported OAuth. The code rejects unauthenticated private reads/writes even when explicit_approval is supplied. A bearer string in tool arguments is not supported authentication.

Google Sheets was investigated as the preferred path. The connected Drive app has user-scoped tools, but does not supply credentials to this MCP runtime. Sheets also has no atomic compare-and-swap for snapshot revision writes. We did not ship a racy Sheets save while claiming transaction guarantees. Google Sheets support is deferred; the explicitly named sandbox was discovered but untouched.

## Evidence and limitations

[Audit](docs/AUDIT.md), [acceptance matrix](docs/ACCEPTANCE.md), [assistant workflow](templates/SKILL-ADDENDUM.md). The retrospective was read from the user's private Drive copy; it is not committed into this public repository. The original nine revision-2 files and separate extended review bundle were unavailable. New recipes are reconstructed guidance, not claimed copies. Historical SPEC/TESTED/CODE/DESIGN/DEFERRED/UNVERIFIED distinctions remain in the audit.

No speculative native/iframe bridge, silent native MCP calls, arbitrary execution, global preference persistence, scheduling engines, or AI cost prediction. The dependency inspector is the functional graph fallback: node selection opens the matching editor and edits recalculate all relationships/blockers. Live ChatGPT widget clicks/OAuth must still be tested in the host.
