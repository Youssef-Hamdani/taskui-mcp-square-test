import { readFileSync } from 'node:fs';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const RESOURCE_URI = 'ui://taskui-square/v1.html';
const html = readFileSync(new URL('./widget.html', import.meta.url), 'utf8');

function makeServer() {
  const server = new McpServer({ name: 'taskui-square-test', version: '0.2.0' });
  server.registerResource('taskui-square', RESOURCE_URI, {}, async () => ({
    contents: [{ uri: RESOURCE_URI, mimeType: 'text/html;profile=mcp-app', text: html,
      _meta: { ui: { prefersBorder: true } } }],
  }));
  server.registerTool('render_taskui_square', {
    title: 'Render TaskUI square',
    description: 'Render a blue square saying "I am a plugin UI" and two clickable task nodes (P006 and P007). UI-only demo, no outside data access.',
    inputSchema: {},
    outputSchema: { title: z.string(), selectedTaskId: z.string() },
    _meta: { ui: { resourceUri: RESOURCE_URI },
      'openai/toolInvocation/invoking': 'Opening TaskUI square…',
      'openai/toolInvocation/invoked': 'TaskUI square ready.' },
  }, async () => ({
    structuredContent: { title: "I'm a plugin UI", selectedTaskId: 'P006' },
    content: [{ type: 'text', text: 'TaskUI square UI: choose P006 or P007. No project data read or written.' }],
  }));
  server.registerTool('ping', {
    title: 'Ping TaskUI',
    description: 'Return a minimal JSON pong response for connection testing. No inputs, reads, or writes.',
    inputSchema: {},
    outputSchema: { pong: z.boolean() },
  }, async () => ({
    structuredContent: { pong: true },
    content: [{ type: 'text', text: JSON.stringify({ pong: true }) }],
  }));
  server.registerTool('echo_form', {
    title: 'Echo TaskUI form',
    description: 'Accept a small TaskUI layout-preference form and echo the values back as JSON. Read-only experiment; nothing is stored.',
    inputSchema: {
      layout: z.enum(['compact', 'detailed']),
      default_view: z.enum(['dependency_graph', 'milestone_roadmap', 'task_list']),
      show_progress_bars: z.boolean(),
      currency: z.enum(['CAD', 'USD', 'EUR']),
    },
    outputSchema: {
      received: z.boolean(),
      layout: z.string(),
      default_view: z.string(),
      show_progress_bars: z.boolean(),
      currency: z.string(),
    },
  }, async ({ layout, default_view, show_progress_bars, currency }) => {
    const payload = { received: true, layout, default_view, show_progress_bars, currency };
    return { structuredContent: payload, content: [{ type: 'text', text: JSON.stringify(payload) }] };
  });
  return server;
}

if (process.env.MCP_TRANSPORT === 'stdio') {
  await makeServer().connect(new StdioServerTransport());
} else {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'taskui-square-test' }));
  app.all('/mcp', async (req, res) => {
    // Stateless Streamable HTTP: each POST starts a request-scoped MCP server.
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Use POST /mcp' });
    }
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request failed:', error);
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
    }
  });
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`TaskUI MCP listening on ${port}; endpoint /mcp`));
}
