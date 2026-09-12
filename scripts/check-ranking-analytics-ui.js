'use strict';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

const rankingHtml = fs.readFileSync('ranking.html', 'utf8');
const normal = { id: 1, name: 'Ana', grade: '5A', score: 95, pct: 95, correct: 19, wrong: 1, total: 20, gameMode: 'solo', date: '01/09/2026', time: '10:00' };
const officialA = { id: 2, name: 'Luis', accountPlayerId: 'acct-luis', groupId: 'grupo-a', score: 90, pct: 90, correct: 18, wrong: 2, total: 20, isExam: true, testTitle: 'Prueba septiembre', testId: '11111111-1111-4111-8111-111111111111', officialAttemptId: '33333333-3333-4333-8333-333333333333', rankingPublicationId: '44444444-4444-4444-8444-444444444444', rewardStatus: 'completed', date: '02/09/2026', time: '11:00' };
const officialB = { id: 3, name: 'Luis', accountPlayerId: 'acct-luis', groupId: 'grupo-a', score: 70, pct: 70, correct: 14, wrong: 6, total: 20, isExam: true, testTitle: 'Prueba, octubre', testId: '22222222-2222-4222-8222-222222222222', officialAttemptId: '55555555-5555-4555-8555-555555555555', rankingPublicationId: '66666666-6666-4666-8666-666666666666', date: '02/10/2026', time: '11:00' };
const legacy = { id: 4, name: 'Mia', score: 60, pct: 60, correct: 6, wrong: 4, total: 10, isExam: true, date: '03/10/2026', time: '12:00' };
function parseCsvRow(line){
  const values=[]; let value=''; let quoted=false;
  for(let i=0;i<line.length;i++){
    const char=line[i];
    if(char==='"'&&quoted&&line[i+1]==='"'){ value+='"'; i++; continue; }
    if(char==='"'){ quoted=!quoted; continue; }
    if(char===','&&!quoted){ values.push(value); value=''; continue; }
    value+=char;
  }
  values.push(value);
  return values;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
    const errors = [];
    let rows = [normal, officialA, officialB, legacy];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://ranking.test/ranking', route => route.fulfill({ status: 200, contentType: 'text/html', body: rankingHtml }));
    await page.route('http://ranking.test/chart.umd.min.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.route('http://ranking.test/api/ranking', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
    await page.route('http://ranking.test/api/players', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('http://ranking.test/ranking', { waitUntil: 'networkidle' });
    assert.deepEqual(errors, []);
    await page.locator('[data-tab="pruebas"]').click();
    await page.waitForFunction(() => document.querySelector('[data-exam-analytics]'));
    assert.equal(await page.locator('[data-exam-analytics]').count(), 1);
    assert.equal(await page.locator('[data-stat="tests"] strong').textContent(), '3');
    assert.equal(await page.locator('[data-stat="students"] strong').textContent(), '2');
    assert.equal(await page.locator('[data-stat="results"] strong').textContent(), '3');
    assert.equal(await page.locator('[data-stat="average"] strong').textContent(), '73%');
    assert.equal(await page.locator('[data-stat="best"] strong').textContent(), '90%');
    assert.equal(await page.locator('[data-stat="lowest"] strong').textContent(), '60%');
    assert.equal(await page.locator('[data-stat="published"] strong').textContent(), '2');
    assert.equal(await page.locator('[data-stat="settled"] strong').textContent(), '1');
    assert.equal(await page.locator('[data-table="by-test"] tbody tr').count(), 3);
    assert.equal(await page.locator('[data-table="by-student"] tbody tr').count(), 2);
    assert.equal(await page.locator('[data-table="by-group"] tbody tr').count(), 1);
    assert.equal(await page.locator('[data-chart]').count(), 4);
    assert.equal(await page.locator('.exam-identifiers').count(), 3);
    const legacyData = await page.evaluate(() => data.find(row => row.id === 4));
    assert.equal(legacyData.isExam, true);
    assert.equal(legacyData.testId, undefined);
    const legacyStatsRow = page.locator('[data-table="by-test"] tbody tr').filter({ hasText: 'No disponible' });
    assert.equal(await legacyStatsRow.count(), 1);
    const legacyStatsCells = legacyStatsRow.locator('td');
    assert((await legacyStatsCells.nth(0).textContent()).includes('No disponible'));
    assert((await legacyStatsCells.nth(1).textContent()).includes('No disponible'));
    assert((await page.locator('.exam-identifiers').allTextContents()).join(' ').includes('11111111-1111-4111-8111-111111111111'));

    await page.locator('#examStudentFilter').fill('Luis');
    await page.waitForFunction(() => document.querySelector('[data-stat="results"] strong')?.textContent === '2');
    assert.equal(await page.locator('[data-chart]').count(), 4);
    assert.equal(await page.locator('.exam-identifiers').count(), 2);
    await page.locator('#examStudentFilter').fill('');
    await page.locator('#examNameFilter').fill('octubre');
    await page.waitForFunction(() => document.querySelector('[data-stat="results"] strong')?.textContent === '1');
    assert.equal(await page.locator('[data-table="by-test"] tbody tr').count(), 1);
    await page.locator('#examNameFilter').fill('');
    await page.waitForFunction(() => document.querySelector('[data-stat="results"] strong')?.textContent === '3');
    assert.equal(await page.locator('[data-chart]').count(), 4);

    await page.locator('[data-tab="partidas"]').click();
    await page.waitForFunction(() => document.querySelector('#mainContent')?.textContent.includes('Ana'));
    assert.equal(await page.locator('#exportOfficialTestsBtn').evaluate(button => getComputedStyle(button).display), 'none');
    const normalDownload = await Promise.all([page.waitForEvent('download'), page.locator('button[onclick="exportCSV()"]').click()]).then(([download]) => download);
    const normalCsvPath = await normalDownload.path();
    const normalCsv = fs.readFileSync(normalCsvPath, 'utf8');
    assert(normalCsv.includes('Ana'));
    assert(!normalCsv.includes('Prueba septiembre'));
    assert(!/password|pwd|token|cookie|session/i.test(normalCsv));
    await page.locator('[data-tab="pruebas"]').click();
    await page.waitForFunction(() => document.querySelector('[data-exam-analytics]'));
    const officialExportButton = page.locator('#exportOfficialTestsBtn');
    assert.equal(await officialExportButton.count(), 1);
    assert.equal(await page.locator('[data-tab="pruebas"].active').count(), 1);
    const officialExportStyle = await officialExportButton.evaluate(button => { const style = getComputedStyle(button); return { display: style.display, visibility: style.visibility, opacity: style.opacity, text: button.textContent }; });
    assert(['flex', 'inline-flex'].includes(officialExportStyle.display));
    assert.notEqual(officialExportStyle.display, 'none');
    assert.notEqual(officialExportStyle.visibility, 'hidden');
    assert.notEqual(officialExportStyle.opacity, '0');
    assert(officialExportStyle.text.includes('Exportar pruebas'));
    const examDownload = await Promise.all([page.waitForEvent('download'), page.locator('#exportOfficialTestsBtn').click()]).then(([download]) => download);
    const examCsvPath = await examDownload.path();
    const examCsv = fs.readFileSync(examCsvPath, 'utf8');
    assert(examCsv.includes('Prueba septiembre'));
    assert(examCsv.includes('Mia'));
    assert(!examCsv.includes('Ana'));
    assert(!/password|pwd|token|cookie|session/i.test(examCsv));
    assert(examCsv.includes('11111111-1111-4111-8111-111111111111'));
    assert(examCsv.includes('33333333-3333-4333-8333-333333333333'));
    assert(examCsv.includes('44444444-4444-4444-8444-444444444444'));
    const examCsvRows = examCsv.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(parseCsvRow);
    const examHeader = examCsvRows[0];
    assert.equal(examHeader.length, 11);
    const commaTitleRow = examCsvRows.find(row => row[0] === 'Prueba, octubre');
    assert(commaTitleRow);
    assert.equal(commaTitleRow.length, 11);
    assert.equal(commaTitleRow[1], '22222222-2222-4222-8222-222222222222');
    assert.equal(commaTitleRow[6], '55555555-5555-4555-8555-555555555555');
    assert.equal(commaTitleRow[7], '66666666-6666-4666-8666-666666666666');
    await page.locator('#examTestIdFilter').fill('11111111');
    await page.waitForFunction(() => document.querySelector('[data-stat="results"] strong')?.textContent === '1');
    const filteredDownload = await Promise.all([page.waitForEvent('download'), page.locator('#exportOfficialTestsBtn').click()]).then(([download]) => download);
    const filteredCsvPath = await filteredDownload.path();
    const filteredCsv = fs.readFileSync(filteredCsvPath, 'utf8');
    assert(filteredCsv.includes('Prueba septiembre'));
    assert(!filteredCsv.includes('Prueba, octubre'));
    assert(!filteredCsv.includes('Mia'));
    await page.locator('#examTestIdFilter').fill('');
    await page.waitForFunction(() => document.querySelector('[data-stat="results"] strong')?.textContent === '3');

    await page.locator('#examTestIdFilter').fill('not-found');
    await page.waitForFunction(() => document.querySelector('#mainContent')?.textContent.includes('No hay resultados de pruebas aún.'));
    assert.equal(await page.locator('.exam-identifiers').count(), 0);
    assert.equal(await page.locator('[data-exam-analytics]').count(), 0);
    assert.equal(await page.locator('[data-chart]').count(), 0);
    const emptyText = await page.locator('#mainContent').textContent();
    assert(!/NaN|undefined|Prueba septiembre|Prueba octubre/i.test(emptyText));
    await page.locator('#examTestIdFilter').fill('');
    await page.waitForFunction(() => document.querySelector('[data-stat="results"] strong')?.textContent === '3');

    await page.setViewportSize({ width: 375, height: 900 });
    assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= 375);
    const visibleAnalytics = await page.locator('[data-exam-analytics]').innerText();
    assert(!/password|pwd|token|cookie|session/i.test(visibleAnalytics));
    assert.deepEqual(errors, []);
    console.log('OK: estadísticas y gráficas de pruebas oficiales respetan filtros, legados, grupos, estados vacíos, responsive y separación de partidas.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
