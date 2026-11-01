const MAX_PAGE = 100000;

// TiDB rejects mysql2's prepared-statement OFFSET parameter on some versions.
// Only integers produced by this function may be interpolated into pagination SQL.
export function pagination(value, pageSize) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new TypeError('Invalid page size');
  if (value !== undefined && (typeof value !== 'string' || !/^[1-9]\d{0,5}$/.test(value) || Number(value) > MAX_PAGE)) {
    const error = new Error('Page must be an integer between 1 and 100000');
    error.status = 400;
    throw error;
  }
  const page = value === undefined ? 1 : Number(value);
  const offset = (page - 1) * pageSize;
  return {page, offset, sql: `LIMIT ${pageSize + 1} OFFSET ${offset}`};
}
