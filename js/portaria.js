// PORTARIA — leitura dos QR codes no dia do casamento.
// Carregado depois de js/main.js: usa `auth`, `db`, `openPage`, `closePage`,
// `openLoginModal`, `escapeHtml` e `wrapUppercaseS` de lá, além de
// GuestUtils (js/guest-utils.js) e jsQR (js/vendor/jsQR.js).
//
// Só quem está logado (a mesma conta da noiva) usa esta página: as regras do
// Firestore só deixam ler as confirmações e marcar entrada com autenticação.

const portariaSection = document.getElementById('portaria');
const portariaInCount = document.getElementById('portariaInCount');
const portariaPendingCount = document.getElementById('portariaPendingCount');
const portariaScanBtn = document.getElementById('portariaScanBtn');
const portariaResult = document.getElementById('portariaResult');
const portariaResultTitle = document.getElementById('portariaResultTitle');
const portariaResultText = document.getElementById('portariaResultText');
const portariaSearch = document.getElementById('portariaSearch');
const portariaEmpty = document.getElementById('portariaEmpty');
const portariaList = document.getElementById('portariaList');
const portariaSignOutBtn = document.getElementById('portariaSignOutBtn');
const footerPortariaBtn = document.getElementById('footerPortariaBtn');

const scannerEl = document.getElementById('scanner');
const scannerVideo = document.getElementById('scannerVideo');
const scannerHint = document.getElementById('scannerHint');
const scannerCancel = document.getElementById('scannerCancel');

const SCAN_INTERVAL_MS = 120; // 8 leituras por segundo bastam e poupam bateria
const SCAN_MAX_WIDTH = 640; // reduz o quadro antes de decodificar (mais rápido)
const SCAN_HINT_DEFAULT = 'Aponte a câmera para o QR code do convidado';

let unsubscribePortaria = null;
let portariaCache = []; // convidados confirmados (presenca "sim" com QR): [{ id, nome, checkedIn, checkedInAt }]
let scannerStream = null;
let scannerTimer = null;

// ------------------------------------------------------------------
// VALIDAÇÃO + MARCAÇÃO DE ENTRADA
// Devolve { status, name?, at? } com status:
//   'ok'           — entrada registrada agora
//   'already-used' — esse QR já foi lido antes
//   'not-listed'   — nome/id não batem com nenhum convidado confirmado
//   'invalid'      — o QR não é de um convite deste casamento
// ------------------------------------------------------------------
async function checkInFromQr(text) {
  const payload = GuestUtils.parseQrPayload(text);
  if (!payload) return { status: 'invalid' };

  const matches = await db.collection('rsvps').where('qrId', '==', payload.id).limit(1).get();
  if (matches.empty) return { status: 'not-listed', name: payload.name };

  const rsvpRef = matches.docs[0].ref;
  // Transação: se dois celulares lerem o mesmo QR ao mesmo tempo, só um
  // consegue registrar a entrada; o outro recebe "já utilizado".
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(rsvpRef);
    const rsvp = snap.exists ? snap.data() : null;
    const isConfirmed = rsvp
      && rsvp.presenca === 'sim'
      && rsvp.qrId === payload.id
      && String(rsvp.nome).normalize('NFC').trim() === payload.name;
    if (!isConfirmed) return { status: 'not-listed', name: payload.name };
    if (rsvp.checkedIn) return { status: 'already-used', name: rsvp.nome, at: rsvp.checkedInAt };

    transaction.update(rsvpRef, {
      checkedIn: true,
      checkedInAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return { status: 'ok', name: rsvp.nome };
  });
}

function formatTime(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== 'function') return '';
  return timestamp.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function showPortariaResult(kind, title, text) {
  portariaResult.className = `portaria__result portaria__result--${kind}`;
  portariaResultTitle.textContent = title;
  portariaResultText.textContent = text;
  wrapUppercaseS(portariaResult);
}

function showScanOutcome(outcome) {
  switch (outcome.status) {
    case 'ok':
      showPortariaResult('ok', 'Entrada liberada ✔', `${outcome.name} está presente.`);
      break;
    case 'already-used': {
      const time = formatTime(outcome.at);
      showPortariaResult(
        'warn',
        'QR code já utilizado',
        `${outcome.name} já entrou${time ? ` às ${time}` : ''}. Este QR code não vale mais.`
      );
      break;
    }
    case 'not-listed':
      showPortariaResult(
        'error',
        'Pessoa não está na lista',
        `${outcome.name} não consta na lista de convidados confirmados.`
      );
      break;
    default:
      showPortariaResult('error', 'QR code inválido', 'Esse QR code não é de um convite deste casamento.');
  }
}

async function handleScannedText(text) {
  try {
    showScanOutcome(await checkInFromQr(text));
  } catch (err) {
    console.error('Não foi possível validar o QR code.', err);
    showPortariaResult('error', 'Não foi possível validar', 'Verifique a conexão com a internet e leia o QR code de novo.');
  }
}

// ------------------------------------------------------------------
// CÂMERA / LEITOR DE QR CODE
// ------------------------------------------------------------------
const scanCanvas = document.createElement('canvas');
const scanContext = scanCanvas.getContext('2d', { willReadFrequently: true });

