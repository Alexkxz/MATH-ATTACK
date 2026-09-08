'use strict';

function createConnectionLifecycle({ wsContext, WebSocket, nextConnectionId, getClientCount, logConnection }) {
  function initialize(ws, req) {
    const url = (req.url || '').split('?')[0];
    ws._wsContext = wsContext;
    ws._connId = nextConnectionId();
    ws._connTime = Date.now();
    ws._msgIn = 0;
    ws._msgOut = 0;
    ws._latency = null;
    ws._pingTs = null;
    ws._ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
      if (ws._pingTs != null) {
        ws._latency = Date.now() - ws._pingTs;
        ws._pingTs = null;
      }
    });
    logConnection(`Cliente #${ws._connId} conectado - activos: ${getClientCount()} url:${url}`);
    return url;
  }

  function registerClient(collection, ws) {
    collection.add(ws);
  }

  function unregisterClient(collection, ws) {
    collection.delete(ws);
  }

  function attachCloseAndError(ws, { onClose, onError }) {
    ws.on('close', onClose);
    ws.on('error', onError);
  }

  return Object.freeze({ initialize, registerClient, unregisterClient, attachCloseAndError });
}

module.exports = { createConnectionLifecycle };
