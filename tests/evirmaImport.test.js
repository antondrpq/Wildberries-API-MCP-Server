process.env.NODE_ENV = 'test';

const ExcelJS = require('exceljs');
const request = require('supertest');
const app = require('../wb-api-mcp-server');
const { parseRows, toNumber, COLUMN_MAP } = require('../lib/evirmaKeywordsParser');

describe('evirmaKeywordsParser.toNumber', () => {
  it('converts comma-decimal strings to numbers', () => {
    expect(toNumber('3,60')).toBeCloseTo(3.6);
    expect(toNumber('20,48')).toBeCloseTo(20.48);
  });

  it('passes real numbers through unchanged', () => {
    expect(toNumber(737)).toBe(737);
  });

  it('returns null for empty/missing values', () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber('')).toBeNull();
  });
});

describe('evirmaKeywordsParser.parseRows', () => {
  it('groups columns by metric category and skips blank trailing rows', () => {
    // Minimal 2-row header (content unused by the parser, only column
    // *position* matters) + 2 data rows using the real column layout.
    const header1 = [];
    const header2 = [];
    const dataRow = [];
    dataRow[0] = '5w40'; // cluster
    dataRow[1] = null; // cpmBid
    dataRow[6] = 250; // impressions (col G, index 6)
    dataRow[8] = '3,60'; // ctr (col I, index 8)
    dataRow[11] = 184; // spend (col L, index 11)

    const blankRow = []; // no cluster -> should be skipped

    const result = parseRows([header1, header2, dataRow, blankRow]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cluster).toBe('5w40');
    expect(result.rows[0].traffic.impressions).toBe(250);
    expect(result.rows[0].traffic.ctr).toBeCloseTo(3.6);
    expect(result.rows[0].traffic.spend).toBe(184);
  });

  it('covers every non-cluster column with a group and key', () => {
    const metricColumns = COLUMN_MAP.filter((c) => c.group !== null);
    expect(metricColumns.every((c) => typeof c.key === 'string' && c.key.length > 0)).toBe(true);
  });
});

describe('POST /api/evirma/import/keywords-report', () => {
  const buildSampleWorkbook = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Данные');

    sheet.addRow(['Трафик из рекламной кампании']);
    sheet.addRow([
      'Кластеры', 'Ставка CPM', 'Частота', 'Средняя рекл. Позиция', 'Позиция',
      'Выкуп. показов', 'Показы', 'Клики', 'CTR', 'CPC', 'CPM', 'Затраты',
      'Доля затрат', 'Доля трафика', null, 'Корзины  РК'
    ]);
    sheet.addRow([
      '5w40', null, 13072, 77, null, 5, 250, 9, '3,60', '20,48', 737, 184,
      '6,08', '12,00', null, null
    ]);

    return workbook.xlsx.writeBuffer();
  };

  it('rejects requests without an api-key', async () => {
    const res = await request(app)
      .post('/api/evirma/import/keywords-report')
      .attach('file', await buildSampleWorkbook(), 'export.xlsx');
    expect(res.status).toBe(401);
  });

  it('parses an uploaded xlsx export into grouped JSON', async () => {
    const res = await request(app)
      .post('/api/evirma/import/keywords-report')
      .set('api-key', 'dummy')
      .attach('file', await buildSampleWorkbook(), 'export.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.error).toBe(false);
    expect(res.body.rowCount).toBe(1);
    expect(res.body.data[0].cluster).toBe('5w40');
    expect(res.body.data[0].traffic.impressions).toBe(250);
    expect(res.body.data[0].traffic.ctr).toBeCloseTo(3.6);
  });

  it('rejects files with a disallowed extension', async () => {
    const res = await request(app)
      .post('/api/evirma/import/keywords-report')
      .set('api-key', 'dummy')
      .attach('file', Buffer.from('not a spreadsheet'), 'export.txt');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/evirma/import/keywords-report')
      .set('api-key', 'dummy');

    expect(res.status).toBe(400);
  });
});
