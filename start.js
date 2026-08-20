require('dotenv').config();

const restApp = require('./wb-api-mcp-server');
const { app: mcpApp, PORT: mcpPort } = require('./mcp-server');

const restPort = Number(process.env.PORT || 3000);

const restServer = restApp.listen(restPort, () => {
  console.log(`Wildberries REST API server running on port ${restPort}`);
});

const mcpServer = mcpApp.listen(mcpPort, () => {
  console.log(`Wildberries MCP server running on port ${mcpPort}`);
});

function shutdown(signal) {
  console.log(`${signal} received: closing servers gracefully`);
  let remaining = 2;
  const done = () => {
    remaining -= 1;
    if (remaining === 0) process.exit(0);
  };

  restServer.close(done);
  mcpServer.close(done);
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
