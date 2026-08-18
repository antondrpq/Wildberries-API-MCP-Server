process.env.NODE_ENV = 'test';

const ExcelJS = require('exceljs');
const request = require('supertest');
const app = require('../wb-api-mcp-server');
const { parseRows } = require('../lib/evirmaDailyStatsParser');

// Builds a minimal array-of-arrays mimicking the real export's row shape
// (24 columns, index 0 = column A). Only the columns exercised by a given
// test are populated; the rest are left undefined (parsed as null).
const row = (overrides) => {
  const arr = new Array(24).fill(undefined);
  for (const [index, value] of Object.entries(overrides)) {
    arr[Number(index)] = value;
  }
  return arr;
};

describe('evirmaDailyStatsParser.parseRows', () => {
  it('parses the "За период" summary row with both zones', () => {
    const rows = [
      row({ 1: 'Статистика РК' }), // row 1 group header - ignored
      row({ 0: 'Дата', 1: 'Показы' }), // row 2 header - ignored
      row({}), // row 3 blank separator - ignored
      row({ 0: 'За период', 1: 4578, 6: 3460, 14: 26984, 19: 286865 }),
      row({ 0: 'поиск | 97%', 1: 4438, 6: 3362 }),
      row({ 0: 'каталог | 3%', 1: 140, 6: 98 })
    ];

    const result = parseRows(rows);

    expect(result.rows).toHaveLength(1);
    const summary = result.rows[0];
    expect(summary.isSummary).toBe(true);
    expect(summary.period).toBe('За период');
    expect(summary.ad.impressions).toBe(4578);
    expect(summary.ad.spend).toBe(3460);
    expect(summary.total.views).toBe(26984);
    expect(summary.total.revenueTotal).toBe(286865);
    expect(summary.zones.search.sharePercent).toBe(97);
    expect(summary.zones.search.ad.impressions).toBe(4438);
    expect(summary.zones.catalog.sharePercent).toBe(3);
    expect(summary.zones.catalog.ad.impressions).toBe(140);
  });

  it('parses a date row into ISO date + weekday', () => {
    const rows = [
      row({ 0: '15.08.2026 / сб', 1: 353, 6: 293 })
    ];
    const result = parseRows(rows);
    expect(result.rows[0].date).toBe('2026-08-15');
    expect(result.rows[0].weekday).toBe('сб');
    expect(result.rows[0].isSummary).toBe(false);
  });

  it('leaves zones.catalog null when no catalog row follows a date', () => {
    const rows = [
      row({ 0: '30.07.2026 / чт', 14: 114 }),
      row({ 0: 'поиск | ' }) // empty share, no catalog row at all
    ];
    const result = parseRows(rows);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].zones.search).not.toBeNull();
    expect(result.rows[0].zones.search.sharePercent).toBeNull();
    expect(result.rows[0].zones.catalog).toBeNull();
  });

  it('skips the repeated sub-header row (blank date, "Показы" in col B)', () => {
    const rows = [
      row({ 0: '16.08.2026 / вс', 1: 212 }),
      row({ 1: 'Показы' }), // repeated header - must be skipped, not treated as data
      row({ 0: '15.08.2026 / сб', 1: 353 })
    ];
    const result = parseRows(rows);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.date)).toEqual(['2026-08-16', '2026-08-15']);
  });

  it('ignores a zone row that appears before any period row', () => {
    const rows = [row({ 0: 'поиск | 50%', 1: 10 })];
    const result = parseRows(rows);
    expect(result.rows).toHaveLength(0);
  });
});

describe('POST /api/evirma/import/daily-zone-stats', () => {
  const buildSampleWorkbook = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Данные');
    sheet.addRow([null, 'Статистика РК']);
    sheet.addRow([
      'Дата', 'Показы', 'CPM', 'Переходы', 'CTR', 'CPC', 'Затраты', 'Корзин',
      'CPL', 'Заказы', 'CPO', 'Заказы', 'CRO', 'ДРР РК', 'Просмотры',
      'Переходы', 'CTR общий', 'Корзин', 'Заказов', 'В заказах',
      'Средняя цена', 'ДРРз', 'ДРРп', 'CPS'
    ]);
    sheet.addRow([]);
    sheet.addRow([
      'За период', 4578, 756, 298, '6,51', '11,6', 3460, 33, 105, 7, 494,
      46403, '2,35', '7,46', 26984, 2948, '10,92', 222, 43, 286865, 6671,
      '1,21', '1,36', 90
    ]);
    sheet.addRow(['поиск | 97%', 4438, 757, 286, '6,44', '11,8', 3362]);

    return workbook.xlsx.writeBuffer();
  };

  it('rejects requests without an api-key', async () => {
    const res = await request(app)
      .post('/api/evirma/import/daily-zone-stats')
      .attach('file', await buildSampleWorkbook(), 'export.xlsx');
    expect(res.status).toBe(401);
  });

  it('parses an uploaded xlsx export into period records', async () => {
    const res = await request(app)
      .post('/api/evirma/import/daily-zone-stats')
      .set('api-key', 'dummy')
      .attach('file', await buildSampleWorkbook(), 'export.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.error).toBe(false);
    expect(res.body.rowCount).toBe(1);
    expect(res.body.data[0].isSummary).toBe(true);
    expect(res.body.data[0].ad.impressions).toBe(4578);
    expect(res.body.data[0].zones.search.ad.impressions).toBe(4438);
  });

  it('rejects files with a disallowed extension', async () => {
    const res = await request(app)
      .post('/api/evirma/import/daily-zone-stats')
      .set('api-key', 'dummy')
      .attach('file', Buffer.from('not a spreadsheet'), 'export.txt');

    expect(res.status).toBe(400);
  });
});
