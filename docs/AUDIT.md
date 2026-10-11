# Audit — 2026-10-11

Starting main and live Render commit: `c587a73d902effd75dbcc1242544b2c61690785c`. Node/Express/MCP prototype; package version 0.2.0 versus server version 0.3.0. No tests, durable persistence, canonical engine or executable kit files. `/health` responded and installed `ping`/`echo_form` round trips succeeded. Render service is Docker, free plan, single instance, branch main, autoDeploy yes / commit trigger. No Postgres instances found. Runtime status showed no credential bindings. Repository is public; private source reports and project data are not committed.

Source: the accessible native Drive document titled “TaskUI — Complete Project Retrospective” (35-page report supplied as a native copy) was read in full, including its technical critique/follow-up sections. No DOCX attachment, separate review bundle, original revision-2 kit, or AGENTS.md was found in workspace/search. Its reconstructed inventory informed replacement recipes; these are labeled accordingly. The named “ChatGPT Task UI — Sandbox Prototype” was identified by authorized Drive search, not guessed, and left untouched. No Google Sheets production destination was created.

Historical [SPEC]: creation/review/manage templates, five stored statuses, identity, graph validation, resets, instructions scopes and persistence rules. [TESTED historically]: native complete JSON → conversation → assistant → echo_form and iframe rendering. [CODE historically / UNVERIFIED host]: widget direct tool call. [DESIGN]: canonical engine, approvals, storage. [DEFERRED]: general conditions, full scheduling, arbitrary schema customization. This implementation does not turn historical labels into blanket verification claims; see acceptance matrix.

Current supported documentation retrieved before editing:
- https://developers.openai.com/apps-sdk/build/mcp-server
- https://developers.openai.com/apps-sdk/build/chatgpt-ui
- https://developers.openai.com/apps-sdk/build/auth

Documentation establishes window.openai.callTool for coherent widgets, not shared native state. It specifies OAuth authorization-code/PKCE for ChatGPT MCP; custom API keys and service-account machine grants are not a substitute for user authentication. Code uses supported APIs and refuses private access without JWT owner/scope validation. No guessed postMessage implementation was added.

Installed dependency resolution inspected: MCP SDK 1.32.1, Express 4.22.3, Zod 3.25.76; jose 6.2.12 added. npm ci and committed package-lock make deployment reproducible. Production npm audit returned zero vulnerabilities at execution time.

Architecture decision: one JavaScript runtime, shared deterministic engine, strict Zod canonical schemas, review hash, transactional SQLite snapshot history, optional coherent editor, native-first assistant guidance. Deployed default is simulation, pending user-authorized persistent disk and OAuth. Free ephemeral filesystem is never treated as a datastore.
