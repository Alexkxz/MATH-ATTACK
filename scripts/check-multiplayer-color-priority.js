'use strict';

const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { startTestServer } = require('./server-test-utils');

function connectPeer(url) {
  const socket = new WebSocket(url);
  const queued = [];
  const waiters = [];
  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    const index = waiters.findIndex(waiter => waiter.match(message));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
    else queued.push(message);
  });
  return {
    socket,
    opened: new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    }),
    send(message) { socket.send(JSON.stringify(message)); },
    waitFor(match, timeoutMs = 5000) {
      const existing = queued.findIndex(match);
      if (existing >= 0) return Promise.resolve(queued.splice(existing, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex(waiter => waiter.resolve === wrappedResolve);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Tiempo agotado esperando mensaje del servidor'));
        }, timeoutMs);
        const wrappedResolve = message => { clearTimeout(timer); resolve(message); };
        waiters.push({ match, resolve: wrappedResolve });
      });
    },
    close() { if (socket.readyState < WebSocket.CLOSING) socket.close(); },
  };
}

async function main() {
  const server = await startTestServer({ waitPath: '/api/ranking' });
  const host = connectPeer(`ws://127.0.0.1:${server.port}`);
  const guest = connectPeer(`ws://127.0.0.1:${server.port}`);
  try {
    await Promise.all([host.opened, guest.opened]);
    host.send({ type: 'create_room', playerName: 'Host', roomName: 'Sala de prueba', maxPlayers: 2, color: '#a78bfa' });
    const created = await host.waitFor(message => message.type === 'room_created');
    const roomId = created.roomId;
    assert.equal(created.colorList[0].color, '#a78bfa', 'El servidor reserva el color del anfitrión desde que crea la sala');

    guest.send({ type: 'join_room', roomId, playerName: 'Invitado' });
    const joined = await guest.waitFor(message => message.type === 'joined');
    assert.equal(joined.colorList[0].playerId, '0');
    assert.equal(joined.colorList[0].color, '#a78bfa', 'El invitado recibe la reserva del anfitrión');

    guest.send({ type: 'game_msg', data: { type: 'color_update', playerId: '1', color: '#a78bfa', name: 'Invitado' } });
    const [hostAssignment, guestAssignment] = await Promise.all([
      host.waitFor(message => message.type === 'game_msg' && message.data?.type === 'color_update' && message.data.playerId === '1'),
      guest.waitFor(message => message.type === 'game_msg' && message.data?.type === 'color_update' && message.data.playerId === '1'),
    ]);
    assert.equal(hostAssignment.data.color, '#60a5fa', 'El color en conflicto se asigna al color libre siguiente');
    assert.equal(guestAssignment.data.color, hostAssignment.data.color, 'El jugador nuevo recibe la misma asignación autoritativa');
    assert.equal(hostAssignment.data.assigned, true);

    guest.send({ type: 'game_msg', data: { type: 'color_update', playerId: '1', color: '#a78bfa', name: 'Invitado' } });
    const retry = await guest.waitFor(message => message.type === 'game_msg' && message.data?.type === 'color_update' && message.data.playerId === '1');
    assert.equal(retry.data.color, '#60a5fa', 'El invitado no puede quitar el color al anfitrión al volver a intentarlo');
    console.log('APROBADO: el anfitrión conserva prioridad y el jugador nuevo recibe un color libre.');
  } finally {
    host.close();
    guest.close();
    server.server.kill('SIGINT');
  }
}

main().catch(error => {
  console.error('FALLÓ:', error.message);
  process.exitCode = 1;
});
