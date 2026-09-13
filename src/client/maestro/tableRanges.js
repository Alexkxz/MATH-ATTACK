'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MathAttackTableRanges = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIN_TABLE = 1;
  const MAX_TABLE = 12;
  function fail(message) { throw new Error(message); }
  function integer(value, field) { if (!Number.isInteger(value)) fail(`${field} must be an integer`); return value; }
  function validateRange(range) {
    if (!range || typeof range !== 'object' || Array.isArray(range)) fail('table range incomplete');
    const table = integer(range.table, 'table');
    const from = integer(range.from, 'from');
    const to = integer(range.to, 'to');
    if (table < MIN_TABLE || table > MAX_TABLE) fail('table out of bounds');
    if (from < 1 || from > MAX_TABLE || to < 1 || to > MAX_TABLE) fail('range out of bounds');
    if (from > to) fail('from must be less than or equal to to');
    return { table, from, to };
  }
  function validateMultiplierConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail('invalid multiplication config');
    if (!Array.isArray(config.ranges) || !config.ranges.length) fail('ranges must not be empty');
    const ranges = config.ranges.map(validateRange);
    const tables = new Set();
    for (const range of ranges) { if (tables.has(range.table)) fail('duplicate table'); tables.add(range.table); }
    if (config.tables !== undefined) {
      if (!Array.isArray(config.tables) || config.tables.some(table => !Number.isInteger(table))) fail('invalid tables');
      const configured = [...new Set(config.tables)].sort((a, b) => a - b);
      const ranged = [...tables].sort((a, b) => a - b);
      if (configured.length !== ranged.length || configured.some((table, index) => table !== ranged[index])) fail('tables and ranges do not match');
    }
    if (config.qty !== undefined && (!Number.isInteger(config.qty) || config.qty < 1 || config.qty > 100)) fail('invalid qty');
    if (config.manner !== undefined && !['ordered', 'random'].includes(config.manner)) fail('invalid order');
    if (config.repeat !== undefined && typeof config.repeat !== 'boolean') fail('invalid repeat');
    return ranges;
  }
  function validateOpsConfig(opsConfig) {
    if (!opsConfig || typeof opsConfig !== 'object' || Array.isArray(opsConfig)) fail('invalid opsConfig');
    if (opsConfig.mult && opsConfig.mult.ranges !== undefined) validateMultiplierConfig(opsConfig.mult);
    return true;
  }
  function values(range) { const result = []; for (let value = range.from; value <= range.to; value += 1) result.push(value); return result; }
  function shuffled(items, random) { const result = items.slice(); for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; }
  function multipliersForTable(config, table, random = Math.random) {
    if (!config || !Array.isArray(config.ranges)) return null;
    const range = validateMultiplierConfig(config).find(item => item.table === table);
    if (!range) return [];
    const pool = values(range);
    if (config.repeat === true) {
      const qty = Number.isInteger(config.qty) ? config.qty : pool.length;
      const ordered = config.manner === 'random' ? shuffled(pool, random) : pool;
      return Array.from({ length: qty }, (_, index) => ordered[index % ordered.length]);
    }
    const ordered = config.manner === 'random' ? shuffled(pool, random) : pool;
    return config.qty === undefined ? ordered : ordered.slice(0, Math.min(config.qty, ordered.length));
  }
  function count(config) {
    if (!config || !Array.isArray(config.ranges)) return 0;
    const ranges = validateMultiplierConfig(config);
    if (config.repeat === true && Number.isInteger(config.qty)) return ranges.length * config.qty;
    return ranges.reduce((sum, range) => sum + range.to - range.from + 1, 0);
  }
  return { MIN_TABLE, MAX_TABLE, validateRange, validateMultiplierConfig, validateOpsConfig, multipliersForTable, count };
}));
