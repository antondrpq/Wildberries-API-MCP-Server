// lib/evirmaDailyStatsParser.js
//
// Parses the EVIRMA PRO export "Статистика РК по дням и зонам показов"
// (internal Evirma feature id: wb_cmp_advert-stats).
//
// Layout (verified against a real export, 2026-08):
//   Row 1: 3 merged group headers - "Статистика РК" (B:G), "Эффективность
//          РК (товар + ассоц.конвер)" (H:N), "Всего по товару (реклама +
//          органика)" (O:X).
//   Row 2: 24 column headers (A:X) - see COLUMN groups below.
//   Row 3: blank separator.
//   Row 4: "За период" - the whole-period summary row.
//   Row 5-6: "поиск | NN%" / "каталог | NN%" - per-zone breakdown of the
//            summary row. Only columns B-N (ad + ad-efficiency groups) are
//            filled; columns O-X (whole-product group) are blank for zone
//            rows since that data isn't split by zone.
//   Row 7: column headers repeated (blank date cell, "Показы" in col B) -
//          a visual re-header before the daily breakdown starts.
//   Row 8+: one block per day - a date row ("dd.mm.yyyy / weekday"),
//           followed by a "поиск" zone row and, IF that zone had any
//           activity, a "каталог" zone row. The catalog row is entirely
//           OMITTED on days with no catalog traffic, so blocks are not a
//           fixed number of rows - row content, not position, decides
//           where one period ends and the next begins.
//
// NOTE: this mapping is tied to the exact column layout of this specific
// Evirma report as of 2026-08. If Evirma changes their export layout,
// the column arrays below need to be updated to match.
const ExcelJS = require('exceljs');
const { toNumber } = require('./evirmaKeywordsParser');

// 0-based column index -> field key, grouped by the 3 metric groups.
const AD_COLUMNS = [
  { index: 1, key: 'impressions' },
  { index: 2, key: 'cpm' },
  { index: 3, key: 'clicks' },
  { index: 4, key: 'ctr' },
  { index: 5, key: 'cpc' },
  { index: 6, key: 'spend' }
];

const AD_EFFICIENCY_COLUMNS = [
  { index: 7, key: 'baskets' },
  { index: 8, key: 'costPerBasket' }, // CPL
  { index: 9, key: 'orders' },
  { index: 10, key: 'costPerOrder' }, // CPO
  { index: 11, key: 'revenue' }, // labeled "Заказы" a 2nd time in the export, but is order revenue
  { index: 12, key: 'conversionClicksToOrder' }, // CRO
  { index: 13, key: 'drrByRevenue' } // ДРР РК
];

const TOTAL_COLUMNS = [
  { index: 14, key: 'views' },
  { index: 15, key: 'clicksTotal' },
  { index: 16, key: 'ctrTotal' },
  { index: 17, key: 'basketsTotal' },
  { index: 18, key: 'ordersTotal' },
  { index: 19, key: 'revenueTotal' }, // "В заказах"
  { index: 20, key: 'avgPrice' },
  { index: 21, key: 'drrByOrders' }, // ДРРз
  { index: 22, key: 'drrByRevenue' }, // ДРРп
  { index: 23, key: 'cps' }
];

const DATE_LABEL_RE = /^(\d{2})\.(\d{2})\.(\d{4})\s*\/\s*(.+)$/;

const extractGroup = (row, columns) => {
  const group = {};
  for (const { index, key } of columns) {
    group[key] = toNumber(row[index]);
  }
  return group;
};

const parseZoneLabel = (label) => {
  const [, sharePart = ''] = label.split('|');
  const trimmed = sharePart.trim().replace('%', '');
  return trimmed === '' ? null : toNumber(trimmed);
};

/**
 * Parses an array-of-arrays representation of the sheet (as produced by
 * XLSX.utils.sheet_to_json / ExcelJS row.values) into structured period
 * records. Exposed separately from parseWorkbookBuffer so it can be unit
 * tested without needing to construct real xlsx binaries.
 */
const parseRows = (rows) => {
  const records = [];
  let current = null;

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const rawLabel = row[0];
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : rawLabel;
    const colB = row[1];

    if (label === 'Дата') continue; // row 2 header
    if ((label === null || label === undefined || label === '') && colB === 'Показы') continue; // row 7 repeated header

    if (typeof label === 'string' && label.startsWith('поиск')) {
      if (!current) continue; // malformed/unexpected - ignore orphan zone row
      current.zones.search = {
        sharePercent: parseZoneLabel(label),
        ad: extractGroup(row, AD_COLUMNS),
        adEfficiency: extractGroup(row, AD_EFFICIENCY_COLUMNS)
      };
      continue;
    }

    if (typeof label === 'string' && label.startsWith('каталог')) {
      if (!current) continue;
      current.zones.catalog = {
        sharePercent: parseZoneLabel(label),
        ad: extractGroup(row, AD_COLUMNS),
        adEfficiency: extractGroup(row, AD_EFFICIENCY_COLUMNS)
      };
      continue;
    }

    const isSummary = label === 'За период';
    const dateMatch = typeof label === 'string' ? label.match(DATE_LABEL_RE) : null;

    if (isSummary || dateMatch) {
      current = {
        period: label,
        isSummary,
        date: dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null,
        weekday: dateMatch ? dateMatch[4].trim() : null,
        ad: extractGroup(row, AD_COLUMNS),
        adEfficiency: extractGroup(row, AD_EFFICIENCY_COLUMNS),
        total: extractGroup(row, TOTAL_COLUMNS),
        zones: { search: null, catalog: null }
      };
      records.push(current);
    }
    // any other row (group-header row 1, blank separator row 3, stray
    // blank rows) falls through and is silently skipped
  }

  return { rows: records };
};

const plainCellValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    if ('result' in value) return value.result;
    if ('text' in value) return value.text;
    if (value instanceof Date) return value;
    return null;
  }
  return value;
};

/**
 * Parses an uploaded Evirma export (.xlsx/.xls buffer) into structured
 * JSON: one record per period ("За период" summary + one per day), each
 * with ad/adEfficiency/total metrics and an optional search/catalog zone
 * breakdown.
 */
const parseWorkbookBuffer = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw { statusCode: 400, message: 'Не удалось прочитать файл. Убедитесь, что это корректный .xlsx/.xls файл.' };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw { statusCode: 400, message: 'Файл не содержит листов с данными.' };
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    rows[rowNumber - 1] = row.values.slice(1).map(plainCellValue);
  });

  const result = parseRows(rows);
  if (result.rows.length === 0) {
    throw { statusCode: 400, message: 'Не удалось найти ни одного периода/дня в файле. Проверьте, что это правильный экспорт EVIRMA.' };
  }

  return result;
};

module.exports = {
  AD_COLUMNS,
  AD_EFFICIENCY_COLUMNS,
  TOTAL_COLUMNS,
  parseRows,
  parseWorkbookBuffer
};
