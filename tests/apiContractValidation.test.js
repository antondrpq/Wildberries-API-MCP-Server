const {
  validateSalesFunnelProducts,
  validateSalesFunnelHistory,
  validateSalesFunnelGroupedHistory,
  validateSearchReport,
  validateSearchProductSearchTexts,
  validateSearchProductOrders,
  validateStocksProducts,
  validateFullstatsQuery
} = require('../lib/apiContractValidation');

const period = { start: '2026-08-12', end: '2026-08-18' };

describe('WB API contract validation', () => {
  test('accepts valid Sales Funnel products request', () => {
    expect(() => validateSalesFunnelProducts({
      selectedPeriod: period,
      nmIds: [178773045],
      subjectIds: [3906],
      tagIds: [],
      limit: 100,
      offset: 0
    })).not.toThrow();
  });

  test('rejects more than 20 nmIds for Sales Funnel history', () => {
    expect(() => validateSalesFunnelHistory({
      selectedPeriod: period,
      aggregationLevel: 'day',
      nmIds: Array.from({ length: 21 }, (_, i) => i + 1)
    })).toThrow(/20/);
  });

  test('rejects more than 16 grouped Sales Funnel combinations', () => {
    expect(() => validateSalesFunnelGroupedHistory({
      selectedPeriod: period,
      aggregationLevel: 'day',
      subjectIds: [1, 2, 3, 4],
      brandNames: ['A', 'B', 'C', 'D', 'E'],
      tagIds: [1]
    })).toThrow(/16/);
  });

  test('rejects Search Report without required ordering and paging', () => {
    expect(() => validateSearchReport({
      currentPeriod: period,
      positionCluster: 'all'
    })).toThrow(/orderBy|limit|offset/);
  });

  test('accepts valid Search Report request', () => {
    expect(() => validateSearchReport({
      currentPeriod: period,
      positionCluster: 'all',
      orderBy: { field: 'avgPosition', mode: 'desc' },
      limit: 100,
      offset: 0
    })).not.toThrow();
  });

  test('rejects Search Report when both supplementary flags are false', () => {
    expect(() => validateSearchReport({
      currentPeriod: period,
      positionCluster: 'all',
      orderBy: { field: 'avgPosition', mode: 'desc' },
      limit: 100,
      offset: 0,
      includeSubstitutedSKUs: false,
      includeSearchTexts: false
    })).toThrow(/cannot both be false/);
  });

  test('requires orderBy for product search texts', () => {
    expect(() => validateSearchProductSearchTexts({
      currentPeriod: period,
      nmIds: [178773045],
      topOrderBy: 'openCard',
      limit: 20,
      offset: 0
    })).toThrow(/orderBy/);
  });

  test('validates product orders contract separately', () => {
    expect(() => validateSearchProductOrders({
      period,
      nmId: 178773045,
      searchTexts: ['масло моторное']
    })).not.toThrow();
  });

  test('rejects unknown stock availability filter', () => {
    expect(() => validateStocksProducts({
      currentPeriod: period,
      availabilityFilters: ['unknown'],
      limit: 100,
      offset: 0
    })).toThrow(/Unsupported availability filter/);
  });

  test('accepts valid fullstats query', () => {
    expect(() => validateFullstatsQuery({
      ids: '22161678,28449281',
      beginDate: '2026-08-12',
      endDate: '2026-08-18'
    })).not.toThrow();
  });

  test('rejects fullstats period longer than 31 days', () => {
    expect(() => validateFullstatsQuery({
      ids: '22161678',
      beginDate: '2026-01-01',
      endDate: '2026-02-01'
    })).toThrow(/31 days/);
  });
});
