// Teste de ponta a ponta no navegador: site real + emulador do Firestore/Auth
// com as regras reais (firestore.rules) + câmera falsa que "filma" os QR codes.
// Uso: npm run test:e2e   (o script sobe os emuladores e roda este arquivo)
//
// Navegador: usa o Microsoft Edge instalado (channel "msedge"); mude para
// E2E_BROWSER_CHANNEL=chrome se preferir o Chrome.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const SITE_ROOT = path.join(__dirname, '..');
const GuestUtils = require(path.join(SITE_ROOT, 'js', 'guest-utils.js'));
const BROWSER_CHANNEL = process.env.E2E_BROWSER_CHANNEL || 'msedge';
const SHOTS_DIR = process.env.SHOTS_DIR || null;
const BRIDE = { email: 'noiva@teste.com', password: 'senha-forte-123' };

// Firebase de teste: mesmo js/firebase-init.js, apontando para os emuladores.
const EMULATOR_INIT = `
  firebase.initializeApp({ apiKey: 'fake-key', authDomain: 'localhost', projectId: 'demo-convite' });
  var auth = firebase.auth();
  auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
  var db = firebase.firestore();
  db.useEmulator('127.0.0.1', 8080);
`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.otf': 'font/otf',
  '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.gif': 'image/gif',
};

let server;
let baseUrl;
let env;
let tmpDir;
const pageErrors = [];
const browsers = [];

// ---------------------------------------------------------------- infraestrutura

function startStaticServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(SITE_ROOT, urlPath === '/' ? 'index.html' : urlPath);
      if (!file.startsWith(SITE_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function poll(fn, predicate, { timeout = 15000, interval = 100, what = 'condição' } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Tempo esgotado esperando ${what}. Último valor: ${JSON.stringify(last)}`);
}

async function adminRead(docPath) {
  let data;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(docPath).get();
    data = snap.exists ? snap.data() : null;
  });
  return data;
}

async function launch({ fakeCameraFile = null, viewport = { width: 1280, height: 900 } } = {}) {
  const args = [];
  if (fakeCameraFile) {
    args.push('--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${fakeCameraFile}`);
  }
  const browser = await chromium.launch({ channel: BROWSER_CHANNEL, headless: true, args });
  browsers.push(browser);
  const context = await browser.newContext({ viewport, acceptDownloads: true, permissions: fakeCameraFile ? ['camera'] : [] });
  await context.route('**/js/firebase-init.js', (route) => route.fulfill({ contentType: 'application/javascript', body: EMULATOR_INIT }));
  return { browser, context };
}

async function openSite(context) {
  const page = await context.newPage();
  page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    // permission-denied em listeners é esperado quando a regra bloqueia de propósito.
    if (msg.type() === 'error' && !/permission|Missing or insufficient|Failed to load resource/i.test(msg.text())) {
      pageErrors.push(`console.error: ${msg.text()}`);
    }
  });
  await page.goto(baseUrl);
  await page.click('#envelopeSeal', { force: true }); // o selo pulsa (animação contínua): o Playwright nunca o vê "parado"
  await page.waitForSelector('#envelopeIntro.is-open', { timeout: 10000 });
  return page;
}

async function shot(page, name) {
  if (SHOTS_DIR) await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

async function loginViaModal(page) {
  await page.fill('#loginEmail', BRIDE.email);
  await page.fill('#loginPassword', BRIDE.password);
  await page.click('#loginForm button[type="submit"]');
}

async function loginBride(page) {
  await page.click('#footerLoginBtn');
  await loginViaModal(page);
  await page.waitForFunction(() => document.getElementById('footerLoginBtn').textContent.trim() === 'Sair');
}

const optionTexts = (page) => page.locator('#guestListbox .combo__option').allTextContents();

// ---------------------------------------------------------------- câmera falsa (y4m)

function loadQrLib() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['qrcode.js', 'qrcode_UTF8.js']) {
    vm.runInContext(fs.readFileSync(path.join(SITE_ROOT, 'js', 'vendor', file), 'utf8'), sandbox);
  }
  return sandbox.qrcode;
}

