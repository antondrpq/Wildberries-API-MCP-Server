// lib/evirmaShared.js
//
// Shared helpers for parsing EVIRMA PRO xlsx exports.
const ExcelJS = require('exceljs');

// Converts an Evirma cell value to a number.
// Evirma exports decimal numbers as text with a comma decimal separator
// (Russian locale), e.g. "3,60" or "20,48"; integers come through as
// real numbers. Percent-like text ("97%") should be stripped of the "%"
// by the caller before reaching this function. Empty cells are null.
const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.').replace(/\s/g, '');
    if (normalized === '') return null;
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

// Extracts a plain JS value from an ExcelJS cell value, which may be a
// primitive, or an object for rich text / formula / hyperlink cells.
const plainCellValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    if ('result' in value) return value.result; // formula cell
    if ('text' in value) return value.text; // rich text cell
    if (value instanceof Date) return value;
    return null;
  }
  return value;
};

// Loads an .xlsx buffer's first worksheet into an array-of-arrays, where
// row[0] = column A, row[1] = column B, etc. (0-indexed, matching how
// XLSX.utils.sheet_to_json({header:1}) used to behave).
const workbookToRows = async (buffer) => {
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
    // row.values is 1-indexed (index 0 is unused) - drop it so index 0 = column A
    rows[rowNumber - 1] = row.values.slice(1).map(plainCellValue);
  });

  return rows;
};

const isBlankRow = (row) => !row || row.every((v) => v === null || v === undefined || v === '');

module.exports = {
  toNumber,
  plainCellValue,
  workbookToRows,
  isBlankRow
};
