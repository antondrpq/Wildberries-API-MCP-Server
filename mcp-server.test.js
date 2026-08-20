const request = require('supertest');
const { app } = require('./mcp-server');

describe('MCP Streamable HTTP', () => {
  test('server/discover advertises current and legacy protocol versions', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('MCP-Protocol-Version', '2026-07-28')
      .send({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} });

    expect(response.statusCode).toBe(200);
    expect(response.body.result.supportedProtocolVersions).toEqual(
      expect.arrayContaining(['2026-07-28', '2025-11-25'])
    );
    expect(response.body.result.capabilities.tools).toBeDefined();
  });

  test('tools/list returns deterministic Wildberries tools', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('MCP-Protocol-Version', '2026-07-28')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1.0.0' },
            'io.modelcontextprotocol/clientCapabilities': {}
          }
        }
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.result.tools.map(tool => tool.name)).toEqual([
      'wb_sales_funnel',
      'wb_sales_funnel_history',
      'wb_search_texts',
      'wb_stocks',
      'wb_ad_campaign_stats'
    ]);
  });

  test('unknown tool is a JSON-RPC invalid params error', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('MCP-Protocol-Version', '2026-07-28')
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'does_not_exist', arguments: {} }
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.error.code).toBe(-32602);
  });
});
