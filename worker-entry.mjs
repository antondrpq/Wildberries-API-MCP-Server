// worker-entry.mjs
//
// Entry point used ONLY when this server is deployed as a Cloudflare
// Worker (via `wrangler deploy`, see wrangler.jsonc).
//
// server-entry.js installs the centralized WB API contract validation
// layer before exposing the Express app, so Node/Docker/Worker use the
// same validated application.
import { httpServerHandler } from 'cloudflare:node';
import app from './server-entry.js';

const server = app.listen(3000);

export default httpServerHandler(server);
