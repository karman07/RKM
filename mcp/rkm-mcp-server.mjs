#!/usr/bin/env node
/**
 * RKM management MCP server (stdio).
 *
 * Exposes the read-only accounts & management tools of the RKM backend — profit & loss, GST,
 * journal entries, trial balance, ledgers, sales, inventory valuation, … — to any MCP client
 * (Claude Desktop, Claude Code, …). The tool list and behaviour come live from the backend
 * (GET /ai/tools, POST /ai/tools/:name), so this server never drifts from the reports in the admin portal.
 *
 * Environment:
 *   RKM_API_URL    backend base URL            (default http://localhost:3000)
 *   RKM_API_TOKEN  an admin user's JWT         (required — copy `admin_token` from the admin portal's localStorage)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API = (process.env.RKM_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.RKM_API_TOKEN || '';

async function api(path, init = {}) {
  if (!TOKEN) throw new Error('RKM_API_TOKEN is not set. Provide an admin JWT in the server environment.');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `RKM API ${res.status} on ${path}`);
  return body;
}

const server = new Server(
  { name: 'rkm-management', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = await api('/ai/tools');
  return { tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    const { result } = await api(`/ai/tools/${encodeURIComponent(req.params.name)}`, {
      method: 'POST',
      body: JSON.stringify({ input: req.params.arguments ?? {} }),
    });
    return { content: [{ type: 'text', text: result }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: String(e?.message || e) }] };
  }
});

await server.connect(new StdioServerTransport());
