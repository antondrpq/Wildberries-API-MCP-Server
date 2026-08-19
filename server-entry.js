'use strict';

const app = require('./wb-api-mcp-server');
const installApiContractValidation = require('./lib/installApiContractValidation');

installApiContractValidation(app);

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Wildberries API MCP server running on port ${PORT}`);
  });

  const shutdown = signal => {
    console.log(`${signal} received: closing server gracefully`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
