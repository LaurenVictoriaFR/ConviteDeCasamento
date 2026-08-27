// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const WEDDING_DATE = new Date('2026-12-05T16:30:00');

// Cole aqui o endpoint do Formspree (https://formspree.io) para receber
// as confirmações de presença por e-mail. Enquanto estiver vazio, as
// respostas ficam salvas apenas no navegador (localStorage).
const FORMSPREE_ENDPOINT = '';

// Duração total da animação do envelope: primeiro o selo some por
// completo, só depois o envelope (aba + fundo) começa a desaparecer.
// Em ms — precisa bater com os "delay + duration" das transições em
// style.css (bloco "ENVELOPE INTRO").
const ENVELOPE_ANIMATION_MS = 1700;

const GIFTS = [
  { icon: '🌙', name: 'Cota Lua de Mel' },
  { icon: '🏠', name: 'Cota Casa Nova' },
  { icon: '🍽️', name: 'Cota Enxoval de Cozinha' },
  { icon: '🛋️', name: 'Cota Decoração' },
  { icon: '🛏️', name: 'Cota Enxoval de Cama' },
  { icon: '🧺', name: 'Cota Área de Serviço' },
  { icon: '🍷', name: 'Cota Jantar a Dois' },
  { icon: '🌿', name: 'Cota Jardim' },
  { icon: '📺', name: 'Cota Sala de Estar' },
  { icon: '🧳', name: 'Cota Viagem' },
  { icon: '☕', name: 'Cota Café da Manhã' },
  { icon: '🎁', name: 'Cota Livre' },
];

// ------------------------------------------------------------------
// ENVELOPE INTRO (selo some ao clicar, a aba abre pra cima e o envelope
// inteiro transparece antes de revelar o convite)
// ------------------------------------------------------------------
const envelopeIntro = document.getElementById('envelopeIntro');
const envelopeSeal = document.getElementById('envelopeSeal');

function lockPageScroll(lock) {
  document.body.style.overflow = lock ? 'hidden' : '';
}

function finishEnvelopeIntro() {
  envelopeIntro.classList.add('is-open');
  envelopeIntro.setAttribute('aria-hidden', 'true');
  lockPageScroll(false);
}

function openEnvelope() {
  if (envelopeIntro.classList.contains('is-opening')) return;
  envelopeIntro.classList.add('is-opening');
  envelopeSeal.disabled = true;
  setTimeout(finishEnvelopeIntro, ENVELOPE_ANIMATION_MS);
}

// Sempre mostra o envelope fechado ao carregar/atualizar a página
// (sem lembrar entre visitas), esperando o clique no selo pra abrir.
if (envelopeIntro && envelopeSeal) {
  lockPageScroll(true);
  envelopeSeal.addEventListener('click', openEnvelope);
}

// ------------------------------------------------------------------
// LETRA "S" MAIÚSCULA -> FONTE SLOOP SCRIPT
// A troca só acontece quando o restante da palavra está na fonte
// Shelley Script (o "S" dessa fonte não agrada). Em palavras que usam
// Arima Madurai, The Mumbai Sticker etc. o "S" fica na fonte normal
// do próprio texto, sem nenhuma troca.
// ------------------------------------------------------------------
const S_FLOURISH_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);
const S_FLOURISH_REGEX = /(\bS(?=\p{L}))/gu;
const SHELLEY_SCRIPT_FONT = 'Shelley Script LT Std';

