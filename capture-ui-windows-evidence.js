const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const OUT_DIR = path.join(__dirname, 'evidencias', 'ui-review-2026-07-07');
const VIEWPORT = { width: 1440, height: 1100, deviceScaleFactor: 1 };
const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fileUrl(name) {
  return 'file:///' + path.resolve(name).replace(/\\/g, '/');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureElement(page, selector, filename, paddingCss = '') {
  if (paddingCss) {
    await page.addStyleTag({ content: paddingCss });
  }
  const el = await page.$(selector);
  if (!el) throw new Error(`No se encontro selector: ${selector}`);
  await el.screenshot({ path: path.join(OUT_DIR, filename) });
  console.log(`OK ${filename}`);
}

async function capturePage(page, filename) {
  await page.screenshot({
    path: path.join(OUT_DIR, filename),
    fullPage: true
  });
  console.log(`OK ${filename}`);
}

async function newBrowser() {
  const executablePath = BROWSER_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!executablePath) {
    throw new Error('No se encontro un navegador compatible para Puppeteer.');
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox']
  });
}

async function prepareMathPage(page) {
  await page.setViewport(VIEWPORT);
  await page.evaluateOnNewDocument(() => {
    window.fetch = async () => ({
      ok: false,
      json: async () => ([]),
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
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => '1234';
    window.Audio = function () {
      return {
        play: () => Promise.resolve(),
        pause() {},
        cloneNode() { return this; },
        addEventListener() {},
        removeEventListener() {},
        currentTime: 0,
        volume: 0
      };
    };
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => {};
    window.speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };
    window.SpeechSynthesisUtterance = function () {};
  });
  await page.goto(fileUrl('math-attack.html'), { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate(() => {
    localStorage.clear();
    const hideAll = () => {
      document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
      ['settingsOverlay', 'pinOverlay', 'pinSetupOverlay', 'mpOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
      });
    };
    window.__showScreenForEvidence = id => {
      hideAll();
      const el = document.getElementById(id);
      if (el) el.classList.add('active');
      return !!el;
    };
    window.__setupRegistryEvidence = () => {
      const sample = [
        { name: 'Ana', date: '2026-07-07', gameMode: 'solo', setupMode: 'operations', gameType: 'free', difficulty: 'free', ansMode: 'write', qpt: 4, pct: 96, stars: 3, grade: '3° Grado', tblResults: { '×': { c: 12, w: 1 } } },
        { name: 'Luis', date: '2026-07-06', gameMode: 'duel', gameType: 'lives', difficulty: 'hard', ansMode: 'voice', qpt: 6, pct: 82, stars: 2, player2: 'Bot', grade: '4° Grado', tblResults: { '÷': { c: 9, w: 2 } } }
      ];
      localStorage.setItem(REG_KEY, JSON.stringify(sample));
      regFilter = 'all';
      regSort = 'date';
      renderReg();
    };
    window.__setupGameEvidence = () => {
      pName = 'Alex';
      pColor = '#a78bfa';
      gradeName = '3° Grado';
      gameMode = 'solo';
      setupMode = 'operations';
      selectedOps = ['×'];
      gameType = 'free';
      difficulty = 'free';
      ansMode = 'write';
      visualMode = 'normal';
      tblManner = 'ordered';
      qptPerTable = 1;
      multTopDigits = 2;
      multBottomDigits = 2;
      initGame(false);
      questions = [{ table: 24, a: 24, op: '×', b: 13, answer: 312 }];
      qIndex = 0;
      totalC = 3;
      totalW = 1;
      totalT = 0;
      streak = 2;
      gameScore = 480;
      loadQuestion();
      document.getElementById('feedbackEl').textContent = 'Turno de ejemplo';
      document.getElementById('feedbackEl').className = 'feedback';
    };
    window.__setupResultsEvidence = () => {
      document.getElementById('rEmoji').textContent = '🏆';
      document.getElementById('rName').textContent = '🏆 Alex';
      document.getElementById('rStars').textContent = '⭐⭐⭐';
      document.getElementById('rSummary').textContent = 'Resultado de ejemplo · 12/13 · Libre · 2–12 (×11 por tabla) · Todas (1–12)';
      document.getElementById('statC').textContent = '12';
      document.getElementById('statT').textContent = '0';
      document.getElementById('statW').textContent = '1';
      document.getElementById('scoreResultBox').style.display = 'block';
      document.getElementById('scoreResultPts').textContent = '480';
      document.getElementById('scoreResultSub').textContent = 'Mejor combo: ×2';
      document.getElementById('scoreResultBest').textContent = '🏆 Record: 480';
      document.getElementById('aureosEarnedBox').style.display = 'block';
      document.getElementById('aureosEarnedVal').innerHTML = '+25 <span class="aureos-coin">🪙</span>';
      document.getElementById('aureosTotalLbl').textContent = 'Total: 120 Aureos';
      document.getElementById('legendEl').innerHTML = '<span>🟢 Excelente</span><span>🟡 Medio</span><span>🔴 Reforzar</span>';
      document.getElementById('tblGrid').innerHTML = '<div class="tbl-cell green"><div class="n">2</div><div class="p">100%</div></div><div class="tbl-cell yellow"><div class="n">3</div><div class="p">75%</div></div><div class="tbl-cell green"><div class="n">4</div><div class="p">90%</div></div>';
    };
  });
}

async function captureMathWindows(browser) {
  const page = await browser.newPage();
  await prepareMathPage(page);

  await page.evaluate(() => window.__showScreenForEvidence('loginScreen'));
  await captureElement(page, '#loginScreen .login-card', '01-math-login.png');

  await page.evaluate(() => window.__showScreenForEvidence('step1Screen'));
  await captureElement(page, '#step1Screen .setup-card', '02-math-step1-modo.png');

  await page.evaluate(() => window.__showScreenForEvidence('step2Screen'));
  await captureElement(page, '#step2Screen .setup-card', '03-math-step2-tipo.png');

  await page.evaluate(() => window.__showScreenForEvidence('stepOpScreen'));
  await captureElement(page, '#stepOpScreen .setup-card', '04-math-step-operaciones.png');

  await page.evaluate(() => window.__showScreenForEvidence('step3LocalScreen'));
  await captureElement(page, '#step3LocalScreen .setup-card', '05-math-step3-local.png');

  await page.evaluate(() => window.__showScreenForEvidence('step3bLocalScreen'));
  await captureElement(page, '#step3bLocalScreen .setup-card', '06-math-step3b-local.png');

  await page.evaluate(() => {
    window.__showScreenForEvidence('gameScreen');
    window.__setupGameEvidence();
  });
  await sleep(250);
  await captureElement(page, '#gameScreen', '07-math-juego.png');

  await page.evaluate(() => {
    window.__showScreenForEvidence('resultsScreen');
    window.__setupResultsEvidence();
  });
  await captureElement(page, '#resultsScreen', '08-math-resultados.png');

  await page.evaluate(() => {
    window.__showScreenForEvidence('registryScreen');
    window.__setupRegistryEvidence();
  });
  await captureElement(page, '#registryScreen', '09-math-registro.png');

  await page.evaluate(() => {
    window.__showScreenForEvidence('step1Screen');
    askConfirm('restart');
  });
  await captureElement(page, '#confirmOverlay .sm-card', '10-math-confirmacion.png');

  await page.evaluate(() => {
    window.__showScreenForEvidence('step1Screen');
    openSettings();
  });
  await captureElement(page, '#settingsOverlay .settings-card', '11-math-ajustes.png');

  await page.evaluate(() => {
    window.__showScreenForEvidence('step2Screen');
    openMP();
  });
  await captureElement(page, '#mpOverlay .mp-card', '12-math-multijugador.png');

  await page.evaluate(() => {
    window.__showScreenForEvidence('step1Screen');
    document.getElementById('pinOverlay').classList.add('active');
    document.getElementById('pinInput').value = '1234';
  });
  await captureElement(page, '#pinOverlay .sm-card', '13-math-pin.png');
}

async function prepareMaestroPage(page) {
  await page.setViewport(VIEWPORT);
  await page.evaluateOnNewDocument(() => {
    window.fetch = async url => {
      if (String(url).includes('/api/players')) {
        return {
          ok: true,
          json: async () => ([
            { id: 's1', name: 'Fernanda', grade: '3° Grado', aureos: 320, avatar: {}, inventory: { shield: 2, doublepts: 1 } },
            { id: 's2', name: 'Miguel', grade: '4° Grado', aureos: 280, avatar: {}, inventory: { skip: 1 } }
          ])
        };
      }
      if (String(url).includes('/api/transactions')) {
        return {
          ok: true,
          json: async () => ([
            { date: '2026-07-07', name: 'Fernanda', reason: 'partida', delta: 20, balance: 320 },
            { date: '2026-07-07', name: 'Miguel', reason: 'regalo_masivo', delta: 50, balance: 280 }
          ])
        };
      }
      return { ok: true, json: async () => ([]), text: async () => '' };
    };
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
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => '1234';
  });
  await page.goto(fileUrl('maestro.html'), { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate(() => {
    document.getElementById('loginOverlay')?.classList.add('hidden');
    latestSessions = [
      { id: 'p1', name: 'Fernanda', grade: '3° Grado', gameMode: 'online', mpGameMode: 'race', score: 980, correct: 12, wrong: 2, qIndex: 14, totalQ: 18, status: 'playing', paused: false, themeColor: 'cyan', avatar: {}, roomId: 'A12', roomHostName: 'Fernanda', roomPlayerCount: 2, roomMaxPlayers: 4 },
      { id: 'p2', name: 'Miguel', grade: '4° Grado', gameMode: 'solo', gameType: 'lives', difficulty: 'hard', score: 740, correct: 9, wrong: 3, qIndex: 12, totalQ: 16, status: 'playing', paused: false, lives: 2, livesTotal: 3, themeColor: 'orange', avatar: {}, currentQuestion: '24 × 13' }
    ];
    studentsData = [
      { id: 's1', name: 'Fernanda', grade: '3° Grado', aureos: 320, avatar: {}, inventory: { shield: 2, doublepts: 1 }, themeColor: 'cyan' },
      { id: 's2', name: 'Miguel', grade: '4° Grado', aureos: 280, avatar: {}, inventory: { skip: 1 }, themeColor: 'orange' }
    ];
    renderStudents();
    renderFromState();
    document.getElementById('tabBadgeSesiones').textContent = '2';
    document.getElementById('sessionViewCountIndividual').textContent = '1';
    document.getElementById('sessionViewCountMultiplayer').textContent = '1';
  });
}

async function captureMaestroWindows(browser) {
  const page = await browser.newPage();
  await prepareMaestroPage(page);

  await page.evaluate(() => switchTab('alumnos'));
  await captureElement(page, '#panel-alumnos', '14-maestro-alumnos.png');

  await page.evaluate(() => {
    switchTab('sesiones');
    setSessionView('individual');
  });
  await captureElement(page, '#panel-sesiones', '15-maestro-en-juego.png');

  await page.evaluate(() => switchTab('pruebas'));
  await captureElement(page, '#panel-pruebas', '16-maestro-pruebas.png');

  await page.evaluate(() => switchTab('ajustes'));
  await captureElement(page, '#panel-ajustes', '17-maestro-ajustes.png');

  await page.evaluate(() => switchTab('conexion'));
  await captureElement(page, '#panel-conexion', '18-maestro-conexion.png');

  await page.evaluate(() => {
    switchTab('transacciones');
    document.getElementById('txTableBody').innerHTML = `
      <tr><td>2026-07-07 10:20</td><td>Fernanda</td><td>🎮 Partida</td><td style="color:#34d399">+20 🪙</td><td>320 🪙</td></tr>
      <tr><td>2026-07-07 09:58</td><td>Miguel</td><td>🎁 Regalo</td><td style="color:#34d399">+50 🪙</td><td>280 🪙</td></tr>`;
  });
  await captureElement(page, '#panel-transacciones', '19-maestro-transacciones.png');

  await page.evaluate(() => {
    openAnnounce();
    document.getElementById('annText').value = 'Recuerden revisar los iconos y textos de cada pantalla.';
  });
  await captureElement(page, '#announceModal', '20-maestro-anuncio-modal.png');

  await page.evaluate(() => {
    closeAnnounce();
    openBulkAureos();
  });
  await captureElement(page, '#bulkModal', '21-maestro-aureos-modal.png');

  await page.evaluate(() => {
    closeBulkAureos();
    document.getElementById('histOverlay').classList.add('open');
    document.getElementById('histModal').style.display = 'block';
    document.getElementById('histTitle').textContent = 'Fernanda';
    document.getElementById('histContent').innerHTML = '<div style="padding:18px;color:#e2e8f0">Historial de ejemplo para revision visual.</div>';
  });
  await captureElement(page, '#histModal', '22-maestro-historial-modal.png');
}

async function prepareRankingPage(page) {
  await page.setViewport(VIEWPORT);
  await page.evaluateOnNewDocument(() => {
    const rows = [
      { id: 1, name: 'Ana', grade: '3° Grado', date: '2026-07-07', time: '10:20', gameMode: 'solo', setupMode: 'operations', gameType: 'free', difficulty: 'free', qpt: 4, ansMode: 'write', pct: 96, score: 420, streak: 8, correct: 12, wrong: 1, total: 13, tblResults: { '×': { c: 12, w: 1 } }, tableDetail: { '×': { 2: { c: 4, w: 0 }, 3: { c: 4, w: 1 }, 4: { c: 4, w: 0 } } } },
      { id: 2, name: 'Luis', grade: '4° Grado', date: '2026-07-07', time: '09:50', gameMode: 'online', mpGameMode: 'race', gameType: 'countdown', difficulty: 'medium', qpt: 6, ansMode: 'voice', pct: 81, score: 610, streak: 5, correct: 13, wrong: 3, total: 16, tblResults: { '÷': { c: 13, w: 3 } }, tableDetail: { '÷': { 6: { c: 6, w: 1 }, 7: { c: 7, w: 2 } } } },
      { id: 3, name: 'Mia', grade: '5° Grado', date: '2026-07-06', time: '11:10', gameMode: 'duel', gameType: 'lives', difficulty: 'hard', qpt: 5, ansMode: 'options', pct: 88, score: 530, streak: 6, correct: 14, wrong: 2, total: 16, player2: 'Bot', tblResults: { '+': { c: 8, w: 1 }, '−': { c: 6, w: 1 } }, tableDetail: { '+': { 1: { c: 4, w: 1 } }, '−': { 1: { c: 6, w: 1 } } } },
      { id: 4, name: 'Diego', grade: '4° Grado', date: '2026-07-05', time: '08:30', gameMode: 'solo', isExam: true, gameType: 'free', difficulty: 'medium', qpt: 4, ansMode: 'write', pct: 74, score: 300, streak: 3, correct: 9, wrong: 3, total: 12, tblResults: { '×': { c: 9, w: 3 } }, tableDetail: { '×': { 8: { c: 5, w: 1 }, 9: { c: 4, w: 2 } } } }
    ];
    const players = [
      { name: 'Ana', grade: '3° Grado', aureos: 320, avatar: {} },
      { name: 'Luis', grade: '4° Grado', aureos: 280, avatar: {} },
      { name: 'Mia', grade: '5° Grado', aureos: 410, avatar: {} },
      { name: 'Diego', grade: '4° Grado', aureos: 260, avatar: {} }
    ];
    window.fetch = async url => ({
      ok: true,
      json: async () => (String(url).includes('/api/players') ? players : rows),
      text: async () => ''
    });
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => '1234';
  });
  await page.goto(fileUrl('ranking.html'), { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(1200);
}

async function captureRankingWindows(browser) {
  const page = await browser.newPage();
  await prepareRankingPage(page);

  await capturePage(page, '23-ranking-partidas.png');

  await page.evaluate(() => { currentTab = 'multijugador'; renderAll(); });
  await sleep(150);
  await capturePage(page, '24-ranking-multijugador.png');

  await page.evaluate(() => { currentTab = 'alumnos'; renderAll(); });
  await sleep(150);
  await capturePage(page, '25-ranking-alumnos.png');

  await page.evaluate(() => { currentTab = 'modo-operaciones'; renderAll(); });
  await sleep(150);
  await capturePage(page, '26-ranking-operaciones.png');

  await page.evaluate(() => { currentTab = 'pruebas'; renderAll(); });
  await sleep(150);
  await capturePage(page, '27-ranking-pruebas.png');
}

async function main() {
  ensureDir(OUT_DIR);
  const browser = await newBrowser();
  try {
    await captureMathWindows(browser);
    await captureMaestroWindows(browser);
    await captureRankingWindows(browser);
    fs.writeFileSync(
      path.join(OUT_DIR, 'README.txt'),
      [
        'Capturas generadas para revision visual de ventanas principales.',
        'Fecha: 2026-07-07',
        '',
        'Bloques incluidos:',
        '- Math Attack alumno',
        '- Panel del maestro',
        '- Ranking / registro'
      ].join('\r\n'),
      'utf8'
    );
    console.log(`LISTO ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
