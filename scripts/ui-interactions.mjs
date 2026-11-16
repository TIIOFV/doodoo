import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import playwrightPath from './playwright-path.mjs';
import { mock } from './ui-audit.mjs';
const { chromium } = await import(pathToFileURL(path.join(playwrightPath, 'index.mjs')).href);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
async function scenario(name, test) {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
  await mock(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  try { await test(page, context); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
  console.log(name, results.at(-1).pass, results.at(-1).error || '');
  await context.close();
}
async function go(page, route) {
  await page.goto(`http://localhost:3100${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.body.innerText.length > 150);
  await page.waitForTimeout(200);
}
await scenario('task validation, single submit, busy Escape and create', async (page, context) => {
  let writes = 0;
  let release;
  await context.route('**/rest/v1/doodoo_tarefas*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    await new Promise(resolve => { release = resolve; });
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { id: 'new-task', created_at: new Date().toISOString(), ...(Array.isArray(body) ? body[0] : body) } });
  });
  await go(page, '/dashboard/tarefas');
  await page.getByRole('button', { name: 'Nova Tarefa', exact: true }).filter({ visible: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Salvar Tarefa' }).click();
  assert(writes === 0, 'Empty required title reached the network');
  await dialog.getByLabel('Título da Demanda *').fill('Tarefa simulada');
  await dialog.getByRole('button', { name: 'Salvar Tarefa' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-busy=true]'));
  await page.evaluate(() => document.querySelector('#form-criar-demanda').requestSubmit());
  await page.keyboard.press('Escape');
  assert(await dialog.count() === 1, 'Busy dialog closed by Escape');
  release();
  await dialog.waitFor({ state: 'detached' });
  assert(writes === 1, `Expected one insert, got ${writes}`);
});
await scenario('failed note retains form and announces error', async (page, context) => {
  await context.route('**/rest/v1/doodoo_notas*', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, json: { message: 'Falha simulada', code: 'TEST' } }) : route.fallback());
  await go(page, '/dashboard/notas');
  await page.getByRole('button', { name: /^Nova/ }).click();
  await page.getByLabel('Título da Nota').fill('Texto preservado');
  await page.getByRole('button', { name: 'Salvar Nota' }).click();
  await page.getByRole('status').filter({ hasText: 'Erro ao salvar' }).waitFor();
  assert(await page.getByRole('dialog').count() === 1, 'Failure closed the form');
  assert(await page.getByLabel('Título da Nota').inputValue() === 'Texto preservado', 'Failure erased user input');
});
await scenario('nested dialogs restore inert state and focus', async page => {
  await go(page, '/dashboard/notas');
  await page.getByRole('button', { name: /^Nova/ }).click();
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Novo Caderno/i.test(x.getAttribute('aria-label') || '') && x.getClientRects().length).click());
  assert(await page.getByRole('dialog', { includeHidden: true }).count() === 2, 'Did not open both dialogs');
  const top = page.getByRole('dialog', { name: 'Novo Caderno' });
  await top.getByLabel('Nome do Caderno').focus();
  await page.keyboard.press('Escape');
  assert(await page.getByRole('dialog').count() === 1, 'Escape closed more than the top dialog');
  assert(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement)), 'Focus did not return to the remaining dialog');
  await page.keyboard.press('Escape');
  assert(await page.evaluate(() => !document.querySelector('main').closest('[inert]') && document.body.style.overflow !== 'hidden'), 'Background isolation was not restored');
});
await scenario('missing profile fails closed without fallback identity', async (page, context) => {
  const requests = [];
  await context.route('**/rest/v1/doodoo_perfis*', route => {
    requests.push(new URL(route.request().url()).search);
    return route.fulfill({ json: null });
  });
  await page.goto('http://localhost:3100/dashboard/tarefas', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  assert(await page.getByRole('button', { name: 'Nova Tarefa', exact: true }).count() === 0, 'Task creation is available without a profile');
  assert(!requests.some(q => q.includes('ilike') || q.includes('limit=1')), 'Fallback identity query detected');
});
await scenario('chat mobile composer, emoji, simulated send and upload failure', async (page, context) => {
  await context.route('**/storage/v1/**', route => route.fulfill({ status: 500, json: { message: 'Upload simulado indisponível' } }));
  await go(page, '/dashboard/conversas');
  await page.getByText('Equipe UI', { exact: true }).first().click();
  const composer = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await composer.fill('Mensagem apenas no mock');
  const rect = await composer.boundingBox();
  assert(rect.width >= 240 && rect.y + rect.height <= 568, 'Composer is clipped or too narrow');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByText('Mensagem apenas no mock', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Emojis', exact: true }).click();
  assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'Emoji popover overflows the viewport');
  await page.locator('input[type=file]').last().setInputFiles({ name: 'fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('isolated test') });
  await page.getByRole('status').filter({ hasText: 'Erro de Envio' }).waitFor();
  await page.setViewportSize({ width: 320, height: 360 });
  assert(await composer.isVisible(), 'Composer disappeared in a shorter viewport');
  await page.screenshot({ animations: 'disabled', path: 'docs/ui-audit/after/chat-short-viewport.png' });
});
await scenario('agenda day/week and navigation', async page => {
  await go(page, '/dashboard/agenda');
  await page.getByRole('button', { name: 'Dia', exact: true }).click();
  await page.getByText(/Agenda de /).waitFor();
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await page.getByRole('button', { name: 'Próximo', exact: true }).click();
  assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'Calendar overflows');
});
fs.writeFileSync('docs/ui-audit/after/interactions.json', JSON.stringify(results, null, 2));
await browser.close();
if (results.some(x => !x.pass)) process.exitCode = 1;
