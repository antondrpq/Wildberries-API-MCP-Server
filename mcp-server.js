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
  ANALYTICS: 'https://seller-analytics-api.wildberries.ru'
};

const tools = [
  {
    name: 'wb_sales_funnel',
    title: 'WB Sales Funnel',
    description: 'Get Wildberries product sales funnel statistics for one or more nmIDs and a selected date range.',
    inputSchema: {
      type: 'object',
      properties: {
        nmIds: { type: 'array', items: { type: 'integer' }, minItems: 1, description: 'Wildberries product nmIDs.' },
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
        nmIds: { type: 'array', items: { type: 'integer' }, minItems: 1 },
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
    description: 'Get Wildberries search queries associated with a product for a selected period.',
    inputSchema: {
      type: 'object',
      properties: {
        nmIds: { type: 'array', items: { type: 'integer' }, minItems: 1 },
        start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        limit: { type: 'integer', minimum: 1, maximum: 1000 }
      },
      required: ['nmIds', 'start', 'end'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_stocks',
    title: 'WB Stocks',
    description: 'Get Wildberries stock report data. The request body is passed to the current stocks-report products endpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        body: { type: 'object', description: 'Wildberries stocks-report request body.' }
      },
      required: ['body'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_ad_campaign_stats',
    title: 'WB Advertising Campaign Stats',
    description: 'Get Wildberries advertising campaign statistics. Query parameters are passed to adv/v3/fullstats.',
    inputSchema: {
      type: 'object',
      properties: {
        params: { type: 'object', description: 'Query parameters accepted by Wildberries adv/v3/fullstats.' }
      },
      required: ['params'],
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
        topOrderBy: 'openCard',
        limit: args.limit || 100
      };
      return callWb(`${API_URLS.ANALYTICS}/api/v2/search-report/product/search-texts`, 'POST', body);
    }

    case 'wb_stocks':
      if (!args.body || typeof args.body !== 'object' || Array.isArray(args.body)) throw new Error('body must be an object');
      return callWb(`${API_URLS.ANALYTICS}/api/v2/stocks-report/products/products`, 'POST', args.body);

    case 'wb_ad_campaign_stats':
      if (!args.params || typeof args.params !== 'object' || Array.isArray(args.params)) throw new Error('params must be an object');
      return callWb(`${API_URLS.ADVERT}/adv/v3/fullstats`, 'GET', args.params);

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

module.exports = { app, PORT };

if (require.main === module) {
  app.listen(PORT, () => console.log(`Wildberries MCP server running on port ${PORT}`));
}
