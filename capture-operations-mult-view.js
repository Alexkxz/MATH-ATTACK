const puppeteer = require('puppeteer');
const path = require('path');

const OUTPUTS = [
  {
    name: 'operaciones-mult-desktop-inicio.png',
    viewport: { width: 1365, height: 980, deviceScaleFactor: 1 },
    stage: 'start'
  },
  {
    name: 'operaciones-mult-desktop-corrimiento.png',
    viewport: { width: 1365, height: 980, deviceScaleFactor: 1 },
    stage: 'shift'
  },
  {
    name: 'operaciones-mult-desktop-total.png',
    viewport: { width: 1365, height: 980, deviceScaleFactor: 1 },
    stage: 'total'
  },
  {
    name: 'operaciones-mult-mobile-total.png',
    viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
    stage: 'total'
  },
  {
    name: 'operaciones-mult-1cifra.png',
    viewport: { width: 1365, height: 980, deviceScaleFactor: 1 },
    stage: 'single-digit'
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildQuestion() {
  return { table: 47, a: 47, op: '×', b: 25, answer: 1175 };
}

async function preparePage(page, errors) {
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

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
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => '';
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

  const url = 'file:///' + path.resolve('math-attack.html').replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate(() => {
    document.getElementById('loginOverlay')?.classList.add('hidden');
    document.getElementById('step1Screen')?.classList.remove('active');
    document.body.classList.remove('game-active');
  });
}

async function mountStage(page, stage) {
  await page.evaluate(currentStage => {
    const question = currentStage === 'single-digit'
      ? { table: 47, a: 47, op: '×', b: 5, answer: 235 }
      : { table: 47, a: 47, op: '×', b: 25, answer: 1175 };
    pName = 'Demo';
    gradeName = '3°';
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
    questions = [question];
    qIndex = 0;
    totalC = 0;
    totalW = 0;
    totalT = 0;
    streak = 0;
    gameScore = 0;
    verticalOpState = null;
    verticalEntryValue = '';
    verticalSolvedFlash = null;
    verticalStepLock = false;
    loadQuestion();
    const state = verticalOpState;
    if (!state) throw new Error('No se generó verticalOpState');
    const firstResultIndex = state.steps.findIndex(step => step.kind === 'result');
    const secondRowIndex = state.steps.findIndex(step => step.kind === 'partial' && step.row === 1);
    if (currentStage === 'shift' && secondRowIndex >= 0) {
      state.cursor = secondRowIndex;
      renderVerticalNotebook();
    } else if (currentStage === 'total' && firstResultIndex >= 0) {
      state.cursor = firstResultIndex;
      renderVerticalNotebook();
    } else if (currentStage === 'single-digit') {
      const carryIndex = state.steps.findIndex(step => step.kind === 'multCarry');
      state.cursor = carryIndex >= 0 ? carryIndex : 0;
      renderVerticalNotebook();
    }
    document.getElementById('feedbackEl').textContent = '';
    document.getElementById('feedbackEl').className = 'feedback';
  }, stage);

  await page.evaluate(() => {
    const card = document.getElementById('questionCard');
    if (card) card.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await sleep(200);
}

async function capture(page, item) {
  await page.setViewport(item.viewport);
  await mountStage(page, item.stage);
  const target = await page.$('#gameWrap');
  if (!target) throw new Error('No se encontró #gameWrap');
  await target.screenshot({ path: path.join('evidencias', item.name) });
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    await preparePage(page, errors);
    for (const item of OUTPUTS) {
      await capture(page, item);
      console.log(`OK screenshot ${item.name}`);
    }
    if (errors.length) {
      console.log('ERRORS');
      errors.forEach(err => console.log(err));
    } else {
      console.log('NO_ERRORS');
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
