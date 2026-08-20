# MCP server

The project now exposes the existing Wildberries REST API and a separate stateless MCP Streamable HTTP endpoint.

## Endpoints

- REST API: `http://localhost:3000`
- MCP Streamable HTTP: `http://localhost:3001/mcp`
- MCP health: `http://localhost:3001/health`

The MCP implementation targets the current stateless MCP revision `2026-07-28` and also accepts the `2025-11-25` initialize flow for backwards compatibility.

## Configuration

Set these variables in `.env`:

```env
PORT=3000
MCP_PORT=3001
WB_API_KEY=your-wildberries-token
MCP_API_KEY=optional-secret-for-mcp-clients
```

`WB_API_KEY` is kept server-side and is never exposed as a tool argument. If `MCP_API_KEY` is set, MCP clients must send it as `X-MCP-API-Key` or `Authorization: Bearer <key>`.

## Tools

- `wb_sales_funnel` — product sales funnel for selected `nmIds` and dates.
- `wb_sales_funnel_history` — daily/weekly/monthly sales funnel history.
- `wb_search_texts` — search queries associated with selected products.
- `wb_stocks` — current stocks report products endpoint.
- `wb_ad_campaign_stats` — advertising campaign statistics.

All currently exposed tools are read-only.

## Local protocol smoke test

List tools using the current MCP revision:

```powershell
$body = '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{}}'
Invoke-RestMethod -Uri "http://localhost:3001/mcp" -Method POST -ContentType "application/json" -Headers @{ "MCP-Protocol-Version" = "2026-07-28" } -Body $body

$body = '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}'
Invoke-RestMethod -Uri "http://localhost:3001/mcp" -Method POST -ContentType "application/json" -Headers @{ "MCP-Protocol-Version" = "2026-07-28" } -Body $body
```

For a real tool call, use `tools/call` with the selected tool name and arguments. Do not repeatedly call the same Wildberries endpoint while its rate-limit window is active.
