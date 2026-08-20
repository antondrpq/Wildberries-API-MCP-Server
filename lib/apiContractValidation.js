'use strict';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AGGREGATION_LEVELS = new Set(['day', 'week']);
const SEARCH_POSITION_CLUSTERS = new Set(['all', 'firstHundred', 'firstThree', 'firstPage', 'secondPage', 'top20']);
const SEARCH_TOP_ORDER_BY = new Set(['openCard', 'addToCart', 'openToCart', 'orders', 'cartToOrder']);
const STOCK_AVAILABILITY = new Set([
  'deficient',
  'actual',
  'balanced',
  'nonActual',
  'nonLiquid',
  'invalidData'
]);

class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.details = details;
  }
}

const fail = (message, field, details = {}) => {
  throw new ValidationError(message, { field, ...details });
};

const assertPlainObject = (value, field = 'body') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object`, field);
  }
};

const assertDate = (value, field) => {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    fail(`${field} must be YYYY-MM-DD`, field);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail(`${field} must be a valid calendar date`, field);
  }
};

const assertPeriod = (period, field = 'selectedPeriod') => {
  if (!period || typeof period !== 'object' || Array.isArray(period)) {
    fail(`${field} is required`, field);
  }
  assertDate(period.start, `${field}.start`);
  assertDate(period.end, `${field}.end`);
  if (period.start > period.end) {
    fail(`${field}.start must not be after ${field}.end`, field);
  }
};

const assertArrayOfIntegers = (value, field, maxLength = Infinity) => {
  if (!Array.isArray(value)) {
    fail(`${field} must be an array`, field);
  }
  if (value.length > maxLength) {
    fail(`${field} must contain at most ${maxLength} items`, field, { maxLength });
  }
  for (const item of value) {
    if (!Number.isInteger(item) || item < 0) {
      fail(`${field} must contain non-negative integers`, field);
    }
  }
};

const assertNonNegativeInteger = (value, field) => {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${field} must be a non-negative integer`, field);
  }
};

const assertPositiveInteger = (value, field) => {
  if (!Number.isInteger(value) || value < 1) {
    fail(`${field} must be a positive integer`, field);
  }
};

const assertLimitOffset = (body, { maxLimit = 1000, required = false } = {}) => {
  if (body.limit == null) {
    if (required) fail('limit is required', 'limit');
  } else {
    assertPositiveInteger(body.limit, 'limit');
    if (body.limit > maxLimit) fail(`limit must be <= ${maxLimit}`, 'limit', { maxLimit });
  }

  if (body.offset == null) {
    if (required) fail('offset is required', 'offset');
  } else {
    assertNonNegativeInteger(body.offset, 'offset');
  }
};

const assertPeriodMaxDays = (period, maxDays, field = 'selectedPeriod') => {
  const start = new Date(`${period.start}T00:00:00Z`);
  const end = new Date(`${period.end}T00:00:00Z`);
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days > maxDays) fail(`${field} must not exceed ${maxDays} days`, field, { maxDays });
};

const validateSalesFunnelProducts = (body = {}) => {
  assertPlainObject(body);
  assertPeriod(body.selectedPeriod);
  if (body.pastPeriod != null) assertPeriod(body.pastPeriod, 'pastPeriod');
  assertPeriodMaxDays(body.selectedPeriod, 365);
  if (body.nmIds != null) assertArrayOfIntegers(body.nmIds, 'nmIds', 1000);
  if (body.brandNames != null && !Array.isArray(body.brandNames)) fail('brandNames must be an array', 'brandNames');
  if (body.subjectIds != null) assertArrayOfIntegers(body.subjectIds, 'subjectIds', 1000);
  if (body.tagIds != null) assertArrayOfIntegers(body.tagIds, 'tagIds', 1000);
  assertLimitOffset(body, { maxLimit: 1000 });
};

const validateSalesFunnelHistory = (body = {}) => {
  assertPlainObject(body);
  assertPeriod(body.selectedPeriod);
  assertPeriodMaxDays(body.selectedPeriod, 365);
  if (body.nmIds != null) assertArrayOfIntegers(body.nmIds, 'nmIds', 20);
  if (!AGGREGATION_LEVELS.has(body.aggregationLevel)) fail('aggregationLevel must be day or week', 'aggregationLevel');
};

const validateSalesFunnelGroupedHistory = (body = {}) => {
  assertPlainObject(body);
  assertPeriod(body.selectedPeriod);
  assertPeriodMaxDays(body.selectedPeriod, 7);
  if (!AGGREGATION_LEVELS.has(body.aggregationLevel)) fail('aggregationLevel must be day or week', 'aggregationLevel');

  const subjectIds = body.subjectIds || [];
  const brandNames = body.brandNames || [];
  const tagIds = body.tagIds || [];
  if (!Array.isArray(brandNames)) fail('brandNames must be an array', 'brandNames');
  assertArrayOfIntegers(subjectIds, 'subjectIds', 1000);
  assertArrayOfIntegers(tagIds, 'tagIds', 1000);

  const dimensions = [subjectIds.length, brandNames.length, tagIds.length].filter(Boolean);
  const combinations = dimensions.length ? dimensions.reduce((acc, value) => acc * value, 1) : 0;
  if (combinations > 16) fail('The selected subjects × brands × tags combinations must not exceed 16', 'filters', { combinations, maxCombinations: 16 });
};

