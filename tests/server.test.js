process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../wb-api-mcp-server');

describe('GET /health', () => {
  it('responds 200 without requiring an api-key', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('auth middleware', () => {
  it('rejects protected routes without an api-key header', async () => {
    const res = await request(app).get('/api/adv/stat/words');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe(true);
  });
});

describe('unknown routes', () => {
  it('returns 404 for unmatched paths', async () => {
    const res = await request(app)
      .get('/this-route-does-not-exist')
      .set('api-key', 'dummy');
    expect(res.status).toBe(404);
  });
});
