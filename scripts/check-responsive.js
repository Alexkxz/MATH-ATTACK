const { spawn } = require('child_process');
const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667, minGameWidth: 320, maxGameWidth: 480, minOptionsCols: 2 },
  { name: 'tablet', width: 820, height: 1180, minGameWidth: 680, maxGameWidth: 780, minOptionsCols: 2 },
  { name: 'desktop', width: 1366, height: 768, minGameWidth: 860, maxGameWidth: 1000, minOptionsCols: 4 },
];

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (e) {}
    await wait(250);
  }
  throw new Error(`No se pudo conectar a ${url}`);
}

async function measure(page) {
  return page.evaluate(() => {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById('gameScreen')?.classList.add('active');
    document.getElementById('gameWrap')?.classList.remove('wide');

    const wrap = document.getElementById('gameWrap');
    const question = document.getElementById('questionCard');
    const options = document.getElementById('optionsGrid');
    const login = document.querySelector('.login-card');
    const optionButtons = [...document.querySelectorAll('.opt-btn')];
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };

    const optionRects = optionButtons.map(rect);
    const optionCols = new Set(optionRects.map(r => Math.round(r.left))).size;
    const overlappingOptions = optionRects.some((a, i) => optionRects.some((b, j) => (
      i < j &&
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top
    )));

    return {
      viewport: { width: innerWidth, height: innerHeight },
      wrap: rect(wrap),
      question: rect(question),
      options: rect(options),
      login: rect(login),
      optionCols,
      overlappingOptions,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}

function assertViewport(result, expected) {
  const problems = [];
  if (result.wrap.width < expected.minGameWidth) {
    problems.push(`gameWrap demasiado angosto: ${Math.round(result.wrap.width)}px`);
  }
  if (result.wrap.width > expected.maxGameWidth) {
    problems.push(`gameWrap demasiado ancho: ${Math.round(result.wrap.width)}px`);
  }
  if (result.optionCols < expected.minOptionsCols) {
    problems.push(`opciones con pocas columnas: ${result.optionCols}`);
  }
  if (result.overlappingOptions) problems.push('opciones encimadas');
  if (result.horizontalOverflow) problems.push('overflow horizontal');
  if (result.question.width > result.wrap.width + 1) problems.push('pregunta se sale del contenedor');
  if (result.options.width > result.wrap.width + 1) problems.push('opciones se salen del contenedor');

  if (problems.length) {
    throw new Error(`${expected.name}: ${problems.join(', ')}`);
  }
}

async function main() {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let serverOutput = '';
  server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

  try {
    await waitForServer('http://localhost:8080/');

    const browser = await chromium.launch();
    try {
      for (const viewport of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
        const result = await measure(page);
        assertViewport(result, viewport);
        console.log(`OK: ${viewport.name} ${viewport.width}x${viewport.height} gameWrap=${Math.round(result.wrap.width)}px cols=${result.optionCols}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (serverOutput.trim()) console.error(serverOutput.trim());
    throw err;
  } finally {
    server.kill('SIGINT');
  }
}

main().catch(err => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
