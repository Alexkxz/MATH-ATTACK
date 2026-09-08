'use strict';

function createMaestroAnnouncementMessages({ ADMIN_PASSWORD, gameSessions, send, L, WebSocket }) {
  function handleMaestroAnnouncement(ws, message) {
    if (message.type !== 'maestro_announcement' || !message.text || message.password !== ADMIN_PASSWORD) return false;
    const text = String(message.text).slice(0, 300);
    const payload = { type: 'announcement', text };
    gameSessions.listSessions().forEach(session => {
      if (session.ws?.readyState === WebSocket.OPEN) send(session.ws, payload);
    });
    L.panel(`Anuncio maestro: \"${text}\"`);
    return true;
  }

  return Object.freeze({ handleMaestroAnnouncement });
}

module.exports = { createMaestroAnnouncementMessages };