function wrapUppercaseS(root) {
  if (!root) return;
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || !S_FLOURISH_REGEX.test(node.nodeValue)) {
          S_FLOURISH_REGEX.lastIndex = 0;
          return NodeFilter.FILTER_REJECT;
        }
        S_FLOURISH_REGEX.lastIndex = 0;
        const parent = node.parentElement;
        if (!parent || S_FLOURISH_SKIP_TAGS.has(parent.tagName) || parent.closest('.s-flourish')) {
          return NodeFilter.FILTER_REJECT;
        }
        // Só aplica a fonte Sloop Script quando o texto ao redor
        // estiver renderizado em Shelley Script.
        const fontFamily = getComputedStyle(parent).fontFamily;
        if (!fontFamily.includes(SHELLEY_SCRIPT_FONT)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const nodes = [];
  let current;
  while ((current = walker.nextNode())) nodes.push(current);

  nodes.forEach((node) => {
    const frag = document.createDocumentFragment();
    node.nodeValue.split(S_FLOURISH_REGEX).forEach((part) => {
      if (!part) return;
      if (part === 'S') {
        const span = document.createElement('span');
        span.className = 's-flourish';
        span.textContent = 'S';
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    node.parentNode.replaceChild(frag, node);
  });
}

// ------------------------------------------------------------------
// COUNTDOWN
// ------------------------------------------------------------------
function updateCountdown() {
  const now = new Date();
  const diff = WEDDING_DATE - now;

  const els = {
    days: document.getElementById('days'),
    hours: document.getElementById('hours'),
    minutes: document.getElementById('minutes'),
    seconds: document.getElementById('seconds'),
  };

  if (diff <= 0) {
    Object.values(els).forEach((el) => (el.textContent = '00'));
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  els.days.textContent = String(days).padStart(2, '0');
  els.hours.textContent = String(hours).padStart(2, '0');
  els.minutes.textContent = String(minutes).padStart(2, '0');
  els.seconds.textContent = String(seconds).padStart(2, '0');
}

updateCountdown();
setInterval(updateCountdown, 1000);

// ------------------------------------------------------------------
// MENU FLUTUANTE (FAB) + PÁGINAS EM ABA (Presentes / Confirmar Presença)
// ------------------------------------------------------------------
const fab = document.getElementById('fab');
const fabToggle = document.getElementById('fabToggle');
const fabMenu = document.getElementById('fabMenu');
const pageOverlays = document.querySelectorAll('.page-overlay');

function toggleFabMenu(forceOpen) {
  const shouldOpen = forceOpen !== undefined ? forceOpen : !fabMenu.classList.contains('is-open');
  fabMenu.classList.toggle('is-open', shouldOpen);
  fabToggle.setAttribute('aria-expanded', String(shouldOpen));
}

fabToggle.addEventListener('click', () => toggleFabMenu());

document.addEventListener('click', (e) => {
  if (!fab.contains(e.target)) toggleFabMenu(false);
});

function openPage(id) {
  const page = document.getElementById(id);
  if (!page) return;
  page.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closePage(id) {
  const page = document.getElementById(id);
  if (!page) return;
  page.classList.remove('is-open');
  const anyOpen = Array.from(pageOverlays).some((p) => p.classList.contains('is-open'));
  if (!anyOpen) document.body.style.overflow = '';
}

document.querySelectorAll('[data-open-page]').forEach((btn) => {
  btn.addEventListener('click', () => {
    openPage(btn.dataset.openPage);
    toggleFabMenu(false);
  });
});

document.querySelectorAll('[data-close-page]').forEach((btn) => {
  btn.addEventListener('click', () => closePage(btn.dataset.closePage));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    pageOverlays.forEach((p) => closePage(p.id));
    toggleFabMenu(false);
  }
});

// ------------------------------------------------------------------
// GIFTS
// ------------------------------------------------------------------
const giftsGrid = document.getElementById('giftsGrid');
const givenGifts = JSON.parse(localStorage.getItem('givenGifts') || '[]');

function renderGifts() {
  giftsGrid.innerHTML = '';
  GIFTS.forEach((gift, index) => {
    const isGiven = givenGifts.includes(index);
    const card = document.createElement('div');
    card.className = 'gift-card' + (isGiven ? ' is-given' : '');
    card.innerHTML = `
      <div class="gift-card__icon">${gift.icon}</div>
      <h3>${gift.name}</h3>
      <p class="gift-card__value">R$ 100,00</p>
      <button class="gift-card__btn" data-index="${index}" ${isGiven ? 'disabled' : ''}>
        ${isGiven ? 'Presenteado ✓' : 'Presentear'}
      </button>
    `;
    wrapUppercaseS(card);
    giftsGrid.appendChild(card);
  });
}

renderGifts();

giftsGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.gift-card__btn');
  if (!btn || btn.disabled) return;
  const index = Number(btn.dataset.index);
  openGiftModal(index);
});

// ------------------------------------------------------------------
// GIFT MODAL
// ------------------------------------------------------------------
const giftModal = document.getElementById('giftModal');
const modalClose = document.getElementById('modalClose');
const modalGiftTitle = document.getElementById('modalGiftTitle');
const modalMarkGiven = document.getElementById('modalMarkGiven');
let currentGiftIndex = null;

function openGiftModal(index) {
  currentGiftIndex = index;
  modalGiftTitle.textContent = GIFTS[index].name;
  wrapUppercaseS(modalGiftTitle);
  giftModal.classList.add('is-open');
}

function closeGiftModal() {
  giftModal.classList.remove('is-open');
  currentGiftIndex = null;
}

modalClose.addEventListener('click', closeGiftModal);
giftModal.addEventListener('click', (e) => {
  if (e.target === giftModal) closeGiftModal();
});

modalMarkGiven.addEventListener('click', () => {
  if (currentGiftIndex === null) return;
  if (!givenGifts.includes(currentGiftIndex)) {
    givenGifts.push(currentGiftIndex);
    localStorage.setItem('givenGifts', JSON.stringify(givenGifts));
    renderGifts();
  }
  closeGiftModal();
});

// ------------------------------------------------------------------
// RSVP FORM
// ------------------------------------------------------------------
const rsvpForm = document.getElementById('rsvpForm');
const formFeedback = document.getElementById('formFeedback');

rsvpForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(rsvpForm);
  const payload = Object.fromEntries(formData.entries());
  payload.data = new Date().toISOString();

  if (FORMSPREE_ENDPOINT) {
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      if (!res.ok) throw new Error('Falha no envio');
      showFeedback('Presença confirmada! Obrigado por avisar. 💛');
      rsvpForm.reset();
      return;
    } catch (err) {
      showFeedback('Não foi possível enviar agora. Tente novamente em instantes.');
      return;
    }
  }

  // Fallback: guarda localmente enquanto o Formspree não é configurado
  const confirmations = JSON.parse(localStorage.getItem('rsvpConfirmations') || '[]');
  confirmations.push(payload);
  localStorage.setItem('rsvpConfirmations', JSON.stringify(confirmations));
  showFeedback('Presença confirmada! Obrigado por avisar. 💛');
  rsvpForm.reset();
});

function showFeedback(message) {
  formFeedback.textContent = message;
  wrapUppercaseS(formFeedback);
  setTimeout(() => (formFeedback.textContent = ''), 6000);
}

// ------------------------------------------------------------------
// Varre a página inteira; a própria função filtra e só troca o "S"
// nos trechos que estiverem em Shelley Script (ver comentário acima).
// ------------------------------------------------------------------
wrapUppercaseS(document.body);
