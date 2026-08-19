process.env.NODE_ENV = 'test';

jest.mock('axios', () => jest.fn());

const request = require('supertest');
const axios = require('axios');
const app = require('../wb-api-mcp-server');

describe('Sales Funnel v3 migration', () => {
  beforeEach(() => {
    axios.mockReset();
  });

  test('detail converts legacy period and nmIDs to v3 format', async () => {
    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { data: [] }
    });

    const body = {
      period: {
        begin: '2026-08-01',
        end: '2026-08-18'
      },
      nmIDs: [123456789],
      objectIDs: [100],
      tagIDs: [200]
    };

    const res = await request(app)
      .post('/api/nm-report/detail')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products',
        data: expect.objectContaining({
          selectedPeriod: {
            start: '2026-08-01',
            end: '2026-08-18'
          },
          nmIds: [123456789],
          subjectIds: [100],
          tagIds: [200],
          skipDeletedNm: false
        }),
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('history converts legacy request to v3', async () => {
    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: []
    });

    const body = {
      period: {
        begin: '2026-08-12',
        end: '2026-08-18'
      },
      nmIDs: [123456789],
      aggregationLevel: 'day'
    };

    const res = await request(app)
      .post('/api/nm-report/detail/history')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products/history',
        data: expect.objectContaining({
          selectedPeriod: {
            start: '2026-08-12',
            end: '2026-08-18'
          },
          nmIds: [123456789],
          skipDeletedNm: false,
          aggregationLevel: 'day'
        })
      })
    );
  });

  test('grouped history converts legacy filters to v3', async () => {
    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { data: [] }
    });

    const body = {
      period: {
        begin: '2026-08-12',
        end: '2026-08-18'
      },
      objectIDs: [100],
      tagIDs: [200],
      aggregationLevel: 'day'
    };

    const res = await request(app)
      .post('/api/nm-report/grouped/history')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/grouped/history',
        data: expect.objectContaining({
          selectedPeriod: {
            start: '2026-08-12',
            end: '2026-08-18'
          },
          subjectIds: [100],
          tagIds: [200],
          skipDeletedNm: false,
          aggregationLevel: 'day'
        })
      })
    );
  });
});