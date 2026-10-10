# TaskUI MCP UI Square Test

A deliberately harmless MCP Apps visual composition experiment. Registers a `render_taskui_square` tool and `ui://taskui-square/v1.html` with MIME type `text/html;profile=mcp-app`.

## MCP Market GitHub deploy

1. Create a **public GitHub repository** named `taskui-mcp-square-test`.
2. Put **all files from this directory in the repository root** (`package.json`, `server.mjs`, `widget.html`, `Dockerfile`, `README.md`). Do not upload the outer directory as a nested folder.
3. MCP Market → Tools → Deploy custom MCP → GitHub → Public repo.
4. URL: `https://github.com/YOUR_USERNAME/taskui-mcp-square-test` and name `TaskUI Square Test`.
5. Deploy. Check logs until Running. Its HTTP endpoint is `/mcp`, the health probe is `/health`.
6. Connect the deployed MCP server to an AI client with MCP Apps UI support. Ask the client to call `render_taskui_square`.

MCP Market may relay tools/resources but **may not render MCP Apps widget UI in its client or relay UI metadata intact**. Verify tools and resources in its inspector first. A supported ChatGPT app connection is needed for the final nested-composition experiment.

## Local run

```bash
npm install
npm start
# HTTP endpoint: http://localhost:3000/mcp
# Health: http://localhost:3000/health
```

For local stdio clients, use `MCP_TRANSPORT=stdio node server.mjs`.

## Scope

Pure UI example: blue square + two buttons, no spreadsheet, account access, external reads or writes. This does not add any secrets or authorization. Do not expose it for sensitive data or use as a production template without auth, origin checks, and additional MCP UI bridge testing.
