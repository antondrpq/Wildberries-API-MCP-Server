// wb-api-mcp-server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { parseWorkbookBuffer } = require('./lib/evirmaKeywordsParser');
const { parseWorkbookBuffer: parseDailyStatsBuffer } = require('./lib/evirmaDailyStatsParser');

// Main server configuration
const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(bodyParser.json());
app.use(cors());

// Request logging (skip noisy logs during tests)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Basic protection against abusive request bursts hitting the WB API
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Health check endpoint - intentionally registered BEFORE the auth
// middleware so monitoring tools and Docker healthchecks can call it
// without an api-key.
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Base URLs for different Wildberries API services
const API_URLS = {
  ADVERT: 'https://advert-api.wildberries.ru',
  ADVERT_MEDIA: 'https://advert-media-api.wildberries.ru',
  ANALYTICS: 'https://seller-analytics-api.wildberries.ru'
};

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.statusCode || 500).json({
    error: true,
    message: err.message || 'Internal Server Error',
    details: err.details || {}
  });
};

// Authentication middleware to verify API token
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['api-key'];
  if (!apiKey) {
    return res.status(401).json({
      error: true,
      message: 'API key is required'
    });
  }
  
  // Store API key in request for later use
  req.apiKey = apiKey;
  next();
};

// Apply middleware
app.use(authMiddleware);

// Helper function to make API calls to Wildberries
const callWbApi = async (url, method, data, headers) => {
  try {
    const response = await axios({
      method: method,
      url: url,
      data: method !== 'GET' ? data : undefined,
      params: method === 'GET' ? data : undefined,
      headers: headers,
      validateStatus: () => true // Allow all status codes to be handled in our code
    });

    // Handle rate limiting
    if (response.status === 429) {
      throw {
        statusCode: 429,
        message: 'Rate limit exceeded. Please try again later.',
        details: response.data
      };
    }

    // Handle auth errors
    if (response.status === 401) {
      throw {
        statusCode: 401,
        message: 'Authentication failed. Please check your API key.',
        details: response.data
      };
    }

    // Handle general errors
    if (response.status >= 400) {
      throw {
        statusCode: response.status,
        message: `Error from Wildberries API: ${response.statusText}`,
        details: response.data
      };
    }

    return response.data;
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }
    
    throw {
      statusCode: 500,
      message: 'Error calling Wildberries API',
      details: error.message
    };
  }
};

// PROMOTION STATISTICS ENDPOINTS

// Get campaign statistics
app.post('/api/adv/fullstats', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ADVERT}/adv/v2/fullstats`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get automatic campaign statistics by phrase clusters
app.get('/api/adv/auto/stat-words', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ADVERT}/adv/v2/auto/stat-words`,
      'GET',
      req.query,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get campaign statistics by key phrases
app.get('/api/adv/stat/words', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ADVERT}/adv/v1/stat/words`,
      'GET',
      req.query,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get statistics on keywords for Automatic campaigns
app.get('/api/adv/stats/keywords', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ADVERT}/adv/v0/stats/keywords`,
      'GET',
      req.query,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get media campaign statistics
