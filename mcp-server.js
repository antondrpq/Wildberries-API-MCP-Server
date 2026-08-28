require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.MCP_PORT || 3001);
const WB_API_KEY = process.env.WB_API_KEY || '';
const MCP_API_KEY = process.env.MCP_API_KEY || '';
const MCP_PROTOCOL_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSION = '2025-11-25';

const API_URLS = {
  ADVERT: 'https://advert-api.wildberries.ru',
  ANALYTICS: 'https://seller-analytics-api.wildberries.ru',
  FINANCE: 'https://finance-api.wildberries.ru'
};

// Max number of rrdId-paginated pages wb_finance_summary will follow before
// stopping, as a safety valve against runaway loops on very large periods.
const FINANCE_SUMMARY_MAX_PAGES = Number(process.env.FINANCE_SUMMARY_MAX_PAGES || 50);

const DATE_SCHEMA = {
  type: 'object',
  properties: {
    start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
  },
  required: ['start', 'end'],
  additionalProperties: false
};

const ORDER_BY_SCHEMA = {
  type: 'object',
  properties: {
    field: { type: 'string' },
    mode: { type: 'string', enum: ['asc', 'desc'] }
  },
  required: ['field', 'mode'],
  additionalProperties: false
};

const STOCKS_BODY_SCHEMA = {
  type: 'object',
  properties: {
    nmIDs: { type: 'array', items: { type: 'integer' } },
    subjectID: { type: 'integer' },
    brandName: { type: 'string' },
    tagID: { type: 'integer' },
    currentPeriod: DATE_SCHEMA,
    stockType: { type: 'string', enum: ['', 'wb', 'mp'] },
    skipDeletedNm: { type: 'boolean' },
    orderBy: ORDER_BY_SCHEMA,
    availabilityFilters: {
      type: 'array',
      items: { type: 'string', enum: ['deficient', 'actual', 'balanced', 'nonActual', 'nonLiquid', 'invalidData'] }
    },
    limit: { type: 'integer', minimum: 1, maximum: 1000 }
  },
  required: ['currentPeriod', 'stockType', 'skipDeletedNm', 'orderBy', 'availabilityFilters'],
  additionalProperties: false
};

// WB finance endpoints accept a date (YYYY-MM-DD) or a full RFC3339
// date-time; both are used in the wild depending on the integration.
const FINANCE_DATETIME_PATTERN =
  '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z)?)?$';

const FINANCE_PERIOD_SCHEMA = {
  type: 'string',
  enum: ['daily', 'weekly'],
  default: 'weekly',
  description: 'Report granularity: daily or weekly reports.'
};

const SALES_REPORT_DETAILED_SCHEMA = {
  type: 'object',
  properties: {
    dateFrom: { type: 'string', pattern: FINANCE_DATETIME_PATTERN, description: 'Report start date/time, Moscow time (UTC+3).' },
    dateTo: { type: 'string', pattern: FINANCE_DATETIME_PATTERN, description: 'Report end date/time, Moscow time (UTC+3).' },
    limit: { type: 'integer', minimum: 1, maximum: 100000, default: 100000 },
    rrdId: { type: 'integer', minimum: 0, default: 0, description: 'Pagination cursor: pass the rrdId of the last row from the previous page. Start at 0.' },
    period: FINANCE_PERIOD_SCHEMA,
    fields: { type: 'array', items: { type: 'string' }, description: 'Optional subset of response fields to return; all fields are returned if omitted.' }
  },
  required: ['dateFrom', 'dateTo'],
  additionalProperties: false
};

const AD_PARAMS_SCHEMA = {
  type: 'object',
  properties: {
    ids: { type: 'string', description: 'Comma-separated campaign IDs; maximum 50.' },
    beginDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
  },
  required: ['ids', 'beginDate', 'endDate'],
  additionalProperties: true
};

