process.env.NODE_ENV = 'test';

jest.mock('axios', () => jest.fn());

const request = require('supertest');
const axios = require('axios');
const app = require('../wb-api-mcp-server');

describe('WB API contract validation integration', () => {
  beforeEach(() => {
    axios.mockReset();
    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { data: [] }
    });
  });

  test('rejects invalid Search Report before calling WB', async () => {
    const res = await request(app)
      .post('/api/search-report/report')
      .set('api-key', 'test-api-key')
      .send({
        currentPeriod: { start: '2026-08-12', end: '2026-08-18' },
        positionCluster: 'all'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
    expect(axios).not.toHaveBeenCalled();
  });

  test('accepts valid Search Report and proxies to WB', async () => {
    const body = {
      currentPeriod: { start: '2026-08-12', end: '2026-08-18' },
      positionCluster: 'all',
      orderBy: { field: 'avgPosition', mode: 'desc' },
      limit: 100,
      offset: 0
    };

    const res = await request(app)
      .post('/api/search-report/report')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/search-report/report',
        data: body
      })
    );
  });

  test('rejects invalid stock availability filter before calling WB', async () => {
    const res = await request(app)
      .post('/api/stocks-report/products/products')
      .set('api-key', 'test-api-key')
      .send({
        selectedPeriod: { start: '2026-08-12', end: '2026-08-18' },
        availabilityFilters: ['unknown'],
        limit: 100,
        offset: 0
      });

    expect(res.status).toBe(400);
    expect(axios).not.toHaveBeenCalled();
  });

  test('accepts legacy Sales Funnel fields and validates normalized v3 contract', async () => {
    const res = await request(app)
      .post('/api/nm-report/detail')
      .set('api-key', 'test-api-key')
      .send({
        period: { begin: '2026-08-12', end: '2026-08-18' },
        nmIDs: [178773045],
        objectIDs: [3906]
      });

    expect(res.status).toBe(200);
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products',
        data: expect.objectContaining({
          selectedPeriod: { start: '2026-08-12', end: '2026-08-18' },
          nmIds: [178773045],
          subjectIds: [3906]
        })
      })
    );
  });

  test('rejects fullstats request with more than 31 days', async () => {
    const res = await request(app)
      .get('/api/adv/fullstats')
      .set('api-key', 'test-api-key')
      .query({
        ids: '22161678',
        beginDate: '2026-01-01',
        endDate: '2026-02-01'
      });

    expect(res.status).toBe(400);
    expect(axios).not.toHaveBeenCalled();
  });

  test('accepts a valid fullstats request', async () => {
    const res = await request(app)
      .get('/api/adv/fullstats')
      .set('api-key', 'test-api-key')
      .query({
        ids: '22161678,28449281',
        beginDate: '2026-08-12',
        endDate: '2026-08-18'
      });

    expect(res.status).toBe(200);
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://advert-api.wildberries.ru/adv/v3/fullstats'
      })
    );
  });
});