app.post('/api/adv/stats', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ADVERT_MEDIA}/adv/v1/stats`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// SALES FUNNEL ENDPOINTS

// Get product card statistics for a period
app.post('/api/nm-report/detail', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/nm-report/detail`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get product card statistics by days
app.post('/api/nm-report/detail/history', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/nm-report/detail/history`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get product card statistics grouped by items, brands, and tags
app.post('/api/nm-report/grouped/history', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/nm-report/grouped/history`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// SEARCH QUERIES ENDPOINTS

// Get main page report data for search queries
app.post('/api/search-report/report', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/search-report/report`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get pagination by groups for search queries
app.post('/api/search-report/table/groups', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/search-report/table/groups`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get pagination by products within a group for search queries
app.post('/api/search-report/table/details', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/search-report/table/details`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get search texts by product
app.post('/api/search-report/product/search-texts', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/search-report/product/search-texts`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get orders and positions by product search texts
app.post('/api/search-report/product/orders', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/search-report/product/orders`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// STOCKS REPORT ENDPOINTS

// Get group data for stocks report
app.post('/api/stocks-report/products/groups', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/stocks-report/products/groups`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get product data for stocks report
app.post('/api/stocks-report/products/products', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/stocks-report/products/products`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get size data for stocks report
app.post('/api/stocks-report/products/sizes', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/stocks-report/products/sizes`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get warehouse data for stocks report
app.post('/api/stocks-report/offices', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/stocks-report/offices`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// SELLER ANALYTICS CSV ENDPOINTS

// Create a CSV report
app.post('/api/nm-report/downloads', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/nm-report/downloads`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get reports list
app.get('/api/nm-report/downloads', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/nm-report/downloads`,
      'GET',
      req.query,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Regenerate a report
app.post('/api/nm-report/downloads/retry', async (req, res, next) => {
  try {
    const data = await callWbApi(
      `${API_URLS.ANALYTICS}/api/v2/nm-report/downloads/retry`,
      'POST',
      req.body,
      { 'Authorization': req.apiKey }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get a report file
app.get('/api/nm-report/downloads/file/:downloadId', async (req, res, next) => {
  try {
    // This endpoint returns binary data (ZIP file)
    const response = await axios({
      method: 'GET',
      url: `${API_URLS.ANALYTICS}/api/v2/nm-report/downloads/file/${req.params.downloadId}`,
      headers: { 'Authorization': req.apiKey },
      responseType: 'arraybuffer',
      validateStatus: () => true
    });

    // Handle error responses
    if (response.status >= 400) {
      let errorMessage = 'Error from Wildberries API';
      // Guard against a missing content-type header (would otherwise throw)
      if (response.headers['content-type']?.includes('application/json')) {
        try {
          const errorData = JSON.parse(response.data.toString());
          errorMessage = errorData.message || errorMessage;
        } catch {
          // Body wasn't valid JSON despite the header - fall back to default message
        }
      }

      throw {
        statusCode: response.status,
        message: errorMessage
      };
    }

    // Set appropriate headers and send the file
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="report-${req.params.downloadId}.zip"`);
    res.send(response.data);
  } catch (error) {
    next(error);
  }
});

// EVIRMA PRO IMPORT ENDPOINTS
//
// EVIRMA PRO has no public API - it's a paid browser extension that lets
// you export its tables (CSV/XLSX) manually from its UI. These endpoints
// let you upload that exported file so its data can be normalized into
// JSON alongside the rest of this server's data.

const evirmaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB is generous for a keywords report
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(xlsx|xls)$/i;
    if (!allowedExt.test(file.originalname)) {
      return cb(new Error('Поддерживаются только файлы .xlsx или .xls'));
    }
    cb(null, true);
  }
});

// Import the EVIRMA PRO "Статистика РК по ключевым фразам" export
// (feature id in the exported filename: cmp-advert-keywords-stats).
// Expects multipart/form-data with the file under the field name "file".
app.post('/api/evirma/import/keywords-report', (req, res, next) => {
  evirmaUpload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({
        error: true,
        message: `Ошибка загрузки файла: ${uploadError.message}`
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: true,
        message: 'Файл не найден. Ожидается multipart/form-data с полем "file".'
      });
    }

    try {
      const result = await parseWorkbookBuffer(req.file.buffer);
      res.json({
        error: false,
        source: 'evirma-pro-keywords-report',
        fileName: req.file.originalname,
        rowCount: result.rows.length,
        data: result.rows
      });
    } catch (parseError) {
      next(parseError);
    }
  });
});

// Import the EVIRMA PRO "Статистика РК по дням и зонам показов" export
// (feature id in the exported filename: wb_cmp_advert-stats).
// Expects multipart/form-data with the file under the field name "file".
app.post('/api/evirma/import/daily-zone-stats', (req, res, next) => {
  evirmaUpload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({
        error: true,
        message: `Ошибка загрузки файла: ${uploadError.message}`
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: true,
        message: 'Файл не найден. Ожидается multipart/form-data с полем "file".'
      });
    }

    try {
      const result = await parseDailyStatsBuffer(req.file.buffer);
      res.json({
        error: false,
        source: 'evirma-pro-daily-zone-stats',
        fileName: req.file.originalname,
        rowCount: result.rows.length,
        data: result.rows
      });
    } catch (parseError) {
      next(parseError);
    }
  });
});

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: 'Not found'
  });
});

// Apply error handler after all route definitions
app.use(errorHandler);

// Start the server
const PORT = process.env.PORT || 3000;
let server;
/* istanbul ignore next -- exercised only when run as the main module */
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Wildberries API MCP server running on port ${PORT}`);
  });

  // Graceful shutdown so in-flight requests finish before the process exits
  // (important for Docker/Kubernetes SIGTERM on redeploy)
  const shutdown = (signal) => {
    console.log(`${signal} received: closing server gracefully`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    // Force exit if close hangs
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