// Vídeo Y4M (640x480) de um QR code parado, para o Chromium usar como câmera.
// Com text = null o quadro fica em branco (câmera aberta, nada para ler).
function writeQrVideo(text, fileName) {
  const W = 640, H = 480, SCALE = 8, QUIET = 4;
  const qr = loadQrLib()(0, 'M');
  if (text !== null) qr.addData(text, 'Byte');
  qr.make();
  const count = text === null ? 0 : qr.getModuleCount();
  const side = (count + QUIET * 2) * SCALE;
  const y = Buffer.alloc(W * H, 255);
  const left = Math.floor((W - side) / 2);
  const top = Math.floor((H - side) / 2);
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c)) continue;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          y[(top + (r + QUIET) * SCALE + dy) * W + left + (c + QUIET) * SCALE + dx] = 0;
        }
      }
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  const file = path.join(tmpDir, fileName);
  fs.writeFileSync(file, Buffer.concat([header, frame, frame, frame, frame, frame]));
  return file;
}

// Abre a Portaria num celular "filmando" `qrText` e clica em "Ler QR code".
async function scanInPortaria(qrText, tag) {
  const video = writeQrVideo(qrText, `${tag}.y4m`);
  const { browser, context } = await launch({ fakeCameraFile: video, viewport: { width: 390, height: 844 } });
  try {
    const page = await openSite(context);
    await page.click('#footerPortariaBtn'); // deslogado: pede login e abre a portaria sozinha
    await loginViaModal(page);
    await page.waitForSelector('#portaria.is-open');
    await page.click('#portariaScanBtn');
    await page.waitForSelector('#portariaResult:not(.is-hidden)', { timeout: 20000 });
    await page.waitForFunction(() => !document.getElementById('scanner').classList.contains('is-open'));
    const result = {
      className: await page.locator('#portariaResult').getAttribute('class'),
      title: await page.locator('#portariaResultTitle').textContent(),
      text: await page.locator('#portariaResultText').textContent(),
    };
    await shot(page, `portaria-${tag}`);
    return result;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- preparação

test.before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'convite-e2e-'));
  if (SHOTS_DIR) fs.mkdirSync(SHOTS_DIR, { recursive: true });
  server = await startStaticServer();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;

  env = await initializeTestEnvironment({
    projectId: 'demo-convite',
    firestore: { rules: fs.readFileSync(path.join(SITE_ROOT, 'firestore.rules'), 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('guests/maria').set({ name: 'Maria Silva' });
    await db.doc('guests/jose').set({ name: 'José Antônio da Conceição' });
    await db.doc('guests/joao').set({ name: 'João Souza' });
    await db.doc('guests/ana').set({ name: 'Ana Costa', confirmed: true });
    await db.doc('gifts/g1').set({ name: 'Jogo de panelas', claimedBy: null, claimedAt: null, createdAt: new Date(2026, 0, 2) });
    await db.doc('gifts/g2').set({ name: 'Liquidificador', claimedBy: 'Tia Célia', claimedAt: new Date(), createdAt: new Date(2026, 0, 1) });
  });

  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...BRIDE, returnSecureToken: true }),
  });
  assert.equal(res.status, 200, 'não conseguiu criar a conta da noiva no emulador de Auth');
});

