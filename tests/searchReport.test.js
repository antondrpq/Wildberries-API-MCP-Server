process.env.NODE_ENV = 'test';

jest.mock('axios', () => jest.fn());

const request = require('supertest');
const axios = require('axios');
const app = require('../wb-api-mcp-server');

describe('Search Report API proxy', () => {
  beforeEach(() => {
    axios.mockReset();
  });

  test('report proxies POST to WB v2 endpoint', async () => {
    const body = {
      currentPeriod: {
        start: '2026-08-12',
        end: '2026-08-18'
      },
      positionCluster: 'all',
      orderBy: {
        field: 'avgPosition',
        mode: 'desc'
      },
      limit: 100,
      offset: 0
    };

    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { data: [] }
    });

    const res = await request(app)
      .post('/api/search-report/report')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/search-report/report',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('table/groups proxies POST to WB v2 endpoint', async () => {
    const body = {
      currentPeriod: {
        start: '2026-08-12',
        end: '2026-08-18'
      },
      positionCluster: 'all',
      orderBy: {
        field: 'avgPosition',
        mode: 'desc'
      },
      limit: 100,
      offset: 0
    };

    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { data: [] }
    });

    const res = await request(app)
      .post('/api/search-report/table/groups')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/search-report/table/groups',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('table/details proxies POST to WB v2 endpoint', async () => {
    const body = {
      currentPeriod: {
        start: '2026-08-12',
        end: '2026-08-18'
      },
      positionCluster: 'all',
      orderBy: {
        field: 'avgPosition',
        mode: 'desc'
      },
      limit: 100,
      offset: 0
    };

    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { data: [] }
    });

    const res = await request(app)
      .post('/api/search-report/table/details')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/search-report/table/details',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('product/search-texts proxies POST to WB v2 endpoint', async () => {
    const body = {
      currentPeriod: {
        start: '2026-08-12',
        end: '2026-08-18'
      },
      nmIds: [178773045],
      topOrderBy: 'openCard',
      orderBy: {
        field: 'openCard',
        mode: 'desc'
      },
      limit: 20,
      offset: 0
    };

    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { data: [] }
    });

    const res = await request(app)
      .post('/api/search-report/product/search-texts')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/search-report/product/search-texts',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('product/orders proxies POST to WB v2 endpoint', async () => {
    const body = {
      period: {
        start: '2026-08-12',
        end: '2026-08-18'
      },
      nmId: 178773045,
      searchTexts: ['масло моторное']
    };

    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { data: [] }
    });

    const res = await request(app)
      .post('/api/search-report/product/orders')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/search-report/product/orders',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });
});
