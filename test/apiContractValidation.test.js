'use strict';

const assert = require('assert');
const {
  validateSalesFunnelProducts,
  validateSalesFunnelHistory,
  validateSalesFunnelGroupedHistory,
  validateSearchReport,
  validateSearchProductSearchTexts,
  validateSearchProductOrders,
  validateStocksProducts,
  validateFullstatsQuery,
  ValidationError
} = require('../lib/apiContractValidation');

const expectValidationError = (fn, field) => {
  assert.throws(fn, error => error instanceof ValidationError && (!field || error.details.field === field));
};

describe('WB API contract validation', () => {
  it('accepts a valid Sales Funnel products request', () => {
    validateSalesFunnelProducts({
      selectedPeriod: { start: '2026-08-01', end: '2026-08-19' },
      nmIds: [123, 456],
      limit: 100,
      offset: 0
    });
  });

  it('rejects Sales Funnel history with more than 20 nmIds', () => {
    expectValidationError(() => validateSalesFunnelHistory({
      selectedPeriod: { start: '2026-08-01', end: '2026-08-19' },
      nmIds: Array.from({ length: 21 }, (_, index) => index + 1),
      aggregationLevel: 'day'
    }), 'nmIds');
  });

  it('rejects invalid Sales Funnel aggregation level', () => {
    expectValidationError(() => validateSalesFunnelHistory({
      selectedPeriod: { start: '2026-08-01', end: '2026-08-19' },
      nmIds: [1],
      aggregationLevel: 'month'
    }), 'aggregationLevel');
  });

  it('rejects more than 16 grouped-history filter combinations', () => {
    expectValidationError(() => validateSalesFunnelGroupedHistory({
      selectedPeriod: { start: '2026-08-01', end: '2026-08-07' },
      subjectIds: [1, 2, 3, 4],
      brandNames: ['A', 'B', 'C', 'D', 'E'],
      tagIds: [1],
      aggregationLevel: 'day'
    }), 'filters');
  });

  it('accepts a valid Search Report request', () => {
    validateSearchReport({
      currentPeriod: { start: '2026-08-01', end: '2026-08-19' },
      positionCluster: 'all',
      orderBy: { field: 'orders', mode: 'desc' },
      limit: 100,
      offset: 0,
      includeSearchTexts: true,
      includeSubstitutedSKUs: false
    });
  });

  it('rejects Search Report when both include flags are false', () => {
    expectValidationError(() => validateSearchReport({
      currentPeriod: { start: '2026-08-01', end: '2026-08-19' },
      positionCluster: 'all',
      orderBy: { field: 'orders', mode: 'desc' },
      limit: 100,
      offset: 0,
      includeSearchTexts: false,
      includeSubstitutedSKUs: false
    }));
  });

  it('requires orderBy for search-texts', () => {
    expectValidationError(() => validateSearchProductSearchTexts({
      currentPeriod: { start: '2026-08-01', end: '2026-08-19' },
      nmIds: [1],
      topOrderBy: 'orders',
      limit: 30,
      offset: 0
    }), 'orderBy');
  });

  it('rejects product orders period longer than 7 days', () => {
    expectValidationError(() => validateSearchProductOrders({
      period: { start: '2026-08-01', end: '2026-08-08' },
      nmId: 123,
      searchTexts: ['масло']
    }), 'period');
  });

  it('accepts valid stock availability filters', () => {
    validateStocksProducts({
      nmIDs: [1],
      availabilityFilters: ['actual', 'balanced'],
      limit: 100,
      offset: 0
    });
  });

  it('rejects unknown stock availability filters', () => {
    expectValidationError(() => validateStocksProducts({
      availabilityFilters: ['unknown']
    }), 'availabilityFilters');
  });

  it('accepts fullstats for up to 50 campaign IDs and 31 days', () => {
    validateFullstatsQuery({
      ids: '1,2,3',
      beginDate: '2026-08-01',
      endDate: '2026-08-31'
    });
  });

  it('rejects fullstats with more than 50 campaign IDs', () => {
    expectValidationError(() => validateFullstatsQuery({
      ids: Array.from({ length: 51 }, (_, index) => index + 1).join(','),
      beginDate: '2026-08-01',
      endDate: '2026-08-02'
    }), 'ids');
  });
});
