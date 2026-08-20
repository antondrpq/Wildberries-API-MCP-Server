# WB API contract validation

`wb-api-mcp-server.js` is the production Express application and the Node.js/Docker entrypoint. It installs one centralized validation middleware before the existing API routes.

The validation layer preserves existing local routes and legacy request normalization; it does not remove or rename compatibility routes.

## Validated groups

### Sales Funnel v3

`POST /api/nm-report/detail`

Legacy fields such as `period`, `nmIDs`, `objectIDs`, and `tagIDs` are normalized and validated against the v3 contract. The selected period is limited to 365 days and product IDs are limited to 1000.

`POST /api/nm-report/detail/history`

The normalized request requires `aggregationLevel` (`day` or `week`) and limits `nmIds` to 20.

`POST /api/nm-report/grouped/history`

The selected period is limited to 7 days. The product/category filter combination count (subjects × brands × tags) is limited to 16.

### Search Report v2

`/api/search-report/report` validates the main report contract, including `currentPeriod`, `positionCluster`, `orderBy`, `limit`, and `offset`.

`/api/search-report/product/search-texts` validates `currentPeriod`, `nmIds`, `topOrderBy`, `orderBy`, `limit`, and `offset`.

`/api/search-report/product/orders` uses a separate contract: `period`, `nmId`, and `searchTexts`, with a maximum period of 7 days.

### Stocks Report v2

The product/group/size/offices routes validate supported `availabilityFilters`, non-negative pagination values, and array sizes.

### Advertising campaign fullstats

`GET /api/adv/fullstats` validates 1–50 numeric campaign IDs and a maximum 31-day interval before the WB request is sent.

## Error behavior

Contract violations return HTTP `400` with the existing server error envelope:

```json
{
  "error": true,
  "message": "...",
  "details": {
    "field": "..."
  }
}
```

The validation middleware runs before the outbound Axios call, so invalid requests do not consume a Wildberries API request.

## Runtime

- `wb-api-mcp-server.js` — production Express application and Node.js/Docker entrypoint.
- `lib/apiContractMiddleware.js` — centralized route-aware contract validation middleware.
- `lib/apiContractValidation.js` — shared validation rules.

## Tests

- `tests/apiContractValidation.test.js` — unit tests for the shared validators.
- `tests/apiContractValidation.integration.test.js` — HTTP integration tests against the real production application module, proving invalid requests return `400` before Axios and valid requests still proxy to the expected WB endpoint.
