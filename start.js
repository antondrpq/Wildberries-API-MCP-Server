require('dotenv').config();

const http = require('http');
const restApp = require('./wb-api-mcp-server');
const { app: mcpApp } = require('./mcp-server');

const port = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  if (req.url === '/mcp' || req.url.startsWith('/mcp?')) {
    return mcpApp(req, res);
  }
  return restApp(req, res);
});

server.listen(port, () => {
  console.log(`Wildberries REST API running on port ${port}`);
  console.log(`Wildberries MCP Streamable HTTP endpoint: http://localhost:${port}/mcp`);
});

function shutdown(signal) {
  console.log(`${signal} received: closing server gracefully`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
