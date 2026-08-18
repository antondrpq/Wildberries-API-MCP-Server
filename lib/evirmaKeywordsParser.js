// lib/evirmaKeywordsParser.js
//
// Parses the EVIRMA PRO export "Статистика РК по ключевым фразам"
// (internal Evirma feature id: cmp-advert-keywords-stats), downloaded as
// an .xlsx file from the plugin's UI (Export/Copy button, PRO-only
// feature).
//
// The export has a two-row header: row 1 names 7 metric groups (some of
// them prefixed "[Джем]" when the data is enriched with WB's own paid
// "Джем" analytics subscription), row 2 names the individual metric per
// group. Data starts on row 3. Columns are separated by single blank
// spacer columns between groups.
//
// NOTE: this mapping is tied to the exact column layout of that specific
// Evirma report as of 2026-08. If Evirma changes their export layout,
// COLUMN_MAP below needs to be updated to match (compare against a fresh
// export's header rows).
const { toNumber, workbookToRows } = require('./evirmaShared');

// Column letter -> { key, group } for every data column (A..BL).
// `group: null` marks the cluster/keyword name column itself.
const COLUMN_MAP = [
  { letter: 'A', key: 'cluster', group: null },

  // Группа: Трафик из рекламной кампании
  { letter: 'B', key: 'cpmBid', group: 'traffic' },
  { letter: 'C', key: 'frequency', group: 'traffic' },
  { letter: 'D', key: 'avgAdPosition', group: 'traffic' },
  { letter: 'E', key: 'position', group: 'traffic' },
  { letter: 'F', key: 'redeemedImpressions', group: 'traffic' },
  { letter: 'G', key: 'impressions', group: 'traffic' },
  { letter: 'H', key: 'clicks', group: 'traffic' },
  { letter: 'I', key: 'ctr', group: 'traffic' },
  { letter: 'J', key: 'cpc', group: 'traffic' },
  { letter: 'K', key: 'cpm', group: 'traffic' },
  { letter: 'L', key: 'spend', group: 'traffic' },
  { letter: 'M', key: 'spendShare', group: 'traffic' },
  { letter: 'N', key: 'trafficShare', group: 'traffic' },
  // O = spacer column (skipped)

  // Группа: КОРЗИНЫ из рекламы
  { letter: 'P', key: 'baskets', group: 'basketsAd' },
  { letter: 'Q', key: 'cpl', group: 'basketsAd' },
  { letter: 'R', key: 'crfL', group: 'basketsAd' },
  { letter: 'S', key: 'c1000', group: 'basketsAd' },
  { letter: 'T', key: 'crToBasket', group: 'basketsAd' },
  // U = spacer

  // Группа: ЗАКАЗЫ из рекламы
  { letter: 'V', key: 'orders', group: 'ordersAd' },
  { letter: 'W', key: 'cpo', group: 'ordersAd' },
  { letter: 'X', key: 'cps', group: 'ordersAd' },
  { letter: 'Y', key: 'cro', group: 'ordersAd' },
  { letter: 'Z', key: 'crf', group: 'ordersAd' },
  { letter: 'AA', key: 'o1000', group: 'ordersAd' },
  { letter: 'AB', key: 'revenue', group: 'ordersAd' },
  { letter: 'AC', key: 'drrByOrders', group: 'ordersAd' },
  { letter: 'AD', key: 'drrByRevenue', group: 'ordersAd' },
  { letter: 'AE', key: 'rpm', group: 'ordersAd' },
  { letter: 'AF', key: 'crBasketToOrder', group: 'ordersAd' },
  // AG = spacer

  // Группа: [Джем] Прогноз эффективности РК
  { letter: 'AH', key: 'baskets', group: 'jemForecast' },
  { letter: 'AI', key: 'cpl', group: 'jemForecast' },
  { letter: 'AJ', key: 'orders', group: 'jemForecast' },
  { letter: 'AK', key: 'cpo', group: 'jemForecast' },
  { letter: 'AL', key: 'cps', group: 'jemForecast' },
  { letter: 'AM', key: 'drr', group: 'jemForecast' },
  // AN = spacer

  // Группа: [Джем] ТРАФИК из рекламы + органика
  { letter: 'AO', key: 'avgPosition', group: 'jemTraffic' },
  { letter: 'AP', key: 'visibility', group: 'jemTraffic' },
  { letter: 'AQ', key: 'transitions', group: 'jemTraffic' },
  { letter: 'AR', key: 'adTrafficShare', group: 'jemTraffic' },
  // AS = spacer

  // Группа: [Джем] КОРЗИНЫ (весь трафик, не только реклама)
  { letter: 'AT', key: 'baskets', group: 'jemBaskets' },
  { letter: 'AU', key: 'basketsShare', group: 'jemBaskets' },
  { letter: 'AV', key: 'cpl', group: 'jemBaskets' },
  { letter: 'AW', key: 'crfL', group: 'jemBaskets' },
  { letter: 'AX', key: 'c1000', group: 'jemBaskets' },
  { letter: 'AY', key: 'crToBasket', group: 'jemBaskets' },
  // AZ = spacer

  // Группа: [Джем] ЗАКАЗЫ (весь трафик, не только реклама)
  { letter: 'BA', key: 'orders', group: 'jemOrders' },
  { letter: 'BB', key: 'ordersShare', group: 'jemOrders' },
  { letter: 'BC', key: 'cpo', group: 'jemOrders' },
  { letter: 'BD', key: 'cps', group: 'jemOrders' },
  { letter: 'BE', key: 'cro', group: 'jemOrders' },
  { letter: 'BF', key: 'crf', group: 'jemOrders' },
  { letter: 'BG', key: 'o1000', group: 'jemOrders' },
  { letter: 'BH', key: 'revenue', group: 'jemOrders' },
  { letter: 'BI', key: 'drrByOrders', group: 'jemOrders' },
  { letter: 'BJ', key: 'drrByRevenue', group: 'jemOrders' },
  { letter: 'BK', key: 'rpm', group: 'jemOrders' },
  { letter: 'BL', key: 'crToOrder', group: 'jemOrders' }
];

