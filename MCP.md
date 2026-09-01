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

## Connecting from Claude Code

Register the server with the Claude Code CLI using the `http` transport:

```bash
claude mcp add --transport http wb-mcp http://localhost:3000/mcp \
  --header "Authorization: Bearer YOUR_MCP_API_KEY"
```

`--header` takes a full `Name: Value` pair, not a bare token — passing just the key (e.g. `--header "YOUR_MCP_API_KEY"`) is silently sent as a malformed header and the server rejects the request with `401 Unauthorized`. `X-MCP-API-Key: YOUR_MCP_API_KEY` works the same way, as an alternative to the `Authorization: Bearer` form. If `MCP_API_KEY` is unset on the server, omit `--header` entirely.

## MCP lifecycle

A normal MCP client should use this sequence:

1. `initialize`
2. `notifications/initialized`
3. `tools/list`
4. `tools/call`

`server/discover` is also supported as a lightweight capability/discovery endpoint for local diagnostics.

## Token permissions and read-only mode

**`WB_API_KEY` is a Wildberries API token, and this server enforces no permission logic of its own — Wildberries does.** Every `tools/call` is proxied straight through with the configured `Authorization` header, so the token's own category access and its "read-only" flag are what actually decide whether a call succeeds.

Wildberries lets you scope a token in two independent ways when you create it in the seller cabinet (Профиль → Настройки → Доступ к API):

1. **Categories** (Контент, Аналитика, Финансы, Продвижение, Вопросы и отзывы, Маркетплейс, и т.д.) — a token only works against endpoints in the categories it was granted.
2. **"Только чтение" (read-only) flag** — when set, Wildberries rejects *any* write/modify request from that token, regardless of which categories it has.

This server has 12 tools that call a write/modify Wildberries endpoint (`readOnlyHint: false` in their `annotations`, see the table below). **If `WB_API_KEY` was issued with the read-only flag, all 12 will return an error (HTTP 403 from Wildberries, surfaced as an MCP tool result with `isError: true`) — the server does not filter them out of `tools/list`, so an MCP client will still see and may still attempt to call them, but Wildberries itself will refuse the request.**

**Recommendation:** for any MCP client whose job is analytics/reporting only, issue `WB_API_KEY` with the read-only flag enabled and grant only the categories the tools you actually use require (the tables below are grouped by the WB token category each tool needs). This is a stronger guarantee than relying on the client (human or AI agent) to only call the tools it's supposed to — the rejection happens at Wildberries, not in this server or in the client's judgement.

If a use case genuinely needs a write tool (e.g. `wb_order_cancel` for an order-management agent), issue a **separate** token scoped to only the categories and write access that specific use case needs, rather than removing the read-only flag from the general-purpose analytics token.

## Tools (32)

`readOnlyHint`/`destructiveHint` below mirror the `annotations` each tool declares in `tools/list`, per the MCP spec. "WB endpoint" is the underlying Wildberries API call the tool proxies.

### Аналитика (Analytics)

| Tool | Kind | WB endpoint | Notes |
|---|---|---|---|
| `wb_sales_funnel` | READ | `POST /api/analytics/v3/sales-funnel/products` | Product sales funnel for selected `nmIds` and dates. |
| `wb_sales_funnel_history` | READ | `POST /api/analytics/v3/sales-funnel/products/history` | Daily/weekly/monthly sales funnel history. |
| `wb_search_texts` | READ | `POST /api/v2/search-report/product/search-texts` | Search queries for selected products. Requires the Jam subscription on WB's side. |
| `wb_stocks` | READ | `POST /api/v2/stocks-report/products/products` | Product stock report. |

### Продвижение (Promotion / Advertising)

| Tool | Kind | WB endpoint | Notes |
|---|---|---|---|
| `wb_ad_campaign_stats` | READ | `GET /adv/v3/fullstats` | Campaign stats, max 31-day period, up to 50 campaign IDs. |
| `wb_adv_campaigns_count` | READ | `GET /adv/v1/promotion/count` | Campaign IDs grouped by type/status — call first to discover IDs. |
| `wb_adv_campaigns_info` | READ | `GET /api/advert/v2/adverts` | Details for up to 50 campaigns. |
| `wb_adv_balance` | READ | `GET /adv/v1/balance` | Promotion cabinet balance, netting balance, bonus funds. |
| `wb_adv_budget` | READ | `GET /adv/v1/budget` | Spending cap for one campaign. |
| `wb_adv_bids_recommendations` | READ | `GET /api/advert/v0/bids/recommendations` | Recommended bids for a product/cluster in a campaign. |
| `wb_ads_summary` | READ (aggregated) | `wb_adv_campaigns_count` + `GET /adv/v3/fullstats` in batches | Whole-account ad overview: per-campaign and total views/clicks/CTR/spend/CR. Max 31-day period. |

### Финансы (Finance)

