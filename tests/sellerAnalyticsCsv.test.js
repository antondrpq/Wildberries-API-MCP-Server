process.env.NODE_ENV = 'test';

jest.mock('axios', () => jest.fn());

const request = require('supertest');
const axios = require('axios');
const app = require('../wb-api-mcp-server');

describe('Seller Analytics CSV API proxy', () => {
  beforeEach(() => {
    axios.mockReset();
  });

  test('POST /api/nm-report/downloads proxies to WB v2 downloads', async () => {
    const body = {
      params: {
        period: {
          start: '2026-08-12',
          end: '2026-08-18'
        }
      }
    };

    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: {
        downloadId: 12345
      }
    });

    const res = await request(app)
      .post('/api/nm-report/downloads')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      downloadId: 12345
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('GET /api/nm-report/downloads proxies query parameters', async () => {
    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: {
        reports: []
      }
    });

    const res = await request(app)
      .get('/api/nm-report/downloads')
      .set('api-key', 'test-api-key')
      .query({
        limit: 10,
        offset: 0
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reports: []
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads',
        params: {
          limit: '10',
          offset: '0'
        },
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('POST /api/nm-report/downloads/retry proxies to WB v2 retry', async () => {
    const body = {
      downloadId: 12345
    };

    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: {
        downloadId: 12345
      }
    });

    const res = await request(app)
      .post('/api/nm-report/downloads/retry')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads/retry',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });

  test('GET /api/nm-report/downloads/file/:downloadId proxies binary ZIP data', async () => {
    const zipBuffer = Buffer.from('fake zip content');

    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: zipBuffer
    });

    const res = await request(app)
      .get('/api/nm-report/downloads/file/550e8400-e29b-41d4-a716-446655440000')
      .set('api-key', 'test-api-key')
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];

        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
        response.on('error', callback);
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition'])
      .toContain('report-550e8400-e29b-41d4-a716-446655440000.zip');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.toString()).toBe('fake zip content');

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads/file/550e8400-e29b-41d4-a716-446655440000',
        headers: {
          Authorization: 'test-api-key'
        },
        responseType: 'arraybuffer'
      })
    );
  });
});