function decodeVideoFrame() {
  if (scannerVideo.readyState < scannerVideo.HAVE_ENOUGH_DATA || !scannerVideo.videoWidth) return null;
  const scale = Math.min(1, SCAN_MAX_WIDTH / scannerVideo.videoWidth);
  scanCanvas.width = Math.round(scannerVideo.videoWidth * scale);
  scanCanvas.height = Math.round(scannerVideo.videoHeight * scale);
  scanContext.drawImage(scannerVideo, 0, 0, scanCanvas.width, scanCanvas.height);
  const frame = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
  const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
  return code && code.data ? code.data : null;
}

function scanLoop() {
  const text = decodeVideoFrame();
  if (text) {
    stopScanner();
    handleScannedText(text);
    return;
  }
  scannerTimer = setTimeout(scanLoop, SCAN_INTERVAL_MS);
}

function stopScanner() {
  clearTimeout(scannerTimer);
  scannerTimer = null;
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
  }
  scannerVideo.srcObject = null;
  scannerEl.classList.remove('is-open');
  scannerEl.setAttribute('aria-hidden', 'true');
}

async function startScanner() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showPortariaResult('error', 'Câmera indisponível', 'Este navegador não permite usar a câmera. Abra o site em HTTPS no Chrome ou Safari.');
    return;
  }

  portariaResult.className = 'portaria__result is-hidden';
  scannerHint.textContent = SCAN_HINT_DEFAULT;
  scannerEl.classList.add('is-open');
  scannerEl.setAttribute('aria-hidden', 'false');

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    // O leitor foi cancelado enquanto o navegador pedia a permissão.
    if (!scannerEl.classList.contains('is-open')) {
      scannerStream.getTracks().forEach((track) => track.stop());
      scannerStream = null;
      return;
    }
    scannerVideo.srcObject = scannerStream;
    await scannerVideo.play();
    scanLoop();
  } catch (err) {
    stopScanner();
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    showPortariaResult(
      'error',
      'Não foi possível abrir a câmera',
      denied
        ? 'Permita o uso da câmera nas configurações do navegador e tente de novo.'
        : 'Nenhuma câmera disponível neste aparelho.'
    );
  }
}

portariaScanBtn.addEventListener('click', startScanner);
scannerCancel.addEventListener('click', stopScanner);

// ------------------------------------------------------------------
// PAINEL (contadores + lista de confirmados, em tempo real)
// ------------------------------------------------------------------
function renderPortaria() {
  const checkedIn = portariaCache.filter((guest) => guest.checkedIn).length;
  portariaInCount.textContent = checkedIn;
  portariaPendingCount.textContent = portariaCache.length - checkedIn;

  const matches = portariaCache.filter((guest) => GuestUtils.matchesSearch(guest.nome, portariaSearch.value));
  portariaEmpty.textContent = portariaCache.length === 0
    ? 'Nenhum convidado confirmado ainda.'
    : 'Nenhum convidado encontrado.';
  portariaEmpty.classList.toggle('is-hidden', matches.length > 0);

  portariaList.innerHTML = '';
  matches.forEach((guest) => {
    const item = document.createElement('div');
    item.className = 'admin__item portaria__item';
    const time = guest.checkedIn ? formatTime(guest.checkedInAt) : '';
    item.innerHTML = `
      <p class="admin__item-title">${escapeHtml(guest.nome)}</p>
      <span class="portaria__badge ${guest.checkedIn ? 'portaria__badge--in' : 'portaria__badge--out'}">
        ${guest.checkedIn ? `Presente${time ? ` · ${time}` : ''}` : 'Aguardando'}
      </span>
    `;
    portariaList.appendChild(item);
  });
  wrapUppercaseS(portariaList);
}

function startPortariaListener() {
  if (unsubscribePortaria) return;
  // Confirmados = respondeu "sim" e tem QR code (respostas antigas, sem QR,
  // não entram: não há o que ler).
  unsubscribePortaria = db.collection('rsvps').where('presenca', '==', 'sim').onSnapshot(
    (snapshot) => {
      portariaCache = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((rsvp) => rsvp.qrId)
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
      renderPortaria();
    },
    (err) => console.error('Não foi possível carregar os convidados confirmados.', err)
  );
}

function stopPortariaListener() {
  if (unsubscribePortaria) unsubscribePortaria();
  unsubscribePortaria = null;
  portariaCache = [];
  portariaSearch.value = '';
  portariaResult.className = 'portaria__result is-hidden';
  renderPortaria();
}

portariaSearch.addEventListener('input', renderPortaria);

// ------------------------------------------------------------------
// ACESSO: link do rodapé + estado de login
// ------------------------------------------------------------------
footerPortariaBtn.addEventListener('click', () => {
  if (auth.currentUser) {
    openPage('portaria');
  } else {
    openLoginModal('portaria');
  }
});

// Único jeito de sair da portaria: desloga de verdade (não só fecha a
// página) — enquanto logado, o resto do convite fica escondido (ver
// "body.portaria-open" em css/style.css), então "Sair" precisa mesmo tirar
// o login pra devolver o site normal.
portariaSignOutBtn.addEventListener('click', () => {
  stopScanner();
  auth.signOut();
});

auth.onAuthStateChanged((user) => {
  if (user) {
    startPortariaListener();
  } else {
    stopScanner();
    stopPortariaListener();
    if (portariaSection.classList.contains('is-open')) closePage('portaria');
  }
});

// Escape com a câmera aberta: desliga a câmera.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') stopScanner();
});