| Tool | Kind | WB endpoint | Notes |
|---|---|---|---|
| `wb_account_balance` | READ | `GET /api/v1/account/balance` | Seller account balance + withdrawable amount. |
| `wb_sales_report_list` | READ | `POST /api/finance/v1/sales-reports/list` | List of realization reports with per-report totals. Data from 1 Jan 2025. |
| `wb_sales_report_detailed` | READ | `POST /api/finance/v1/sales-reports/detailed` | Line-item detail (sale/return/penalty/deduction), paginated by `rrdId`. Replaces the deprecated `reportDetailByPeriod`. Data from 29 Jan 2024. |
| `wb_sales_report_detailed_by_id` | READ | `POST /api/finance/v1/sales-reports/detailed/{reportId}` | Same as above, scoped to one report from `wb_sales_report_list`. |
| `wb_acquiring_detailed` | READ | `POST /api/finance/v1/acquiring/detailed` | Payment-processing (acquiring) fees, separate from commission/logistics. Russian sellers only. |
| `wb_finance_summary` | READ (aggregated) | paginated `sales-reports/detailed` | Server-side P&L rollup: revenue, commission, logistics, storage, acceptance, penalties, deductions, acquiring, per-nmId top breakdown. Has built-in 429 retry with WB's `retryAfter` hint. |

### Вопросы и отзывы (Feedbacks & Questions)

| Tool | Kind | WB endpoint | Notes |
|---|---|---|---|
| `wb_feedbacks_questions_unread` | READ | `GET /api/v1/new-feedbacks-questions` | `hasNewQuestions`/`hasNewFeedbacks` flags. |
| `wb_feedbacks_list` | READ | `GET /api/v1/feedbacks` | Paginated, filterable review list. |
| `wb_feedback_answer` | **WRITE** | `POST` / `PATCH /api/v1/feedbacks/answer` | Posts (or, with `edit: true`, edits within 60 days) a **customer-visible** public reply. Review text before calling. |
| `wb_questions_list` | READ | `GET /api/v1/questions` | Paginated, filterable question list (max 10000 per response). |
| `wb_question_view` | **WRITE** | `PATCH /api/v1/questions` | Marks a question as viewed (`wasViewed: true`). |
| `wb_question_answer` | **WRITE** | `PATCH /api/v1/questions` | Posts (or edits within 60 days) a **customer-visible** reply, subject to WB moderation. |
| `wb_chats_list` | READ | `GET /api/v1/seller/chats` | All buyer chats. |
| `wb_chat_events` | READ | `GET /api/v1/seller/events` | New chat events/messages, cursor-paginated via `next`. |
| `wb_chat_send_message` | **WRITE** | `POST /api/v1/seller/message` (multipart) | Sends a **customer-visible** message immediately. No file attachments. |

### Тарифы (Tariffs — works with a token of any category)

| Tool | Kind | WB endpoint | Notes |
|---|---|---|---|
| `wb_tariffs_commission` | READ | `GET /api/v1/tariffs/commission` | Commission % by category. |
| `wb_tariffs_box` | READ | `GET /api/v1/tariffs/box` | Daily logistics/storage tariffs (box = Supersafe). |

### Маркетплейс (FBS Orders)

| Tool | Kind | WB endpoint | Notes |
|---|---|---|---|
| `wb_orders_new` | READ | `GET /api/v3/orders/new` | New FBS assembly orders awaiting action. |
| `wb_orders_status` | READ | `POST /api/v3/orders/status` | `supplierStatus`/`wbStatus` + cancellability for up to 1000 orders. |
| `wb_order_cancel` | **WRITE / DESTRUCTIVE** | `PATCH /api/v3/orders/{orderId}/cancel` | **Irreversible, customer-facing.** Only possible before hand-over to WB — check `isCancellable` via `wb_orders_status` first. Confirm with a human before calling. |

### Агрегаты (cross-category composites)

| Tool | Kind | Built from | Notes |
|---|---|---|---|
| `wb_business_summary` | READ (aggregated) | `wb_finance_summary` + `wb_ads_summary` + `wb_orders_new` | Top-level "how's the business doing" snapshot. Does **not** include stock levels — call `wb_stocks` separately. Requires tokens with Finance, Promotion, and Marketplace categories all granted. |

**Summary: 32 tools total — 20 plain READ, 5 READ-aggregated/composite, 12 WRITE (one of which, `wb_order_cancel`, is also destructive).** All WRITE tools fail closed against a read-only-flagged token (see previous section).

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

The response should contain all 32 tools listed in the [Tools](#tools-32) table above — regardless of whether `WB_API_KEY` is read-only. `tools/list` is not filtered by token permissions; only `tools/call` against a write tool will fail if the token can't perform it.

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

A successful call contains both `content` and `structuredContent`. Errors from Wildberries are returned as MCP tool results with `isError: true`, including HTTP status and rate-limit retry information when available. A read-only token calling a WRITE tool will surface as `isError: true` with HTTP status `403`.

## Rate limits

The current Wildberries analytics endpoints are rate-limited per seller account. In particular, the product stock report and search-text analytics endpoints are documented at 3 requests per minute with a 20-second interval. Advertising `adv/v3/fullstats` is also limited to 3 requests per minute. `wb_finance_summary` and `wb_business_summary` page through `sales-reports/detailed` server-side and retry once on `429` honoring WB's retry-after hint (see `FINANCE_RETRY_MAX_ATTEMPTS`/`FINANCE_RETRY_MIN_WAIT_MS`/`FINANCE_RETRY_MAX_WAIT_MS` in `.env`); other tools do not retry and will surface a `429` immediately. Keep live smoke tests to one request per endpoint and wait for the documented retry period after a `429`.
