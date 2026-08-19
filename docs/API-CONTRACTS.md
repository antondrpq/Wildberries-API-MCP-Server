# WB API contract validation

`server-entry.js` is the production entrypoint for Node.js/Docker and installs one centralized validation layer before the existing Express routes.

The original `wb-api-mcp-server.js` remains the application module and keeps its legacy normalization/proxy behavior. The validated entrypoint does not remove or rename local routes.

## Validated groups

### Sales Funnel v3

`POST /api/nm-report/detail`

Legacy fields such as `period`, `nmIDs`, `objectIDs`, and `tagIDs` are normalized by the existing server and validated against the v3 contract. The selected period is limited to 365 days and product IDs are limited to 1000.

`POST /api/nm-report/detail/history`

The normalized request requires `aggregationLevel` (`day` or `week`) and limits `nmIds` to 20.

`POST /api/nm-report/grouped/history`

The selected period is limited to 7 days. The product/category filter combination count (subjects × brands × tags) is limited to 16.

### Search Report v2

The main report and table endpoints require `currentPeriod`, `positionCluster`, `orderBy`, `limit`, and `offset`.

`product/search-texts` validates `currentPeriod`, `nmIds`, `topOrderBy`, `orderBy`, `limit`, and `offset`.

`product/orders` uses a separate contract: `period`, `nmId`, and `searchTexts`, with a maximum period of 7 days.

### Stocks Report v2

The product/group/size/offices routes validate supported `availabilityFilters`, non-negative pagination values, and array sizes. `selectedPeriod` is accepted by the validator for compatibility with the existing examples and is mapped to the contract field used for validation.

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

The validation layer runs before the outbound Axios call, so invalid requests do not consume a Wildberries API request.

## Runtime entrypoints

- `server-entry.js` — Node.js/Docker entrypoint with contract validation.
- `wb-api-mcp-server.js` — Express application module and existing route implementation.
- `worker-entry.mjs` — imports `server-entry.js` so Cloudflare Workers use the same validation layer.

## Tests

- `tests/apiContractValidation.test.js` — unit tests for the shared validators.
- `tests/apiContractValidation.integration.test.js` — HTTP integration tests proving invalid requests return `400` before Axios and valid requests still proxy to the expected WB endpoint.
