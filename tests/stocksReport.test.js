process.env.NODE_ENV = 'test';

jest.mock('axios', () => jest.fn());

const request = require('supertest');
const axios = require('axios');
const app = require('../wb-api-mcp-server');

describe('Stocks Report API proxy', () => {
  beforeEach(() => {
    axios.mockReset();
  });

  test('products/groups proxies POST to WB v2 endpoint', async () => {
    const body = {
      selectedPeriod: {
        start: '2026-08-12',
        end: '2026-08-18'
      },
      orderBy: {
        field: 'stock',
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
      .post('/api/stocks-report/products/groups')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/stocks-report/products/groups',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('products/products proxies POST to WB v2 endpoint', async () => {
    const body = {
      selectedPeriod: {
        start: '2026-08-12',
        end: '2026-08-18'
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
      .post('/api/stocks-report/products/products')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/stocks-report/products/products',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('products/sizes proxies POST to WB v2 endpoint', async () => {
    const body = {
      selectedPeriod: {
        start: '2026-08-12',
        end: '2026-08-18'
      },
      nmIds: [178773045],
      limit: 100,
      offset: 0
    };

    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { data: [] }
    });

    const res = await request(app)
      .post('/api/stocks-report/products/sizes')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/stocks-report/products/sizes',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('offices proxies POST to WB v2 endpoint', async () => {
    const body = {
      selectedPeriod: {
        start: '2026-08-12',
        end: '2026-08-18'
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
      .post('/api/stocks-report/offices')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/stocks-report/offices',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });
});