'use strict';

const net = require('net');
const { spawn } = require('child_process');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function startTestServer({ waitPath = '/', timeoutMs = 10000 } = {}) {
  const port = await getFreePort();
  const baseUrl = `http://localhost:${port}`;
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  server.stdout.on('data', chunk => { output += chunk.toString(); });
  server.stderr.on('data', chunk => { output += chunk.toString(); });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(baseUrl + waitPath);
      if (response.ok) {
        return { server, baseUrl, port, getOutput: () => output };
      }
    } catch (e) {}
    await wait(250);
  }

  server.kill('SIGINT');
  throw new Error(`No se pudo iniciar el servidor local en ${baseUrl}${output.trim() ? `\n${output.trim()}` : ''}`);
}

module.exports = { getFreePort, startTestServer };