test.after(async () => {
  for (const b of browsers) await b.close().catch(() => {});
  await env.cleanup();
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Estado compartilhado entre os testes (rodam em sequência, na ordem do arquivo).
const shared = {};

// ---------------------------------------------------------------- 1, 2: busca e lista

test('1-2. Confirmação: convidado busca o nome; quem já respondeu não aparece', async () => {
  const { context } = await launch();
  shared.guestContext = context;
  const page = await openSite(context);
  shared.guestPage = page;
  await page.click('.site-menu__item[data-open-page="confirmar"]');
  await page.click('#nomeBusca');

  // Ana já tem confirmed:true => fora da lista; os demais em ordem alfabética.
  assert.deepEqual(await poll(() => optionTexts(page), (t) => t.length === 3, { what: 'lista de nomes' }), [
    'João Souza', 'José Antônio da Conceição', 'Maria Silva',
  ]);
  await shot(page, 'rsvp-lista');

  await page.fill('#nomeBusca', 'JOSE antonio');
  assert.deepEqual(await optionTexts(page), ['José Antônio da Conceição'], 'busca sem acento e sem diferenciar maiúsculas');

  await page.fill('#nomeBusca', 'silva maria');
  assert.deepEqual(await optionTexts(page), ['Maria Silva'], 'palavras em qualquer ordem');

  await page.fill('#nomeBusca', 'zzzz');
  assert.deepEqual(await page.locator('#guestListbox .combo__empty').allTextContents(), ['Nenhum nome encontrado.']);

  await page.fill('#nomeBusca', '');
  assert.equal((await optionTexts(page)).length, 3, 'busca vazia volta a mostrar todos');
});

test('1. Confirmação: teclado (setas + Enter) e mouse escolhem o nome; sem escolher, não envia', async () => {
  const page = shared.guestPage;

  // Enviar sem escolher nenhum nome
  await page.fill('#nomeBusca', 'mar');
  await page.click('#rsvpForm button[type="submit"]');
  assert.match(await page.locator('#formFeedback').textContent(), /escolha-o na lista/);
  assert.equal(await page.locator('#rsvpDone.is-hidden').count(), 1, 'não pode avançar sem nome');

  // Teclado
  await page.fill('#nomeBusca', 'sil');
  await page.press('#nomeBusca', 'ArrowDown');
  await page.press('#nomeBusca', 'Enter');
  assert.equal(await page.inputValue('#nomeBusca'), 'Maria Silva');
  assert.equal(await page.inputValue('#nome'), 'maria');
  assert.equal(await page.locator('#guestListbox.is-hidden').count(), 1, 'lista fecha ao escolher');

  // Digitar de novo invalida a escolha
  await page.fill('#nomeBusca', 'Maria S');
  assert.equal(await page.inputValue('#nome'), '', 'mudar o texto limpa o nome escolhido');

  // Mouse
  await page.fill('#nomeBusca', 'maria');
  await page.click('#guestListbox .combo__option');
  assert.equal(await page.inputValue('#nome'), 'maria');
});

// ---------------------------------------------------------------- 3: QR + PDF

test('3. Confirmar "sim": QR na tela, PDF para baixar, QR único com nome completo + id', async () => {
  const page = shared.guestPage;
  await page.fill('#mensagem', 'Muito felizes! 💛');
  await page.click('#rsvpForm button[type="submit"]');

  await page.waitForSelector('#rsvpDone:not(.is-hidden)');
  assert.match(await page.locator('#rsvpDoneTitle').textContent(), /Presença confirmada/);
  assert.equal(await page.locator('#rsvpQrBox:not(.is-hidden)').count(), 1);
  assert.equal(await page.locator('#rsvpQrName').textContent(), 'Maria Silva');
  await shot(page, 'rsvp-confirmado');

  // Firestore: id do doc = id do convidado; guest marcado; QR id aleatório salvo.
  const rsvp = await adminRead('rsvps/maria');
  assert.equal(rsvp.nome, 'Maria Silva');
  assert.equal(rsvp.presenca, 'sim');
  assert.equal(rsvp.mensagem, 'Muito felizes! 💛');
  assert.equal(rsvp.checkedIn, false);
  assert.match(rsvp.qrId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal((await adminRead('guests/maria')).confirmed, true);
  shared.maria = { name: rsvp.nome, id: rsvp.qrId };

  // O QR mostrado na tela decodifica para exatamente {nome completo, id}.
  const decoded = await page.evaluate(async () => {
    const img = document.getElementById('rsvpQrImg');
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(frame.data, frame.width, frame.height);
    return code && code.data;
  });
  assert.deepEqual(GuestUtils.parseQrPayload(decoded), shared.maria);

  // O botão baixa um PDF de verdade.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#rsvpDownloadBtn')]);
  assert.equal(download.suggestedFilename(), 'convite-maria-silva.pdf');
  const pdfPath = path.join(tmpDir, 'baixado.pdf');
  await download.saveAs(pdfPath);
  const pdf = fs.readFileSync(pdfPath);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.includes('Maria Silva'), 'o PDF traz o nome do convidado');
  assert.ok(pdf.length > 2000);
});

test('2. Depois de confirmar, o nome sai da lista; "Confirmar outra pessoa" volta ao formulário', async () => {
  const page = shared.guestPage;
  await page.click('#rsvpAnotherBtn');
  await page.waitForSelector('#rsvpForm:not(.is-hidden)');
  assert.equal(await page.inputValue('#nomeBusca'), '', 'formulário limpo');

  await page.click('#nomeBusca');
  assert.deepEqual(await poll(() => optionTexts(page), (t) => !t.includes('Maria Silva'), { what: 'Maria sumir da lista' }), [
    'João Souza', 'José Antônio da Conceição',
  ]);
});

test('2. Responder "não": sem QR code, e o nome também sai da lista', async () => {
  const page = shared.guestPage;
  await page.fill('#nomeBusca', 'joao');
  await page.click('#guestListbox .combo__option');
  await page.check('input[name="presenca"][value="nao"]');
  await page.click('#rsvpForm button[type="submit"]');

  await page.waitForSelector('#rsvpDone:not(.is-hidden)');
  assert.match(await page.locator('#rsvpDoneTitle').textContent(), /Recebemos a sua resposta/);
  assert.equal(await page.locator('#rsvpQrBox.is-hidden').count(), 1, 'quem não vai não recebe QR code');

  const rsvp = await adminRead('rsvps/joao');
  assert.equal(rsvp.presenca, 'nao');
  assert.equal(rsvp.qrId, null);

  await page.click('#rsvpAnotherBtn');
  await page.click('#nomeBusca');
  assert.deepEqual(await poll(() => optionTexts(page), (t) => !t.includes('João Souza'), { what: 'João sumir da lista' }), [
    'José Antônio da Conceição',
  ]);
});

test('3. Nome com acentos: o último convidado confirma e a lista fica vazia', async () => {
  const page = shared.guestPage;
  await page.fill('#nomeBusca', 'jose');
  await page.click('#guestListbox .combo__option');
  await page.click('#rsvpForm button[type="submit"]');
  await page.waitForSelector('#rsvpDone:not(.is-hidden)');

  const rsvp = await adminRead('rsvps/jose');
  shared.jose = { name: rsvp.nome, id: rsvp.qrId };
  assert.equal(shared.jose.name, 'José Antônio da Conceição');
  assert.notEqual(shared.jose.id, shared.maria.id, 'cada convidado tem um id único');

  await page.click('#rsvpAnotherBtn');
  await page.waitForFunction(() => document.getElementById('nomeBusca').disabled);
  assert.match(await page.locator('#guestsEmptyHint').textContent(), /Todos os convidados da lista já responderam/);
});

test('2. Não dá para responder duas vezes nem forçando pelo console (regras do servidor)', async () => {
  const page = shared.guestPage;
  const outcome = await page.evaluate(async () => {
    try {
      await submitRsvp({ guestId: 'maria', name: 'Maria Silva', presenca: 'sim', mensagem: 'de novo' });
      return 'permitido';
    } catch (err) {
      return err.code;
    }
  });
  assert.equal(outcome, 'permission-denied');
  assert.equal((await adminRead('rsvps/maria')).qrId, shared.maria.id, 'o QR original continua valendo');
});

// ---------------------------------------------------------------- 4, 5: painel da noiva

test('4-5. Painel da noiva: busca de convidados e filtro de presentes', async () => {
  const { context } = await launch({ viewport: { width: 1280, height: 900 } });
  shared.brideContext = context;
  const page = await openSite(context);
  shared.bridePage = page;
  await loginBride(page);
  await page.click('.site-menu__item[data-open-page="painel"]');

  // ---- 5. Pesquisar convidado
  const guestNames = () => page.locator('#adminGuestsList .admin__item-title').allTextContents();
  await poll(guestNames, (t) => t.length === 4, { what: 'lista de convidados no painel' });
  await page.fill('#adminGuestSearch', 'JOSE');
  assert.deepEqual((await guestNames()).map((t) => t.trim()), ['José Antônio da Conceição já respondeu']);
  await page.fill('#adminGuestSearch', 'costa');
  assert.deepEqual((await guestNames()).map((t) => t.trim()), ['Ana Costa já respondeu']);
  await page.fill('#adminGuestSearch', 'xyz');
  assert.equal((await guestNames()).length, 0);
  assert.equal(await page.locator('#adminGuestsEmpty').textContent(), 'Nenhum convidado encontrado.');
  await page.fill('#adminGuestSearch', '');
  assert.equal((await guestNames()).length, 4);
  assert.equal(await page.locator('#adminGuestsCount').textContent(), '4', 'o contador continua mostrando o total');

  // ---- 4. Filtro de presentes
  await page.click('.admin__tab[data-tab="presentes"]');
  const giftNames = () => page.locator('#adminGiftsList .admin__item-title').allTextContents();
  await poll(giftNames, (t) => t.length === 2, { what: 'lista de presentes no painel' });

  await page.click('[data-gift-filter="available"]');
  assert.deepEqual(await giftNames(), ['Jogo de panelas']);
  await page.click('[data-gift-filter="claimed"]');
  assert.deepEqual(await giftNames(), ['Liquidificador']);
  assert.match(await page.locator('#adminGiftsList .admin__item-meta').textContent(), /Escolhido por\s*Tia Célia/);
  await page.click('[data-gift-filter="all"]');
  assert.equal((await giftNames()).length, 2);
  assert.equal(await page.locator('#adminGiftFilter .is-active').textContent(), 'Todos');
  await shot(page, 'painel-presentes');

  // Um presente escolhido no meio do caminho move de "disponíveis" para "indisponíveis" ao vivo.
  await page.click('[data-gift-filter="available"]');
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('gifts/g1').update({ claimedBy: 'Alguém' }));
  await poll(giftNames, (t) => t.length === 0, { what: 'lista de disponíveis esvaziar' });
  assert.equal(await page.locator('#adminGiftsEmpty').textContent(), 'Nenhum presente disponível.');
  await page.click('[data-gift-filter="claimed"]');
  assert.equal((await giftNames()).length, 2);
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('gifts/g1').update({ claimedBy: null }));
});