const tools = [
  {
    name: 'wb_sales_funnel',
    title: 'WB Sales Funnel',
    description: 'Get Wildberries product sales funnel statistics for one or more nmIDs and a selected date range.',
    inputSchema: {
      type: 'object',
      properties: {
        nmIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 1000, description: 'Wildberries product nmIDs.' },
        start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Period start date, YYYY-MM-DD.' },
        end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Period end date, YYYY-MM-DD.' },
        limit: { type: 'integer', minimum: 1, maximum: 1000 },
        offset: { type: 'integer', minimum: 0 }
      },
      required: ['nmIds', 'start', 'end'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_sales_funnel_history',
    title: 'WB Sales Funnel History',
    description: 'Get daily Wildberries sales funnel statistics for selected products.',
    inputSchema: {
      type: 'object',
      properties: {
        nmIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 1000 },
        start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        aggregationLevel: { type: 'string', enum: ['day', 'week', 'month'] }
      },
      required: ['nmIds', 'start', 'end'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_search_texts',
    title: 'WB Product Search Texts',
    description: 'Get Wildberries search queries associated with a product for a selected period. Jam subscription is required by Wildberries for this endpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        nmIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 50 },
        start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        topOrderBy: { type: 'string', enum: ['openCard', 'addToCart', 'openToCart', 'orders', 'cartToOrder'], default: 'openCard' },
        includeSubstitutedSKUs: { type: 'boolean', default: true },
        includeSearchTexts: { type: 'boolean', default: true },
        orderBy: ORDER_BY_SCHEMA,
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum 30 on Standard tariff; up to 100 on higher tiers according to WB API access.' }
      },
      required: ['nmIds', 'start', 'end'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_stocks',
    title: 'WB Stocks',
    description: 'Get Wildberries product stock report data from POST /api/v2/stocks-report/products/products.',
    inputSchema: {
      type: 'object',
      properties: {
        body: STOCKS_BODY_SCHEMA
      },
      required: ['body'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_ad_campaign_stats',
    title: 'WB Advertising Campaign Stats',
    description: 'Get Wildberries advertising campaign statistics from GET /adv/v3/fullstats. Maximum requested period is 31 days and up to 50 campaign IDs are supported.',
    inputSchema: {
      type: 'object',
      properties: {
        params: AD_PARAMS_SCHEMA
      },
      required: ['params'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_account_balance',
    title: 'WB Account Balance',
    description: 'Get the Wildberries seller account balance widget data from GET /api/v1/account/balance: current balance and amount available for withdrawal. Requires a token with the Finance category.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_sales_report_list',
    title: 'WB Sales (Realization) Report List',
    description: 'Get the list of Wildberries sales/realization reports for a period from POST /api/finance/v1/sales-reports/list, with per-report totals (retail amount, amount for pay, logistics, storage, penalties, deductions, bank payment, etc). Data available from 1 January 2025. Requires a token with the Finance category.',
    inputSchema: {
      type: 'object',
      properties: {
        dateFrom: { type: 'string', pattern: FINANCE_DATETIME_PATTERN, description: 'Report start date/time, Moscow time (UTC+3).' },
        dateTo: { type: 'string', pattern: FINANCE_DATETIME_PATTERN, description: 'Report end date/time, Moscow time (UTC+3).' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 1000 },
        offset: { type: 'integer', minimum: 0, default: 0 },
        period: FINANCE_PERIOD_SCHEMA
      },
      required: ['dateFrom', 'dateTo'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_sales_report_detailed',
    title: 'WB Sales (Realization) Report Detailed',
    description: 'Get line-item detail for Wildberries sales/realization reports over a period from POST /api/finance/v1/sales-reports/detailed: one row per sale/return/penalty/deduction event with commission, logistics, storage, acquiring fee, and payout fields. Data available from 29 January 2024. Paginate with rrdId (start at 0, pass the last row\'s rrdId to get the next page, stop when the response is empty). This replaces the deprecated GET /api/v5/supplier/reportDetailByPeriod. Requires a token with the Finance category.',
    inputSchema: SALES_REPORT_DETAILED_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_sales_report_detailed_by_id',
    title: 'WB Sales (Realization) Report Detailed by Report ID',
    description: 'Get line-item detail for one specific Wildberries sales/realization report from POST /api/finance/v1/sales-reports/detailed/{reportId}, identified by reportId (from wb_sales_report_list). Paginate with rrdId the same way as wb_sales_report_detailed. Requires a token with the Finance category.',
    inputSchema: {
      type: 'object',
      properties: {
        reportId: { type: 'integer', description: 'Report ID from wb_sales_report_list.' },
        limit: { type: 'integer', minimum: 1, maximum: 100000, default: 100000 },
        rrdId: { type: 'integer', minimum: 0, default: 0 },
        fields: { type: 'array', items: { type: 'string' } }
      },
      required: ['reportId'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_acquiring_detailed',
    title: 'WB Acquiring (Payment Processing) Fees Detailed',
    description: 'Get line-item detail of Wildberries payment-processing (acquiring) fees for a period from POST /api/finance/v1/acquiring/detailed. This is a separate cost from the commission/logistics figures in the sales report. Russian sellers only. Paginate with rrdId the same way as wb_sales_report_detailed. Requires a Personal or Service token with the Finance category.',
    inputSchema: SALES_REPORT_DETAILED_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_finance_summary',
    title: 'WB Finance P&L Summary (aggregated)',
    description: 'High-level financial summary for a period, built by automatically paginating POST /api/finance/v1/sales-reports/detailed server-side and aggregating the results. Returns total revenue (forPay), WB commission, logistics, storage, acceptance, penalties, deductions, acquiring fees, and a per-nmId breakdown of the top items by revenue. Use this instead of wb_sales_report_detailed when you just need the totals rather than every raw row. Requires a token with the Finance category.',
    inputSchema: {
      type: 'object',
      properties: {
        dateFrom: { type: 'string', pattern: FINANCE_DATETIME_PATTERN },
        dateTo: { type: 'string', pattern: FINANCE_DATETIME_PATTERN },
        period: FINANCE_PERIOD_SCHEMA,
        topN: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'How many top nmIds by revenue to include in the breakdown.' }
      },
      required: ['dateFrom', 'dateTo'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }
];

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

function auth(req, res, next) {
  if (!MCP_API_KEY) return next();
  const bearer = req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, '');
  const supplied = req.headers['x-mcp-api-key'] || bearer;
  if (supplied !== MCP_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function getWbKey() {
  if (!WB_API_KEY) {
    const error = new Error('WB_API_KEY is not configured on the MCP server');
    error.statusCode = 500;
    throw error;
  }
  return WB_API_KEY;
}

async function callWb(url, method, data) {
  const response = await axios({
    method,
    url,
    data: method === 'GET' ? undefined : data,
    params: method === 'GET' ? data : undefined,
    headers: { Authorization: getWbKey() },
    validateStatus: () => true,
    timeout: Number(process.env.WB_REQUEST_TIMEOUT_MS || 60000)
  });

  if (response.status >= 200 && response.status < 300) return response.data;

  const error = new Error(`Wildberries API returned HTTP ${response.status}`);
  error.statusCode = response.status;
  error.details = response.data;
  error.retryAfter = response.headers['x-ratelimit-retry'] || response.data?.retryAfter || null;
  throw error;
}

function requireDateRange(args) {
  if (!Array.isArray(args.nmIds) || args.nmIds.length === 0) throw new Error('nmIds must be a non-empty array');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.start) || !/^\d{4}-\d{2}-\d{2}$/.test(args.end)) {
    throw new Error('start and end must use YYYY-MM-DD format');
  }
}

function requireStocksBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object');
  const required = ['currentPeriod', 'stockType', 'skipDeletedNm', 'orderBy', 'availabilityFilters'];
  const missing = required.filter(key => body[key] === undefined);
  if (missing.length) throw new Error(`body is missing required fields: ${missing.join(', ')}`);
  if (!body.currentPeriod || !/^\d{4}-\d{2}-\d{2}$/.test(body.currentPeriod.start) || !/^\d{4}-\d{2}-\d{2}$/.test(body.currentPeriod.end)) {
    throw new Error('body.currentPeriod.start/end must use YYYY-MM-DD format');
  }
}

function requireAdParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('params must be an object');
  if (!params.ids || !String(params.ids).trim()) throw new Error('params.ids is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.beginDate) || !/^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) {
    throw new Error('params.beginDate and params.endDate must use YYYY-MM-DD format');
  }
  const ids = String(params.ids).split(',').map(value => value.trim()).filter(Boolean);
  if (ids.length > 50) throw new Error('params.ids supports a maximum of 50 campaign IDs');
}

function requireFinanceDateRange(args) {
  const pattern = new RegExp(FINANCE_DATETIME_PATTERN);
  if (!pattern.test(args.dateFrom) || !pattern.test(args.dateTo)) {
    throw new Error('dateFrom and dateTo must be YYYY-MM-DD or RFC3339 date-time strings');
  }
}

// Numeric fields in the sales-reports/detailed response that make up a P&L:
// WB returns money fields as strings, so everything is parsed with Number().
const FINANCE_SUMMARY_FIELDS = {
  retailAmount: 'revenueRetailAmount',
  forPay: 'payoutForPay',
  ppvzSalesCommission: 'commissionAmount',
  deliveryRub: 'logisticsAmount',
  paidStorage: 'storageAmount',
  paidAcceptance: 'acceptanceAmount',
  penalty: 'penaltyAmount',
  deduction: 'deductionAmount',
  additionalPayment: 'additionalPaymentAmount',
  acquiringFee: 'acquiringFeeAmount'
};

function toNumber(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchAllSalesReportDetailed({ dateFrom, dateTo, period }) {
  const rows = [];
  let rrdId = 0;
  let truncated = false;

  for (let page = 0; page < FINANCE_SUMMARY_MAX_PAGES; page += 1) {
    const pageRows = await callWb(`${API_URLS.FINANCE}/api/finance/v1/sales-reports/detailed`, 'POST', {
      dateFrom,
      dateTo,
      limit: 100000,
      rrdId,
      period: period || 'weekly'
    });

    if (!Array.isArray(pageRows) || pageRows.length === 0) break;

    rows.push(...pageRows);
    rrdId = pageRows[pageRows.length - 1].rrdId;

    if (page === FINANCE_SUMMARY_MAX_PAGES - 1) truncated = true;
  }

  return { rows, truncated };
}

function aggregateFinanceSummary(rows, topN) {
  const totals = Object.fromEntries(Object.values(FINANCE_SUMMARY_FIELDS).map(key => [key, 0]));
  const byNmId = new Map();

  for (const row of rows) {
    for (const [wbField, summaryKey] of Object.entries(FINANCE_SUMMARY_FIELDS)) {
      totals[summaryKey] += toNumber(row[wbField]);
    }

    const nmId = row.nmId;
    if (nmId === undefined || nmId === null) continue;

    if (!byNmId.has(nmId)) {
      byNmId.set(nmId, {
        nmId,
        title: row.title || null,
        vendorCode: row.vendorCode || null,
        subjectName: row.subjectName || null,
        quantity: 0,
        revenueForPay: 0
      });
    }
    const entry = byNmId.get(nmId);
    entry.quantity += toNumber(row.quantity);
    entry.revenueForPay += toNumber(row.forPay);
  }

  const topByNmId = Array.from(byNmId.values())
    .sort((a, b) => b.revenueForPay - a.revenueForPay)
    .slice(0, topN);

  return { totals, topByNmId, uniqueNmIdCount: byNmId.size };
}

async function executeTool(name, args = {}) {
  switch (name) {
    case 'wb_sales_funnel': {
      requireDateRange(args);
      const body = {
        selectedPeriod: { start: args.start, end: args.end },
        nmIds: args.nmIds,
        skipDeletedNm: false
      };
      if (args.limit !== undefined) body.limit = args.limit;
      if (args.offset !== undefined) body.offset = args.offset;
      return callWb(`${API_URLS.ANALYTICS}/api/analytics/v3/sales-funnel/products`, 'POST', body);
    }

    case 'wb_sales_funnel_history': {
      requireDateRange(args);
      return callWb(`${API_URLS.ANALYTICS}/api/analytics/v3/sales-funnel/products/history`, 'POST', {
        selectedPeriod: { start: args.start, end: args.end },
        nmIds: args.nmIds,
        skipDeletedNm: false,
        aggregationLevel: args.aggregationLevel || 'day'
      });
    }

    case 'wb_search_texts': {
      requireDateRange(args);
      const body = {
        currentPeriod: { start: args.start, end: args.end },
        nmIds: args.nmIds,
        topOrderBy: args.topOrderBy || 'openCard',
        includeSubstitutedSKUs: args.includeSubstitutedSKUs !== false,
        includeSearchTexts: args.includeSearchTexts !== false,
        orderBy: args.orderBy || { field: 'openCard', mode: 'desc' },
        limit: args.limit || 30
      };
      if (body.includeSubstitutedSKUs === false && body.includeSearchTexts === false) {
        throw new Error('includeSubstitutedSKUs and includeSearchTexts cannot both be false');
      }
      return callWb(`${API_URLS.ANALYTICS}/api/v2/search-report/product/search-texts`, 'POST', body);
    }

    case 'wb_stocks':
      requireStocksBody(args.body);
      return callWb(`${API_URLS.ANALYTICS}/api/v2/stocks-report/products/products`, 'POST', args.body);

    case 'wb_ad_campaign_stats':
      requireAdParams(args.params);
      return callWb(`${API_URLS.ADVERT}/adv/v3/fullstats`, 'GET', args.params);

    case 'wb_account_balance':
      return callWb(`${API_URLS.FINANCE}/api/v1/account/balance`, 'GET');

    case 'wb_sales_report_list': {
      requireFinanceDateRange(args);
      const body = {
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        period: args.period || 'weekly'
      };
      if (args.limit !== undefined) body.limit = args.limit;
      if (args.offset !== undefined) body.offset = args.offset;
      return callWb(`${API_URLS.FINANCE}/api/finance/v1/sales-reports/list`, 'POST', body);
    }

    case 'wb_sales_report_detailed': {
      requireFinanceDateRange(args);
      const body = {
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        limit: args.limit !== undefined ? args.limit : 100000,
        rrdId: args.rrdId !== undefined ? args.rrdId : 0,
        period: args.period || 'weekly'
      };
      if (args.fields !== undefined) body.fields = args.fields;
      return callWb(`${API_URLS.FINANCE}/api/finance/v1/sales-reports/detailed`, 'POST', body);
    }

    case 'wb_sales_report_detailed_by_id': {
      if (args.reportId === undefined || args.reportId === null) throw new Error('reportId is required');
      const body = {
        limit: args.limit !== undefined ? args.limit : 100000,
        rrdId: args.rrdId !== undefined ? args.rrdId : 0
      };
      if (args.fields !== undefined) body.fields = args.fields;
      return callWb(`${API_URLS.FINANCE}/api/finance/v1/sales-reports/detailed/${encodeURIComponent(args.reportId)}`, 'POST', body);
    }

    case 'wb_acquiring_detailed': {
      requireFinanceDateRange(args);
      const body = {
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        limit: args.limit !== undefined ? args.limit : 100000,
        rrdId: args.rrdId !== undefined ? args.rrdId : 0
      };
      if (args.fields !== undefined) body.fields = args.fields;
      return callWb(`${API_URLS.FINANCE}/api/finance/v1/acquiring/detailed`, 'POST', body);
    }

    case 'wb_finance_summary': {
      requireFinanceDateRange(args);
      const { rows, truncated } = await fetchAllSalesReportDetailed({
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        period: args.period
      });
      const { totals, topByNmId, uniqueNmIdCount } = aggregateFinanceSummary(rows, args.topN || 20);
      return {
        period: { dateFrom: args.dateFrom, dateTo: args.dateTo, granularity: args.period || 'weekly' },
        rowCount: rows.length,
        uniqueNmIdCount,
        truncated,
        totals,
        topByNmId
      };
    }

    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

function makeToolResult(data, isError = false) {
  return {
    resultType: 'complete',
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
    ...(isError ? { isError: true } : {})
  };
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'mcp', protocol: MCP_PROTOCOL_VERSION }));

app.post('/mcp', auth, async (req, res) => {
  const message = req.body;
  const id = message && message.id;
  const method = message && message.method;
  const params = message && message.params ? message.params : {};
  const protocol = req.headers['mcp-protocol-version'] || params?._meta?.['io.modelcontextprotocol/protocolVersion'];
  const modern = protocol === MCP_PROTOCOL_VERSION || method === 'server/discover';

  if (!message || message.jsonrpc !== '2.0' || !method) {
    return res.status(400).json(jsonRpcError(id ?? null, -32600, 'Invalid Request'));
  }

  try {
    if (method === 'server/discover') {
      return res.json(jsonRpcResult(id, {
        supportedProtocolVersions: [MCP_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'wildberries-api-mcp-server', version: '2.0.0' },
        instructions: 'Wildberries read-only analytics and advertising tools. WB credentials stay on the server.'
      }));
    }

    if (method === 'initialize') {
      const requested = params.protocolVersion || LEGACY_PROTOCOL_VERSION;
      const negotiated = [MCP_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION].includes(requested) ? requested : LEGACY_PROTOCOL_VERSION;
      return res.json(jsonRpcResult(id, {
        protocolVersion: negotiated,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'wildberries-api-mcp-server', version: '2.0.0' },
        instructions: 'Wildberries read-only analytics and advertising tools.'
      }));
    }

    if (method === 'notifications/initialized') return res.status(202).end();
    if (method === 'ping') return res.json(jsonRpcResult(id, {}));

    if (method === 'tools/list') {
      return res.json(jsonRpcResult(id, modern ? {
        resultType: 'complete',
        tools,
        ttlMs: 300000,
        cacheScope: 'public'
      } : { tools }));
    }

    if (method === 'tools/call') {
      if (!params.name) return res.status(400).json(jsonRpcError(id, -32602, 'Tool name is required'));
      if (!tools.some(tool => tool.name === params.name)) return res.status(400).json(jsonRpcError(id, -32602, `Unknown tool: ${params.name}`));
      try {
        const data = await executeTool(params.name, params.arguments || {});
        return res.json(jsonRpcResult(id, makeToolResult(data)));
      } catch (error) {
        const details = {
          message: error.message,
          status: error.statusCode,
          retryAfter: error.retryAfter || null,
          details: error.details || null
        };
        return res.json(jsonRpcResult(id, makeToolResult(details, true)));
      }
    }

    return res.status(400).json(jsonRpcError(id, -32601, `Method not found: ${method}`));
  } catch (error) {
    return res.status(500).json(jsonRpcError(id ?? null, -32603, error.message || 'Internal error'));
  }
});

app.all('/mcp', (req, res) => res.status(405).json({ error: 'Method Not Allowed' }));

module.exports = { app, PORT, executeTool, tools };

if (require.main === module) {
  app.listen(PORT, () => console.log(`Wildberries MCP server running on port ${PORT}`));
}
