'use strict';

function createEconomicIdempotency() {
  const processedPotDeductIds = new Set();
  return Object.freeze({
    hasPotDeductId: id => !!id && processedPotDeductIds.has(String(id)),
    markPotDeductId: id => {
      if (!id) return false;
      processedPotDeductIds.add(String(id));
      return true;
    },
    clearPotDeductId: id => !!id && processedPotDeductIds.delete(String(id)),
    processedPotDeductIds,
  });
}

module.exports = { createEconomicIdempotency };