const validateSearchReport = (body = {}) => {
  assertPlainObject(body);
  assertPeriod(body.currentPeriod, 'currentPeriod');
  assertLimitOffset(body, { maxLimit: 1000, required: true });
  if (!SEARCH_POSITION_CLUSTERS.has(body.positionCluster)) fail('positionCluster is required and must be a supported value', 'positionCluster');
  if (!body.orderBy || typeof body.orderBy !== 'object' || Array.isArray(body.orderBy)) fail('orderBy is required', 'orderBy');
  if (typeof body.orderBy.field !== 'string' || !body.orderBy.field) fail('orderBy.field is required', 'orderBy.field');
  if (!['asc', 'desc'].includes(body.orderBy.mode)) fail('orderBy.mode must be asc or desc', 'orderBy.mode');
  if (body.pastPeriod != null) assertPeriod(body.pastPeriod, 'pastPeriod');
  if (body.nmIds != null) assertArrayOfIntegers(body.nmIds, 'nmIds', 1000);
  if (body.subjectIds != null) assertArrayOfIntegers(body.subjectIds, 'subjectIds', 1000);
  if (body.tagIds != null) assertArrayOfIntegers(body.tagIds, 'tagIds', 1000);
  if (body.brandNames != null && !Array.isArray(body.brandNames)) fail('brandNames must be an array', 'brandNames');
  if (body.includeSubstitutedSKUs === false && body.includeSearchTexts === false) fail('includeSubstitutedSKUs and includeSearchTexts cannot both be false', 'includeSubstitutedSKUs/includeSearchTexts');
};

const validateSearchProductSearchTexts = (body = {}) => {
  assertPlainObject(body);
  assertPeriod(body.currentPeriod, 'currentPeriod');
  assertArrayOfIntegers(body.nmIds, 'nmIds', 50);
  if (!SEARCH_TOP_ORDER_BY.has(body.topOrderBy)) fail('topOrderBy must be one of openCard, addToCart, openToCart, orders, cartToOrder', 'topOrderBy');
  if (!body.orderBy || typeof body.orderBy !== 'object' || Array.isArray(body.orderBy)) fail('orderBy is required', 'orderBy');
  if (typeof body.orderBy.field !== 'string' || !body.orderBy.field) fail('orderBy.field is required', 'orderBy.field');
  if (!['asc', 'desc'].includes(body.orderBy.mode)) fail('orderBy.mode must be asc or desc', 'orderBy.mode');
  assertLimitOffset(body, { maxLimit: 100, required: true });
};

const validateSearchProductOrders = (body = {}) => {
  assertPlainObject(body);
  assertPeriod(body.period, 'period');
  assertPeriodMaxDays(body.period, 7, 'period');
  assertPositiveInteger(body.nmId, 'nmId');
  if (!Array.isArray(body.searchTexts)) fail('searchTexts must be an array', 'searchTexts');
  if (body.searchTexts.length > 100) fail('searchTexts must contain at most 100 items', 'searchTexts', { maxLength: 100 });
  if (body.searchTexts.some(value => typeof value !== 'string')) fail('searchTexts must contain strings', 'searchTexts');
};

const validateStocksProducts = (body = {}) => {
  assertPlainObject(body);
  if (body.nmIDs != null) assertArrayOfIntegers(body.nmIDs, 'nmIDs', 1000);
  if (body.currentPeriod != null) assertPeriod(body.currentPeriod, 'currentPeriod');
  if (body.availabilityFilters != null) {
    if (!Array.isArray(body.availabilityFilters)) fail('availabilityFilters must be an array', 'availabilityFilters');
    for (const value of body.availabilityFilters) if (!STOCK_AVAILABILITY.has(value)) fail(`Unsupported availability filter: ${value}`, 'availabilityFilters');
  }
  assertLimitOffset(body, { maxLimit: 1000 });
};

const validateStocksProductsGroups = validateStocksProducts;
const validateStocksProductsSizes = validateStocksProducts;
const validateStocksOffices = validateStocksProducts;

const validateFullstatsQuery = (query = {}) => {
  if (!query.ids) fail('ids is required', 'ids');
  const ids = String(query.ids).split(',').filter(Boolean);
  if (ids.length < 1 || ids.length > 50 || ids.some(value => !/^\d+$/.test(value))) fail('ids must contain 1-50 comma-separated campaign IDs', 'ids');
  if (!query.beginDate || !query.endDate) fail('beginDate and endDate are required', 'beginDate/endDate');
  assertDate(String(query.beginDate), 'beginDate');
  assertDate(String(query.endDate), 'endDate');
  const period = { start: String(query.beginDate), end: String(query.endDate) };
  assertPeriodMaxDays(period, 31, 'period');
};

module.exports = {
  ValidationError,
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
};