test('Painel: aba Confirmações lista respostas, baixa o QR de qualquer convidado e conta só os "sim"', async () => {
  const page = shared.bridePage;
  await page.click('.admin__tab[data-tab="confirmacoes"]');
  await poll(() => page.locator('#adminRsvpsList .admin__item').count(), (n) => n === 3, { what: '3 respostas' });
  assert.equal(await page.locator('#adminRsvpsCount').textContent(), '2', 'só quem vai comparecer');
  assert.equal(await page.locator('#adminRsvpsList [data-action="qr"]').count(), 2, 'QR só para quem disse "sim"');
  await shot(page, 'painel-confirmacoes');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#adminRsvpsList .admin__item', { hasText: 'José Antônio' }).locator('[data-action="qr"]').click(),
  ]);
  assert.equal(download.suggestedFilename(), 'convite-jose-antonio-da-conceicao.pdf');
});

test('Painel: excluir a resposta devolve o nome à lista de confirmação (e o QR antigo deixa de existir)', async () => {
  const page = shared.bridePage;
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#adminRsvpsList .admin__item', { hasText: 'João Souza' }).locator('[data-action="delete"]').click();

  await poll(() => adminRead('rsvps/joao'), (d) => d === null, { what: 'resposta do João ser excluída' });
  assert.equal((await adminRead('guests/joao')).confirmed, false);

  // ... e o convidado, na outra janela, volta a ver o nome sem recarregar.
  const guest = shared.guestPage;
  await guest.waitForFunction(() => !document.getElementById('nomeBusca').disabled);
  await guest.click('#nomeBusca');
  assert.deepEqual(await poll(() => optionTexts(guest), (t) => t.length === 1, { what: 'João voltar à lista' }), ['João Souza']);
});

