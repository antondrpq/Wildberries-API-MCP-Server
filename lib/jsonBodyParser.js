// lib/jsonBodyParser.js
//
// Minimal JSON body-parsing middleware, used instead of the `body-parser`
// package. body-parser pulls in `raw-body` -> `iconv-lite` for charset
// handling, and iconv-lite's internal `require('stream')` call breaks
// under Cloudflare Workers' Node.js compatibility layer at deploy-time
// validation ("require_streams(...) is not a function") - see
// wrangler.jsonc / worker-entry.mjs for the Workers deployment path.
//
// This server never needs non-UTF-8 body decoding: every endpoint here
// is either our own JSON API (always UTF-8) or a multipart file upload
// handled separately by multer. A small UTF-8-only parser sidesteps the
// problematic dependency chain entirely and behaves identically on
// Docker/plain Node and on Workers.
const DEFAULT_LIMIT_BYTES = 1024 * 1024; // 1MB - generous for this API's JSON payloads

const jsonBodyParser = ({ limitBytes = DEFAULT_LIMIT_BYTES } = {}) => (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    req.body = req.body || {};
    return next();
  }

  const chunks = [];
  let totalBytes = 0;
  let settled = false;

  req.on('data', (chunk) => {
    if (settled) return;
    totalBytes += chunk.length;
    if (totalBytes > limitBytes) {
      settled = true;
      res.status(413).json({ error: true, message: 'Тело запроса превышает допустимый размер.' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (settled) return;
    settled = true;

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (raw === '') {
      req.body = {};
      return next();
    }

    try {
      req.body = JSON.parse(raw);
      next();
    } catch (err) {
      next({ statusCode: 400, message: 'Некорректный JSON в теле запроса.' });
    }
  });

  req.on('error', (err) => {
    if (settled) return;
    settled = true;
    next(err);
  });
};

module.exports = jsonBodyParser;
