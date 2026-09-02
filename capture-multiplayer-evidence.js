const puppeteer = require('puppeteer');
const path = require('path');

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1300, deviceScaleFactor: 1 });

    await page.evaluateOnNewDocument(() => {
      window.fetch = async () => ({
        ok: false,
        json: async () => ({}),
        text: async () => '',
        blob: async () => new Blob([])
      });
      window.WebSocket = function () {
        return {
          readyState: 3,
          close() {},
          send() {},
          addEventListener() {},
          removeEventListener() {}
        };
      };
      Object.defineProperty(window, 'sessionStorage', {
        value: {
          getItem: key => (key === 'maestroAuth' ? '1' : null),
          setItem() {},
          removeItem() {}
        }
      });
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: key => (key === 'maestroSessionView' ? 'multiplayer' : null),
          setItem() {},
          removeItem() {}
        }
      });
      window.alert = () => {};
      window.confirm = () => true;
    });

    const url = 'file:///' + path.resolve('maestro.html').replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    await page.evaluate(() => {
      const sample = [
        {
          id: 'p1',
          name: 'Fernanda',
          grade: '3° Grado',
          gameMode: 'online',
          roomId: 'A12',
          roomName: 'Arena Relampago',
          roomHostName: 'Fernanda',
          roomStatus: 'playing',
          roomPlayerCount: 4,
          roomMaxPlayers: 4,
          mpGameMode: 'duelo',
          score: 980,
          correct: 12,
          wrong: 2,
          qIndex: 14,
          totalQ: 18,
          status: 'playing',
          paused: false,
          role: 'host',
          playerIdx: 0,
          themeColor: 'cyan',
          avatar: {
            skin: 'canela',
            hairStyle: 'braids',
            hairColor: 'brown',
            eyeType: 'happy',
            eyeColor: 'green',
            mouth: 'smile',
            accessory: 'headband',
            ears: 'normal',
            nose: 'shadow'
          }
        },
        {
          id: 'p2',
          name: 'Miguel',
          grade: '3° Grado',
          gameMode: 'online',
          roomId: 'A12',
          roomName: 'Arena Relampago',
          roomHostName: 'Fernanda',
          roomStatus: 'playing',
          roomPlayerCount: 4,
          roomMaxPlayers: 4,
          mpGameMode: 'duelo',
          score: 910,
          correct: 11,
          wrong: 3,
          qIndex: 14,
          totalQ: 18,
          status: 'playing',
          paused: false,
          playerIdx: 1,
          themeColor: 'orange',
          avatar: {
            skin: 'miel',
            hairStyle: 'spiky',
            hairColor: 'black',
            eyeType: 'normal',
            eyeColor: 'brown',
            mouth: 'grin',
            accessory: 'none',
            ears: 'normal',
            nose: 'button'
          }
        },
        {
          id: 'p3',
          name: 'Yuli',
          grade: '3° Grado',
          gameMode: 'online',
          roomId: 'A12',
          roomName: 'Arena Relampago',
          roomHostName: 'Fernanda',
          roomStatus: 'playing',
          roomPlayerCount: 4,
          roomMaxPlayers: 4,
          mpGameMode: 'duelo',
          score: 840,
          correct: 10,
          wrong: 4,
          qIndex: 14,
          totalQ: 18,
          status: 'playing',
          paused: false,
          playerIdx: 2,
          themeColor: 'pink',
          avatar: {
            skin: 'light',
            hairStyle: 'long',
            hairColor: 'red',
            eyeType: 'sparkle',
            eyeColor: 'blue',
            mouth: 'bigsmile',
            accessory: 'glasses',
            ears: 'earrings',
            nose: 'freckles'
          }
        },
        {
          id: 'p4',
          name: 'Santiago',
          grade: '4° Grado',
          gameMode: 'online',
          roomId: 'A12',
          roomName: 'Arena Relampago',
          roomHostName: 'Fernanda',
          roomStatus: 'playing',
          roomPlayerCount: 4,
          roomMaxPlayers: 4,
          mpGameMode: 'duelo',
          score: 760,
          correct: 8,
          wrong: 6,
          qIndex: 14,
          totalQ: 18,
          status: 'playing',
          paused: false,
          playerIdx: 3,
          themeColor: 'green',
          avatar: {
            skin: 'dark',
            hairStyle: 'curly',
            hairColor: 'green',
            eyeType: 'wink',
            eyeColor: 'amber',
            mouth: 'cool',
            accessory: 'cap',
            ears: 'round',
            nose: 'wide'
          }
        }
      ];

      document.getElementById('loginOverlay')?.classList.add('hidden');
      switchTab('sesiones');
      setSessionView('multiplayer');
      document.getElementById('sessionViewCountMultiplayer').textContent = String(sample.length);
      document.getElementById('tabBadgeSesiones').textContent = String(sample.length);
      renderMultiplayerRoomsEnhanced(sample);
    });

    await page.addStyleTag({
      content: [
        'body{padding:16px!important}',
        '.container{max-width:1400px!important;margin:0 auto!important}',
        '#panel-sesiones{display:block!important}',
        '.stats-row,.tab-bar,.students-header,#panel-alumnos,#panel-ajustes,#panel-conexion,#panel-pruebas,#panel-transacciones{display:none!important}'
      ].join('')
    });

    const target = await page.$('#panel-sesiones');
    if (!target) throw new Error('No se encontro #panel-sesiones');
    await target.screenshot({ path: 'evidencia-panel-maestro-4-jugadores.png' });
    console.log('OK screenshot evidencia-panel-maestro-4-jugadores.png');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
