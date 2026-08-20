jest.mock('axios', () => jest.fn());

process.env.WB_API_KEY = 'test-wb-key';
process.env.MCP_API_KEY = '';

const request = require('supertest');
const axios = require('axios');
const { app, tools } = require('../mcp-server');

const call = async (name, argumentsValue) => request(app)
  .post('/mcp')
  .set('MCP-Protocol-Version', '2026-07-28')
  .send({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: { name, arguments: argumentsValue }
  });

describe('MCP Wildberries tool contracts', () => {
  beforeEach(() => {
    axios.mockReset();
    axios.mockResolvedValue({ status: 200, data: { data: { ok: true } }, headers: {} });
  });

  test('all five tools are exposed as read-only tools', () => {
    expect(tools.map(tool => tool.name)).toEqual([
      'wb_sales_funnel',
      'wb_sales_funnel_history',
      'wb_search_texts',
      'wb_stocks',
      'wb_ad_campaign_stats'
    ]);
    for (const tool of tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
    }
  });

  test('sales funnel uses the current v3 endpoint and forwards the expected body', async () => {
    const response = await call('wb_sales_funnel', {
      nmIds: [178773045],
      start: '2026-08-18',
      end: '2026-08-19'
    });

    expect(response.statusCode).toBe(200);
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products',
      data: {
        selectedPeriod: { start: '2026-08-18', end: '2026-08-19' },
        nmIds: [178773045],
        skipDeletedNm: false
      },
      headers: { Authorization: 'test-wb-key' }
    }));
  });

  test('sales funnel history uses the v3 history endpoint', async () => {
    const response = await call('wb_sales_funnel_history', {
      nmIds: [178773045],
      start: '2026-08-18',
      end: '2026-08-19',
      aggregationLevel: 'day'
    });

    expect(response.statusCode).toBe(200);
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products/history',
      data: expect.objectContaining({ aggregationLevel: 'day' })
    }));
  });

  test('search texts sends current documented defaults', async () => {
    const response = await call('wb_search_texts', {
      nmIds: [178773045],
      start: '2026-08-18',
      end: '2026-08-19'
    });

    expect(response.statusCode).toBe(200);
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://seller-analytics-api.wildberries.ru/api/v2/search-report/product/search-texts',
      data: expect.objectContaining({
        nmIds: [178773045],
        topOrderBy: 'openCard',
        orderBy: { field: 'openCard', mode: 'desc' },
        limit: 30
      })
    }));
  });

  test('search texts rejects both search-text switches being false', async () => {
    const response = await call('wb_search_texts', {
      nmIds: [178773045],
      start: '2026-08-18',
      end: '2026-08-19',
      includeSearchTexts: false,
      includeSubstitutedSKUs: false
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.result.isError).toBe(true);
    expect(response.body.result.structuredContent.message).toMatch(/cannot both be false/i);
    expect(axios).not.toHaveBeenCalled();
  });

  test('stocks rejects an incomplete request before contacting WB', async () => {
    const response = await call('wb_stocks', { body: { currentPeriod: { start: '2026-08-19', end: '2026-08-19' } } });

    expect(response.statusCode).toBe(200);
    expect(response.body.result.isError).toBe(true);
    expect(response.body.result.structuredContent.message).toMatch(/missing required fields/i);
    expect(axios).not.toHaveBeenCalled();
  });

  test('stocks uses the current products report endpoint', async () => {
    const body = {
      nmIDs: [178773045],
      currentPeriod: { start: '2026-08-19', end: '2026-08-19' },
      stockType: '',
      skipDeletedNm: false,
      orderBy: { field: 'avgOrders', mode: 'desc' },
      availabilityFilters: []
    };

    const response = await call('wb_stocks', { body });

    expect(response.statusCode).toBe(200);
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://seller-analytics-api.wildberries.ru/api/v2/stocks-report/products/products',
      data: body
    }));
  });

  test('advertising stats requires campaign ids and dates', async () => {
    const response = await call('wb_ad_campaign_stats', { params: {} });

    expect(response.statusCode).toBe(200);
    expect(response.body.result.isError).toBe(true);
    expect(response.body.result.structuredContent.message).toMatch(/ids is required/i);
    expect(axios).not.toHaveBeenCalled();
  });

  test('advertising stats uses GET /adv/v3/fullstats', async () => {
    const response = await call('wb_ad_campaign_stats', {
      params: { ids: '12345678', beginDate: '2026-08-18', endDate: '2026-08-19' }
    });

    expect(response.statusCode).toBe(200);
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'https://advert-api.wildberries.ru/adv/v3/fullstats',
      params: { ids: '12345678', beginDate: '2026-08-18', endDate: '2026-08-19' }
    }));
  });

  test('WB HTTP errors are returned as MCP tool errors with retry metadata', async () => {
    axios.mockResolvedValueOnce({
      status: 429,
      data: { title: 'Too Many Requests' },
      headers: { 'x-ratelimit-retry': '20' }
    });

    const response = await call('wb_sales_funnel', {
      nmIds: [178773045],
      start: '2026-08-18',
      end: '2026-08-19'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.result.isError).toBe(true);
    expect(response.body.result.structuredContent.status).toBe(429);
    expect(response.body.result.structuredContent.retryAfter).toBe('20');
  });
});
