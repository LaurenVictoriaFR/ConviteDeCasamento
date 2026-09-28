// Testes das funções puras e da geração de QR/PDF (rodam em Node, sem Firebase).
// Uso: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'js');

// Carrega os scripts "clássicos" do site num contexto isolado, na mesma ordem
// do index.html, como o navegador faria.
function loadSiteScripts() {
  const sandbox = {
    console, TextEncoder, TextDecoder, Uint8Array, Uint8ClampedArray,
    crypto: globalThis.crypto, atob, btoa,
    navigator: { userAgent: 'node' }, // o jsPDF consulta o navegador ao carregar
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ['vendor/qrcode.js', 'vendor/qrcode_UTF8.js', 'vendor/jspdf.umd.min.js', 'vendor/jsQR.js', 'guest-utils.js', 'qr-pdf.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox;
}

const GuestUtils = require(path.join(root, 'guest-utils.js'));

test('normalizeText ignora acento, caixa e espaços nas pontas', () => {
  assert.equal(GuestUtils.normalizeText('  JOSÉ Antônio  '), 'jose antonio');
  assert.equal(GuestUtils.normalizeText(null), '');
});

test('matchesSearch: busca sem acento, em qualquer ordem, por parte do nome', () => {
  assert.ok(GuestUtils.matchesSearch('José Antônio da Silva', 'jose'));
  assert.ok(GuestUtils.matchesSearch('José Antônio da Silva', 'ANTONIO SILVA'));
  assert.ok(GuestUtils.matchesSearch('José Antônio da Silva', 'silva jose'));
  assert.ok(GuestUtils.matchesSearch('José Antônio da Silva', 'ant'));
  assert.ok(!GuestUtils.matchesSearch('José Antônio da Silva', 'maria'));
  assert.ok(!GuestUtils.matchesSearch('José Antônio da Silva', 'jose maria'));
});

test('matchesSearch: busca vazia (ou só espaços) mostra todo mundo', () => {
  assert.ok(GuestUtils.matchesSearch('Maria', ''));
  assert.ok(GuestUtils.matchesSearch('Maria', '   '));
  assert.ok(GuestUtils.matchesSearch('Maria', undefined));
});

test('generateQrId: UUID v4 válido e sem repetição em 20 mil ids', () => {
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const seen = new Set();
  for (let i = 0; i < 20000; i++) {
    const id = GuestUtils.generateQrId();
    assert.match(id, uuidV4);
    seen.add(id);
  }
  assert.equal(seen.size, 20000);
});

test('QR payload: ida e volta preserva nome com acentos e id', () => {
  const id = GuestUtils.generateQrId();
  const text = GuestUtils.buildQrPayload('José Antônio da Conceição', id);
  assert.deepEqual(GuestUtils.parseQrPayload(text), { name: 'José Antônio da Conceição', id });
});

test('QR payload: nome em NFD (acento decomposto) é normalizado para NFC', () => {
  const nfd = 'José Silva'; // "José" com acento combinante
  const parsed = GuestUtils.parseQrPayload(GuestUtils.buildQrPayload(nfd, 'abc'));
  assert.equal(parsed.name, 'José Silva');
});

test('parseQrPayload rejeita QR que não é do convite', () => {
  for (const text of [
    '', 'olá', 'https://exemplo.com', '{}', '[]', 'null', '42',
    '{"n":"Maria"}', '{"i":"abc"}', '{"n":"","i":"abc"}', '{"n":"Maria","i":""}',
    '{"n":"   ","i":"abc"}', '{"n":1,"i":"abc"}', '{"n":"Maria","i":{"x":1}}', '{"n":',
  ]) {
    assert.equal(GuestUtils.parseQrPayload(text), null, `deveria rejeitar: ${text}`);
  }
});

test('fileNameForGuest gera nome de arquivo seguro', () => {
  assert.equal(GuestUtils.fileNameForGuest('José Antônio da Silva'), 'convite-jose-antonio-da-silva.pdf');
  assert.equal(GuestUtils.fileNameForGuest('!!!'), 'convite-convidado.pdf');
  assert.equal(GuestUtils.fileNameForGuest('../../etc/passwd'), 'convite-etc-passwd.pdf');
});

// Rasteriza os retângulos que o PDF desenha (na ordem, com a cor de
// preenchimento vigente) e devolve uma imagem RGBA para o jsQR ler — prova
// que o QR que vai no PDF é decodificável, não só que "algo foi desenhado".
async function rasterizePdfQr(sandbox, name, qrId) {
  const RealPdf = sandbox.jspdf.jsPDF;
  const calls = [];
  sandbox.jspdf.jsPDF = function (options) {
    const doc = new RealPdf(options);
    let fill = [0, 0, 0];
    const setFillColor = doc.setFillColor.bind(doc);
    const rect = doc.rect.bind(doc);
    doc.setFillColor = (...args) => { fill = args; return setFillColor(...args); };
    doc.rect = (x, y, w, h, style) => { calls.push({ x, y, w, h, style, fill }); return rect(x, y, w, h, style); };
    return doc;
  };
  const doc = await sandbox.QrPdf.createPdf(name, qrId);
  sandbox.jspdf.jsPDF = RealPdf;

  const filled = calls.filter((c) => c.style === 'F');
  const background = filled[0]; // o fundo branco do QR (zona de silêncio)
  const PX_PER_MM = 8;
  const size = Math.round(background.w * PX_PER_MM);
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const c of filled) {
    const gray = c.fill[0];
    const x0 = Math.floor((c.x - background.x) * PX_PER_MM);
    const y0 = Math.floor((c.y - background.y) * PX_PER_MM);
    const x1 = Math.ceil((c.x + c.w - background.x) * PX_PER_MM);
    const y1 = Math.ceil((c.y + c.h - background.y) * PX_PER_MM);
    for (let y = Math.max(0, y0); y < Math.min(size, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x1); x++) {
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
    }
  }
  return { doc, image: { data, width: size, height: size } };
}

test('PDF: A4 de 1 página cujo QR decodifica para nome completo + id único', async () => {
  const sandbox = loadSiteScripts();
  const names = [
    'Maria Silva',
    'José Antônio da Conceição Ñandú',
    'Ana Beatriz de Albuquerque Cavalcanti Nascimento Rodrigues dos Santos Pereira Filha',
  ];
  for (const name of names) {
    const qrId = sandbox.GuestUtils.generateQrId();
    const { doc, image } = await rasterizePdfQr(sandbox, name, qrId);

    const bytes = Buffer.from(doc.output('arraybuffer'));
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal(doc.getNumberOfPages(), 1);

    const code = sandbox.jsQR(image.data, image.width, image.height);
    assert.ok(code, `jsQR não achou o QR do PDF de "${name}"`);
    assert.deepEqual(
      { ...sandbox.GuestUtils.parseQrPayload(code.data) },
      { name: name.normalize('NFC'), id: qrId }
    );
  }
});

test('PDF: nome muito longo não empurra o QR para fora da página', async () => {
  const sandbox = loadSiteScripts();
  const longName = 'Fulano '.repeat(30).trim();
  const { image, doc } = await rasterizePdfQr(sandbox, longName, sandbox.GuestUtils.generateQrId());
  assert.ok(sandbox.jsQR(image.data, image.width, image.height));
  assert.equal(doc.getNumberOfPages(), 1);
});

test('previewDataUrl devolve uma imagem para mostrar na tela', () => {
  const sandbox = loadSiteScripts();
  const url = sandbox.QrPdf.previewDataUrl('Maria Silva', sandbox.GuestUtils.generateQrId());
  assert.match(url, /^data:image\/gif;base64,/);
});
