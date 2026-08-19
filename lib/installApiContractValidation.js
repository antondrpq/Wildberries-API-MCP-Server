'use strict';

const express = require('express');
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
  validateFullstatsQuery
} = require('./apiContractValidation');

const normalizePeriod = period => {
  if (!period) return undefined;
  return {
    start: period.start || period.begin,
    end: period.end || period.finish || period.endDate
  };
};

const normalizeSalesFunnelProducts = body => ({
  selectedPeriod:
    body.selectedPeriod || normalizePeriod(body.period) || normalizePeriod(body.currentPeriod),
  pastPeriod: body.pastPeriod || normalizePeriod(body.previousPeriod),
  nmIds: body.nmIds ?? body.nmIDs ?? [],
  brandNames: body.brandNames ?? [],
  subjectIds: body.subjectIds ?? body.objectIDs ?? body.objectIds ?? [],
  tagIds: body.tagIds ?? body.tagIDs ?? [],
  skipDeletedNm: body.skipDeletedNm ?? false,
  orderBy: body.orderBy,
  limit: body.limit,
  offset: body.offset
});

const normalizeSalesFunnelHistory = body => ({
  selectedPeriod:
    body.selectedPeriod || normalizePeriod(body.period) || normalizePeriod(body.currentPeriod),
  nmIds: body.nmIds ?? body.nmIDs ?? [],
  skipDeletedNm: body.skipDeletedNm ?? false,
  aggregationLevel: body.aggregationLevel ?? 'day'
});

const normalizeSalesFunnelGroupedHistory = body => ({
  selectedPeriod:
    body.selectedPeriod || normalizePeriod(body.period) || normalizePeriod(body.currentPeriod),
  brandNames: body.brandNames ?? [],
  subjectIds: body.subjectIds ?? body.objectIDs ?? body.objectIds ?? [],
  tagIds: body.tagIds ?? body.tagIDs ?? [],
  skipDeletedNm: body.skipDeletedNm ?? false,
  aggregationLevel: body.aggregationLevel ?? 'day'
});

const normalizeStocksBody = body => ({
  ...body,
  currentPeriod: body.currentPeriod || body.selectedPeriod
});

const ROUTE_VALIDATORS = [
  ['/api/nm-report/detail', 'post', body => validateSalesFunnelProducts(normalizeSalesFunnelProducts(body))],
  ['/api/nm-report/detail/history', 'post', body => validateSalesFunnelHistory(normalizeSalesFunnelHistory(body))],
  ['/api/nm-report/grouped/history', 'post', body => validateSalesFunnelGroupedHistory(normalizeSalesFunnelGroupedHistory(body))],

  ['/api/search-report/report', 'post', validateSearchReport],
  ['/api/search-report/table/groups', 'post', validateSearchReport],
  ['/api/search-report/table/details', 'post', validateSearchReport],
  ['/api/search-report/product/search-texts', 'post', validateSearchProductSearchTexts],
  ['/api/search-report/product/orders', 'post', validateSearchProductOrders],

  ['/api/stocks-report/products/groups', 'post', body => validateStocksProductsGroups(normalizeStocksBody(body))],
  ['/api/stocks-report/products/products', 'post', body => validateStocksProducts(normalizeStocksBody(body))],
  ['/api/stocks-report/products/sizes', 'post', body => validateStocksProductsSizes(normalizeStocksBody(body))],
  ['/api/stocks-report/offices', 'post', body => validateStocksOffices(normalizeStocksBody(body))],

  ['/api/adv/fullstats', 'get', (_, req) => validateFullstatsQuery(req.query)]
];

const makeValidatorLayer = (path, validator) => {
  const router = express.Router();
  router.use(path, (req, res, next) => {
    try {
      validator(req.body, req);
      next();
    } catch (error) {
      next(error);
    }
  });
  return router.stack[0];
};

const installApiContractValidation = app => {
  if (app.__apiContractValidationInstalled) return app;
  if (!app._router || !Array.isArray(app._router.stack)) {
    throw new Error('Express router is not initialized');
  }

  for (const [path, method, validator] of ROUTE_VALIDATORS) {
    const routeIndex = app._router.stack.findIndex(layer =>
      layer.route &&
      layer.route.path === path &&
      layer.route.methods &&
      layer.route.methods[method]
    );

    if (routeIndex === -1) {
      throw new Error(`Route not found while installing validation: ${method.toUpperCase()} ${path}`);
    }

    app._router.stack.splice(routeIndex, 0, makeValidatorLayer(path, validator));
  }

  Object.defineProperty(app, '__apiContractValidationInstalled', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  return app;
};

module.exports = installApiContractValidation;
