# Advertising API status

## Current endpoints

These routes should be preferred for new integrations:

- `POST /api/adv/normquery/stats` → WB `POST /adv/v0/normquery/stats`
- `POST /api/adv/normquery/stats-v1` → WB `POST /adv/v1/normquery/stats`
- `GET /api/adv/fullstats` → WB `GET /adv/v3/fullstats`
- `POST /api/adv/stats` → WB Media `POST /adv/v1/stats`

## Legacy endpoints

The following local routes are intentionally retained for backward compatibility. **Do not remove them or replace them with an assumed equivalent without confirming an official Wildberries replacement for the same use case.**

| Local MCP route | Current WB route used internally | Status | Policy |
|---|---|---|---|
| `GET /api/adv/auto/stat-words` | `GET /adv/v2/auto/stat-words` | Legacy / deprecated | Keep for compatibility; do not use for new integrations |
| `GET /api/adv/stat/words` | `GET /adv/v1/stat/words` | Legacy / deprecated | Keep for compatibility; do not remove until an official replacement is confirmed for the required use case |
| `GET /api/adv/stats/keywords` | `GET /adv/v0/stats/keywords` | Legacy / deprecated / potentially unstable | Keep for compatibility; do not remove until an official replacement is confirmed |

## Important compatibility rule

The existence of a newer advertising statistics endpoint does **not** by itself make it a safe drop-in replacement for a legacy endpoint. The response schema, campaign types, filtering semantics, and availability of keyword/phrase-level data must match the use case before migration.

Therefore this repository deliberately keeps the three legacy routes available while the current endpoints are used for new integrations.

## Scope

This document covers advertising statistics only. The WB promotion calendar and the `Prices and discounts` API category are intentionally outside the scope of this MCP project.
