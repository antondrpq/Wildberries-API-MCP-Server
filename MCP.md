# MCP server

The project exposes the existing Wildberries REST API and a stateless MCP Streamable HTTP endpoint on the same port.

## Endpoints

- REST API: `http://localhost:3000`
- MCP Streamable HTTP: `http://localhost:3000/mcp`

The MCP implementation targets protocol revision `2026-07-28` and also accepts the `2025-11-25` initialize flow for backwards compatibility.

## Configuration

Set these variables in `.env`:

```env
PORT=3000
NODE_ENV=production
RATE_LIMIT_MAX=100
WB_API_KEY=your-wildberries-token
MCP_API_KEY=optional-secret-for-mcp-clients
WB_REQUEST_TIMEOUT_MS=60000
```

`WB_API_KEY` stays server-side and is never exposed as a tool argument. If `MCP_API_KEY` is set, MCP clients must send it as `X-MCP-API-Key` or `Authorization: Bearer <key>`. Leave it empty only when the MCP endpoint is intentionally exposed behind another trusted network boundary.

## MCP lifecycle

A normal MCP client should use this sequence:

1. `initialize`
2. `notifications/initialized`
3. `tools/list`
4. `tools/call`

`server/discover` is also supported as a lightweight capability/discovery endpoint for local diagnostics.

## Tools

- `wb_sales_funnel` — `POST /api/analytics/v3/sales-funnel/products`; product sales funnel for selected `nmIds` and dates.
- `wb_sales_funnel_history` — `POST /api/analytics/v3/sales-funnel/products/history`; daily/weekly/monthly sales funnel history.
- `wb_search_texts` — `POST /api/v2/search-report/product/search-texts`; search queries associated with selected products. Wildberries requires the appropriate Jam subscription for this endpoint.
- `wb_stocks` — `POST /api/v2/stocks-report/products/products`; product stock report.
- `wb_ad_campaign_stats` — `GET /adv/v3/fullstats`; advertising campaign statistics.

All currently exposed tools are read-only.

## Local protocol smoke test

Set the protocol header first:

```powershell
$headers = @{
    "MCP-Protocol-Version" = "2026-07-28"
    "Content-Type" = "application/json"
}
```

### Initialize

```powershell
$body = @{
    jsonrpc = "2.0"
    id = 1
    method = "initialize"
    params = @{
        protocolVersion = "2026-07-28"
        capabilities = @{}
        clientInfo = @{ name = "local-test"; version = "1.0.0" }
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:3000/mcp" -Method POST -Headers $headers -Body $body
```

### List tools

```powershell
$body = @{
    jsonrpc = "2.0"
    id = 2
    method = "tools/list"
    params = @{}
} | ConvertTo-Json -Depth 10

$result = Invoke-RestMethod -Uri "http://localhost:3000/mcp" -Method POST -Headers $headers -Body $body
$result | ConvertTo-Json -Depth 20
```

The response should contain these five tools:

- `wb_sales_funnel`
- `wb_sales_funnel_history`
- `wb_search_texts`
- `wb_stocks`
- `wb_ad_campaign_stats`

### Real tool call

Use one small request to verify the MCP-to-Wildberries path. Do not repeatedly call the same Wildberries endpoint while its rate-limit window is active.

```powershell
$body = @{
    jsonrpc = "2.0"
    id = 3
    method = "tools/call"
    params = @{
        name = "wb_sales_funnel"
        arguments = @{
            nmIds = @(178773045)
            start = "2026-08-18"
            end = "2026-08-19"
        }
    }
} | ConvertTo-Json -Depth 20

$result = Invoke-RestMethod -Uri "http://localhost:3000/mcp" -Method POST -Headers $headers -Body $body
$result | ConvertTo-Json -Depth 30
```

A successful call contains both `content` and `structuredContent`. Errors from Wildberries are returned as MCP tool results with `isError: true`, including HTTP status and rate-limit retry information when available.

## Rate limits

The current Wildberries analytics endpoints are rate-limited per seller account. In particular, the product stock report and search-text analytics endpoints are documented at 3 requests per minute with a 20-second interval. Advertising `adv/v3/fullstats` is also limited to 3 requests per minute. Keep live smoke tests to one request per endpoint and wait for the documented retry period after a `429`.
