# Smallest honest path to connected mode

No production datastore or credentials were created in this execution. No unrelated workbook was selected. A dedicated SQLite database is implemented, tested and disabled by default. It needs two user-controlled account actions:

1. Authorize a Render plan that supports a persistent disk, then attach the smallest appropriate disk at `/var/data` to the existing service. This may add cost; no resource or plan change is authorized merely by this document. Database destination: `/var/data/taskui.sqlite`. Keep one service instance. Back up snapshots before changes.
2. Connect an OAuth 2.1 authorization provider supporting authorization code with PKCE and a ChatGPT-compatible registration method (CIMD or DCR), public authorization-server discovery and JWKS, JWT access tokens signed RS256/ES256 with expiration, issuer, audience, immutable owner `sub` and scope strings `taskui:read taskui:write`. No custom token in a native form. Configure the issuer for this MCP resource and permit only your account.

Set these Render environment variables through the dashboard, after the disk and OAuth are ready:

```
TASKUI_STORAGE_MODE=persistent
TASKUI_DATABASE_PATH=/var/data/taskui.sqlite
TASKUI_PUBLIC_URL=https://taskui-mcp-square-test.onrender.com
TASKUI_OAUTH_ISSUER=<verified issuer URL>
TASKUI_OAUTH_AUDIENCE=<resource audience; typically the full MCP endpoint>
TASKUI_JWKS_URL=<verified issuer JWKS URL>
TASKUI_OWNER_SUBJECT=<your immutable subject at that issuer>
```

These selectors are configuration, not hardcoded secrets. Do not commit credentials. The service validates JWT signatures/issuer/audience/expiry/owner/scopes using jose. The protected-resource metadata endpoint exists only when configuration is complete. The external issuer handles login/token issuance; this server does not invent an authorization server.

Then enable OAuth in the TaskUI plugin configuration, reconnect and refresh its actions. Verify `get_taskui_configuration` reports connected mode; do the synthetic Create → Preview → explicit Approve → Commit → fresh Load → Complete → Preview → Approve → Commit → fresh Load flow. Inspect revisions and saved values. Restart the service and load again to prove production durability. Delete synthetic data only through a separately authorized maintenance operation (there is no delete tool in v1).

Google Sheets is deferred because the host's Drive connector cannot be reused as server credentials and a bare Sheets snapshot write cannot provide the promised transactional revision checks. No service-account adapter is claimed. If a cost-free durable transactional store is preferred, choose and authorize it before adding an adapter. Do not use ephemeral Render files as a substitute.
