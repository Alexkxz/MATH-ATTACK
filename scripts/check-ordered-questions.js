const path = require('path');
const { chromium } = require('playwright');

const htmlPath = path.resolve(__dirname, '..', 'math-attack.html');
const url = `file:///${htmlPath.replace(/\\/g, '/')}`;

function assertSequence(actual, expected, label) {
  const sameLength = actual.length === expected.length;
  const sameItems = sameLength && actual.every((item, index) => item === expected[index]);
  if (!sameItems) {
    throw new Error(`${label} incorrecto.\nEsperado: ${expected.join(', ')}\nRecibido: ${actual.join(', ')}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(url);

  const result = await page.evaluate(() => {
    selectedOps = ['×'];
    selectedTbls = [9];
    tblSelMode = 'custom';
    tblManner = 'ordered';
    multMin = 1;
    multMax = 12;
    qptPerTable = 12;

    const ordered = buildQ().map(q => qText(q));

    tblManner = 'random';
    const random = buildQRandom().map(q => qText(q));

    return { ordered, random };
  });

  await browser.close();

  if (pageErrors.length) {
    throw new Error(`Errores de pagina:\n${pageErrors.join('\n')}`);
  }

  assertSequence(
    result.ordered,
    ['9 × 1', '9 × 2', '9 × 3', '9 × 4', '9 × 5', '9 × 6', '9 × 7', '9 × 8', '9 × 9', '9 × 10', '9 × 11', '9 × 12'],
    'Modo orden tabla 9'
  );

  if (result.random.length !== 12 || !result.random.every(text => text.startsWith('9 × '))) {
    throw new Error(`Modo aleatorio tabla 9 genero preguntas invalidas: ${result.random.join(', ')}`);
  }

  console.log('OK: modo orden tabla 9 conserva 9 × 1 a 9 × 12 y modo aleatorio sigue generando 12 preguntas validas.');
})().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
