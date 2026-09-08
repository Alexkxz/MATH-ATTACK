'use strict';

function createResultIdempotency() {
  const processedResults = new Set();

  function hasProcessedResult(key) {
    return !!key && processedResults.has(String(key));
  }

  function markResultProcessed(key) {
    if (!key) return false;
    processedResults.add(String(key));
    return true;
  }

  function clearProcessedResult(key) {
    if (!key) return false;
    return processedResults.delete(String(key));
  }

  return Object.freeze({ hasProcessedResult, markResultProcessed, clearProcessedResult });
}

module.exports = { createResultIdempotency };
