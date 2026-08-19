process.env.NODE_ENV = 'test';

jest.mock('axios', () => jest.fn());

const request = require('supertest');
const axios = require('axios');
const app = require('../wb-api-mcp-server');

describe('POST /api/adv/normquery/stats-v1', () => {
  beforeEach(() => {
    axios.mockReset();
  });

  it('проксирует запрос в актуальный WB API endpoint', async () => {
    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: {
        items: [
          {
            id: 8960367
          }
        ]
      }
    });

    const body = {
      from: '2026-08-17',
      to: '2026-08-18',
      items: [
        {
          id: 8960367
        }
      ]
    };

    const res = await request(app)
      .post('/api/adv/normquery/stats-v1')
      .set('api-key', 'test-api-key')
      .send(body);

    expect(res.status).toBe(200);

    expect(res.body).toEqual({
      items: [
        {
          id: 8960367
        }
      ]
    });

    expect(axios).toHaveBeenCalledTimes(1);

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://advert-api.wildberries.ru/adv/v1/normquery/stats',
        data: body,
        headers: {
          Authorization: 'test-api-key'
        }
      })
    );
  });
});