// ---------------------------------------------------------------- 6-12: portaria

test('6-7. Portaria: link no rodapé ao lado do "Acesso da noiva"; exige login; painel verde/vermelho', async () => {
  const { context } = await launch({ viewport: { width: 390, height: 844 } });
  const page = await openSite(context);
  shared.portariaPage = page;

  const links = await page.locator('.footer__links .footer__login-link').allTextContents();
  assert.deepEqual(links.map((t) => t.trim()), ['Acesso da noiva', 'Portaria']);

  await page.click('#footerPortariaBtn');
  assert.equal(await page.locator('#loginModal.is-open').count(), 1, 'sem login, pede a senha');
  assert.equal(await page.locator('#portaria.is-open').count(), 0, 'a portaria não abre sem login');

  await page.fill('#loginEmail', BRIDE.email);
  await page.fill('#loginPassword', 'senha-errada');
  await page.click('#loginForm button[type="submit"]');
  await page.waitForFunction(() => document.getElementById('loginFeedback').textContent.length > 0);
  assert.equal(await page.locator('#portaria.is-open').count(), 0, 'senha errada não abre a portaria');

  await page.fill('#loginPassword', BRIDE.password);
  await page.click('#loginForm button[type="submit"]');
  await page.waitForSelector('#portaria.is-open');
  assert.equal(await page.locator('#loginModal.is-open').count(), 0);

  // Confirmados = Maria e José (o João excluiu a resposta). Ninguém entrou ainda.
  await poll(() => page.locator('#portariaPendingCount').textContent(), (v) => v === '2', { what: 'contador vermelho = 2' });
  assert.equal(await page.locator('#portariaInCount').textContent(), '0');

  const colors = await page.evaluate(() => ({
    inBg: getComputedStyle(document.querySelector('.portaria__stat--in')).backgroundColor,
    outBg: getComputedStyle(document.querySelector('.portaria__stat--out')).backgroundColor,
  }));
  assert.equal(colors.inBg, 'rgb(46, 125, 50)', 'quem já entrou: verde');
  assert.equal(colors.outBg, 'rgb(198, 40, 40)', 'quem falta chegar: vermelho');

  const rows = await page.locator('#portariaList .admin__item').allTextContents();
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.includes('Aguardando')));
  assert.equal(await page.locator('#portariaScanBtn').textContent(), '📷 Ler QR code');
  await shot(page, 'portaria-inicial');

  // busca na lista da portaria
  await page.fill('#portariaSearch', 'jose');
  assert.equal(await page.locator('#portariaList .admin__item').count(), 1);
  await page.fill('#portariaSearch', '');
});

