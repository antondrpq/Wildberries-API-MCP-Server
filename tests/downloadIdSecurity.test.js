process.env.NODE_ENV = 'test';

jest.mock('axios', () => jest.fn());

const request = require('supertest');
const axios = require('axios');
const app = require('../wb-api-mcp-server');

describe('downloadId SSRF protection', () => {
  beforeEach(() => {
    axios.mockReset();
  });

  test('rejects invalid downloadId values and does not call axios', async () => {
  const res = await request(app)
    .get('/api/nm-report/downloads/file/not-a-valid-download-id')
    .set('api-key', 'test-api-key');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
    expect(res.body.message).toBe('Invalid downloadId format');
    expect(axios).not.toHaveBeenCalled();
  });

  test('rejects path traversal-like downloadId values', async () => {
  const res = await request(app)
    .get('/api/nm-report/downloads/file/..%2E%2F..%2E')
    .set('api-key', 'test-api-key');

    expect([400, 404]).toContain(res.status);
    expect(axios).not.toHaveBeenCalled();
  });

  test('accepts a valid UUID downloadId', async () => {
    const downloadId = '550e8400-e29b-41d4-a716-446655440000';
    const zipBuffer = Buffer.from('fake zip content');

    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: zipBuffer,
      headers: {}
    });

    const res = await request(app)
      .get(`/api/nm-report/downloads/file/${downloadId}`)
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
      .toContain(`report-${downloadId}.zip`);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: `https://seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads/file/${downloadId}`,
        responseType: 'arraybuffer',
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });
});