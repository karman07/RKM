# RKM management MCP server

Lets Claude Desktop / Claude Code (any MCP client) read the same accounts and management data as the
admin portal's **AI Analytics** page: profit & loss, cash flow, balance sheet, GST, **journal entries,
trial balance, ledgers**, sales, old gold, gold investment, purchases, refunds, inventory valuation and
receivables. Every tool is read-only.

## Setup

1. Make sure the backend is running (`npm run start:dev`).
2. Get an admin token: sign in to the admin portal, open the browser console and run
   `localStorage.getItem('admin_token')`.
3. Register the server with your MCP client. For Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "rkm-management": {
      "command": "node",
      "args": ["/absolute/path/to/RKM/backend/mcp/rkm-mcp-server.mjs"],
      "env": {
        "RKM_API_URL": "http://localhost:3000",
        "RKM_API_TOKEN": "<admin token>"
      }
    }
  }
}
```

For Claude Code: `claude mcp add rkm-management -e RKM_API_URL=http://localhost:3000 -e RKM_API_TOKEN=<token> -- node /absolute/path/to/RKM/backend/mcp/rkm-mcp-server.mjs`

Tokens expire like normal logins — refresh `RKM_API_TOKEN` when the portal session does.

## In-portal assistant

The admin portal's AI Analytics page uses the same tools through the Claude API. It needs
`ANTHROPIC_API_KEY` in the backend environment (optional `AI_MODEL`, default `claude-opus-5-5`).