test('8-10. Ler QR code: câmera abre, lê o QR e marca o convidado como Presente', async () => {
  const result = await scanInPortaria(GuestUtils.buildQrPayload(shared.maria.name, shared.maria.id), 'valido');
  assert.match(result.className, /portaria__result--ok/);
  assert.equal(result.title, 'Entrada liberada ✔');
  assert.equal(result.text, 'Maria Silva está presente.');

  const rsvp = await adminRead('rsvps/maria');
  assert.equal(rsvp.checkedIn, true);
  assert.ok(rsvp.checkedInAt, 'guarda o horário da entrada');
  assert.equal((await adminRead('rsvps/jose')).checkedIn, false, 'os outros seguem aguardando');
});

test('12. Um QR code só pode ser lido uma vez', async () => {
  const result = await scanInPortaria(GuestUtils.buildQrPayload(shared.maria.name, shared.maria.id), 'repetido');
  assert.match(result.className, /portaria__result--warn/);
  assert.equal(result.title, 'QR code já utilizado');
  assert.match(result.text, /Maria Silva já entrou às \d{2}:\d{2}/);
});

test('10-11. QR de quem não está na lista de confirmados é recusado com aviso', async () => {
  const cases = [
    ['id inventado, nome real', GuestUtils.buildQrPayload('José Antônio da Conceição', '00000000-0000-4000-8000-000000000000'), 'falso-id'],
    ['id de outro convidado com nome trocado', GuestUtils.buildQrPayload('Maria Silva', shared.jose.id), 'nome-trocado'],
    ['pessoa que nunca foi convidada', GuestUtils.buildQrPayload('Penetra da Silva', '11111111-1111-4111-8111-111111111111'), 'penetra'],
    ['convidado que respondeu "não" (resposta excluída)', GuestUtils.buildQrPayload('João Souza', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'joao'],
  ];
  for (const [label, payload, tag] of cases) {
    const result = await scanInPortaria(payload, tag);
    assert.match(result.className, /portaria__result--error/, label);
    assert.equal(result.title, 'Pessoa não está na lista', label);
    assert.match(result.text, /não consta na lista de convidados confirmados/, label);
  }
  // Nenhuma dessas tentativas marcou entrada em ninguém.
  assert.equal((await adminRead('rsvps/jose')).checkedIn, false);
});

test('11. QR que não é do convite (ex.: um link qualquer) é recusado como inválido', async () => {
  const result = await scanInPortaria('https://exemplo.com/promo', 'invalido');
  assert.match(result.className, /portaria__result--error/);
  assert.equal(result.title, 'QR code inválido');
});

test('7, 9. O painel da portaria atualiza ao vivo: 1 dentro (verde), 1 faltando (vermelho), lista com "Presente"', async () => {
  const page = shared.portariaPage; // aberta desde antes das leituras
  await poll(() => page.locator('#portariaInCount').textContent(), (v) => v === '1', { what: 'contador verde = 1' });
  assert.equal(await page.locator('#portariaPendingCount').textContent(), '1');

  const maria = page.locator('#portariaList .admin__item', { hasText: 'Maria Silva' });
  assert.match(await maria.textContent(), /Presente · \d{2}:\d{2}/);
  assert.match(await page.locator('#portariaList .admin__item', { hasText: 'José' }).textContent(), /Aguardando/);
  await shot(page, 'portaria-depois');
});

test('12. Duas leituras simultâneas do mesmo QR: só uma entra (transação)', async () => {
  const page = shared.portariaPage;
  const text = GuestUtils.buildQrPayload(shared.jose.name, shared.jose.id);
  const statuses = await page.evaluate(async (payload) => {
    const outcomes = await Promise.all([checkInFromQr(payload), checkInFromQr(payload), checkInFromQr(payload)]);
    return outcomes.map((o) => o.status).sort();
  }, text);
  assert.deepEqual(statuses, ['already-used', 'already-used', 'ok']);

  await poll(() => page.locator('#portariaInCount').textContent(), (v) => v === '2', { what: 'contador verde = 2' });
  assert.equal(await page.locator('#portariaPendingCount').textContent(), '0');
});

// ---------------------------------------------------------------- câmera com problema

test('Portaria: sem câmera no aparelho, mostra o aviso e não trava a tela', async () => {
  const { browser, context } = await launch({ viewport: { width: 390, height: 844 } });
  const page = await openSite(context);
  await page.click('#footerPortariaBtn');
  await loginViaModal(page);
  await page.waitForSelector('#portaria.is-open');
  await page.click('#portariaScanBtn');
  await page.waitForSelector('#portariaResult:not(.is-hidden)');
  assert.match(await page.locator('#portariaResultTitle').textContent(), /Não foi possível abrir a câmera|Câmera indisponível/);
  assert.equal(await page.locator('#scanner.is-open').count(), 0, 'o leitor fecha sozinho');
  await browser.close();
});

test('Portaria: "Cancelar" e Esc desligam a câmera', async () => {
  const video = writeQrVideo(null, 'cancelar.y4m');
  const { browser, context } = await launch({ fakeCameraFile: video, viewport: { width: 390, height: 844 } });
  const page = await openSite(context);
  await page.click('#footerPortariaBtn');
  await loginViaModal(page);
  await page.waitForSelector('#portaria.is-open');

  const cameraOn = () => page.evaluate(() => Boolean(document.getElementById('scannerVideo').srcObject));
  await page.click('#portariaScanBtn');
  await page.waitForSelector('#scanner.is-open');
  await poll(cameraOn, (on) => on === true, { what: 'câmera ligar' });
  await shot(page, 'scanner-aberto');
  await page.click('#scannerCancel');
  assert.equal(await page.locator('#scanner.is-open').count(), 0);
  assert.equal(await cameraOn(), false, 'cancelar solta a câmera');

  await page.click('#portariaScanBtn');
  await page.waitForSelector('#scanner.is-open');
  await page.keyboard.press('Escape');
  await poll(cameraOn, (on) => on === false, { what: 'câmera desligar com Esc' });
  await browser.close();
});

test('Sair da conta fecha a portaria e desliga tudo', async () => {
  const page = shared.portariaPage;
  assert.equal(await page.locator('#portaria.is-open').count(), 1, 'a portaria está aberta (cobre o rodapé)');
  await page.evaluate(() => auth.signOut());
  await page.waitForFunction(() => document.getElementById('footerLoginBtn').textContent.trim() === 'Acesso da noiva');
  await page.waitForFunction(() => !document.getElementById('portaria').classList.contains('is-open'));
  assert.equal(await page.locator('#portariaList .admin__item').count(), 0, 'lista da portaria some ao sair');
});

test('Nenhum erro de JavaScript apareceu nas páginas durante todos os testes', () => {
  assert.deepEqual(pageErrors, []);
});
