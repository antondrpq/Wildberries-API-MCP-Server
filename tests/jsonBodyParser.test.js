process.env.NODE_ENV = 'test';

const express = require('express');
const request = require('supertest');
const jsonBodyParser = require('../lib/jsonBodyParser');

// Isolated test app - deliberately not the full server, so this exercises
// only the middleware itself without needing WB API network calls.
const buildTestApp = (options) => {
  const app = express();
  app.use(jsonBodyParser(options));
  app.post('/echo', (req, res) => res.json({ body: req.body }));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    res.status(err.statusCode || 500).json({ error: true, message: err.message });
  });
  return app;
};

describe('jsonBodyParser', () => {
  it('parses a valid JSON body', async () => {
    const res = await request(buildTestApp())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ hello: 'мир', n: 42 }));

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ hello: 'мир', n: 42 });
  });

  it('defaults to an empty object for an empty JSON body', async () => {
    const res = await request(buildTestApp())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('');

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({});
  });

  it('passes through requests with a non-JSON content type untouched', async () => {
    const res = await request(buildTestApp())
      .post('/echo')
      .set('Content-Type', 'text/plain')
      .send('just text');

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({});
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(buildTestApp())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{not valid json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it('returns 413 when the body exceeds the configured limit', async () => {
    const res = await request(buildTestApp({ limitBytes: 10 }))
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ big: 'x'.repeat(100) }));

    expect(res.status).toBe(413);
  });
});