const HEADER_ROWS = 2; // rows 1-2 are headers, data starts on row 3 (index 2)

// letter (e.g. 'AH') -> 0-based column index
const colLetterToIndex = (letter) => {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.charCodeAt(i) - 64);
  }
  return index - 1;
};

const COLUMN_INDEXES = COLUMN_MAP.map((col) => ({
  ...col,
  index: colLetterToIndex(col.letter)
}));

/**
 * Parses an array-of-arrays representation of the sheet (as produced by
 * XLSX.utils.sheet_to_json(sheet, { header: 1 })) into structured rows.
 * Exposed separately from parseWorkbookBuffer so it can be unit tested
 * without needing to construct real xlsx binaries.
 */
const parseRows = (rows) => {
  const dataRows = rows.slice(HEADER_ROWS);
  const parsed = [];

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const clusterCol = COLUMN_INDEXES.find((c) => c.group === null);
    const cluster = row[clusterCol.index];
    if (cluster === null || cluster === undefined || cluster === '') continue; // skip blank trailing rows

    const record = { cluster: String(cluster).trim() };

    for (const col of COLUMN_INDEXES) {
      if (col.group === null) continue; // already handled as `cluster`
      if (!record[col.group]) record[col.group] = {};
      record[col.group][col.key] = toNumber(row[col.index]);
    }

    parsed.push(record);
  }

  return { rows: parsed };
};

/**
 * Parses an uploaded Evirma export (.xlsx/.xls buffer) into structured
 * JSON grouped by metric category.
 */
const parseWorkbookBuffer = async (buffer) => {
  const rows = await workbookToRows(buffer);

  if (rows.length <= HEADER_ROWS) {
    throw { statusCode: 400, message: 'В файле нет строк с данными после заголовков.' };
  }

  return parseRows(rows);
};

module.exports = {
  COLUMN_MAP,
  parseRows,
  parseWorkbookBuffer,
  toNumber
};
