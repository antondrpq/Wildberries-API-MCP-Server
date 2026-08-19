// worker-entry.mjs
//
// Entry point used ONLY when this server is deployed as a Cloudflare
// Worker (via `wrangler deploy`, see wrangler.jsonc). It is not used by
// `npm start` / Docker - those run wb-api-mcp-server.js directly, which
// starts a normal Node.js http.Server via app.listen().
//
// Cloudflare's `cloudflare:node` module provides httpServerHandler,
// which adapts a regular Node.js http.Server (what Express's app.listen
// returns) to the Workers fetch-handler model, so the same Express app
// runs unmodified on both a traditional Node host and on Workers.
// Requires the `nodejs_compat` compatibility flag (set in wrangler.jsonc).
import { httpServerHandler } from 'cloudflare:node';
import app from './wb-api-mcp-server.js';

// wb-api-mcp-server.js only calls app.listen() itself when run directly
// (`require.main === module`), so it's safe to import here and call
// listen() ourselves without starting a second, conflicting listener.
const server = app.listen(3000);

export default httpServerHandler(server);
