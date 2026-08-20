'use strict';

const {
  validateSalesFunnelProducts,
  validateSalesFunnelHistory,
  validateSalesFunnelGroupedHistory,
  validateSearchReport,
  validateSearchProductSearchTexts,
  validateSearchProductOrders,
  validateStocksProducts,
  validateStocksProductsGroups,
  validateStocksProductsSizes,
  validateStocksOffices,
  validateFullstatsQuery,
  ValidationError
} = require('./apiContractValidation');

const periodFromLegacy = period => {
  if (!period) return undefined;
  return {
    start: period.start || period.begin,
    end: period.end || period.finish || period.endDate
  };
};

const normalizeSalesFunnelBody = body => ({
  ...body,
  selectedPeriod:
    body.selectedPeriod || periodFromLegacy(body.period) || periodFromLegacy(body.currentPeriod),
  pastPeriod: body.pastPeriod || periodFromLegacy(body.previousPeriod),
  nmIds: body.nmIds ?? body.nmIDs,
  subjectIds: body.subjectIds ?? body.objectIDs ?? body.objectIds,
  tagIds: body.tagIds ?? body.tagIDs
});

const normalizeSalesFunnelHistoryBody = body => ({
  ...body,
  selectedPeriod:
    body.selectedPeriod || periodFromLegacy(body.period) || periodFromLegacy(body.currentPeriod),
  nmIds: body.nmIds ?? body.nmIDs
});

const validateRequest = (req) => {
  const path = req.path;

  if (req.method === 'GET' && path === '/api/adv/fullstats') {
    validateFullstatsQuery(req.query);
    return;
  }

  if (req.method !== 'POST') return;

  switch (path) {
    case '/api/nm-report/detail':
      validateSalesFunnelProducts(normalizeSalesFunnelBody(req.body || {}));
      return;
    case '/api/nm-report/detail/history':
      validateSalesFunnelHistory({
        ...normalizeSalesFunnelHistoryBody(req.body || {}),
        aggregationLevel: req.body?.aggregationLevel ?? 'day'
      });
      return;
    case '/api/nm-report/grouped/history':
      validateSalesFunnelGroupedHistory(normalizeSalesFunnelBody({
        ...(req.body || {}),
        aggregationLevel: req.body?.aggregationLevel ?? 'day'
      }));
      return;
    case '/api/search-report/report':
      validateSearchReport(req.body || {});
      return;
    case '/api/search-report/product/search-texts':
      validateSearchProductSearchTexts(req.body || {});
      return;
    case '/api/search-report/product/orders':
      validateSearchProductOrders(req.body || {});
      return;
    case '/api/stocks-report/products/groups':
      validateStocksProductsGroups(req.body || {});
      return;
    case '/api/stocks-report/products/products':
      validateStocksProducts(req.body || {});
      return;
    case '/api/stocks-report/products/sizes':
      validateStocksProductsSizes(req.body || {});
      return;
    case '/api/stocks-report/offices':
      validateStocksOffices(req.body || {});
      return;
    default:
      return;
  }
};

const apiContractMiddleware = (req, res, next) => {
  try {
    validateRequest(req);
    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      return next(error);
    }
    next(error);
  }
};

module.exports = apiContractMiddleware;
