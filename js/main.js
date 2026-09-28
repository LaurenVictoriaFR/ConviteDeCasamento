// `auth` e `db` vêm de js/firebase-init.js (carregado antes deste arquivo
// em index.html). Usamos o SDK "compat" do Firebase (scripts clássicos)
// em vez do modular, para o site continuar abrindo direto com duplo
// clique no index.html — módulos ES são bloqueados pelo navegador quando
// carregados de um arquivo local (file://).

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const WEDDING_DATE = new Date('2026-12-05T16:30:00');

// Duração total da animação do envelope: primeiro o selo some por
// completo, só depois o envelope (aba + fundo) começa a desaparecer.
// Em ms — precisa bater com os "delay + duration" das transições em
// style.css (bloco "ENVELOPE INTRO").
const ENVELOPE_ANIMATION_MS = 1700;

// Volume inicial da música de fundo (0 a 1) ao abrir o convite.
const DEFAULT_MUSIC_VOLUME = 0.3;

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
  // Chamado de dentro do clique no selo: precisa ser síncrono aqui para
  // contar como gesto do usuário e não ser bloqueado pela política de
  // autoplay do navegador.
  if (bgAudio) {
    bgAudio.volume = DEFAULT_MUSIC_VOLUME;
    bgAudio.play().catch(() => {});
  }
  setTimeout(finishEnvelopeIntro, ENVELOPE_ANIMATION_MS);
}

// Sempre mostra o envelope fechado ao carregar/atualizar a página
// (sem lembrar entre visitas), esperando o clique no selo pra abrir.
if (envelopeIntro && envelopeSeal) {
  lockPageScroll(true);
  envelopeSeal.addEventListener('click', openEnvelope);
}

// ------------------------------------------------------------------
// MÚSICA DE FUNDO (disco flutuante: toca ao abrir o envelope; clicar
// no disco abre um painel com play/pause e controle de volume)
// ------------------------------------------------------------------
const bgAudio = document.getElementById('bgAudio');
const musicDiscBtn = document.getElementById('musicDiscBtn');
const musicPanel = document.getElementById('musicPanel');
const musicToggleBtn = document.getElementById('musicToggleBtn');
const musicVolume = document.getElementById('musicVolume');

if (bgAudio && musicDiscBtn && musicPanel && musicToggleBtn && musicVolume) {
  bgAudio.volume = DEFAULT_MUSIC_VOLUME;
  musicVolume.value = String(Math.round(DEFAULT_MUSIC_VOLUME * 100));

  musicDiscBtn.addEventListener('click', () => {
    const isOpen = musicPanel.classList.toggle('is-open');
    musicPanel.classList.toggle('is-hidden', !isOpen);
    musicDiscBtn.setAttribute('aria-expanded', String(isOpen));
  });

  musicToggleBtn.addEventListener('click', () => {
    if (bgAudio.paused) {
      bgAudio.play().catch(() => {});
    } else {
      bgAudio.pause();
    }
  });

  musicVolume.addEventListener('input', () => {
    bgAudio.volume = Number(musicVolume.value) / 100;
  });

  bgAudio.addEventListener('play', () => {
    musicDiscBtn.classList.add('is-playing');
    musicToggleBtn.innerHTML = '&#9208;';
    musicToggleBtn.setAttribute('aria-label', 'Pausar música');
  });

  bgAudio.addEventListener('pause', () => {
    musicDiscBtn.classList.remove('is-playing');
    musicToggleBtn.innerHTML = '&#9654;';
    musicToggleBtn.setAttribute('aria-label', 'Tocar música');
  });
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
// MENU DO SITE (PC: fixo no header · Celular: fixo embaixo) + PÁGINAS
// EM ABA (Presentes / Confirmar Presença / Painel)
// ------------------------------------------------------------------
const siteMenuAdminItem = document.getElementById('siteMenuAdminItem');
const pageOverlays = document.querySelectorAll('.page-overlay');

function openPage(id) {
  const page = document.getElementById(id);
  if (!page) return;
  // Só uma página em aba fica aberta por vez: navegar pelo menu fixo direto
  // de uma pra outra (sem passar por "Voltar") fechava a anterior só por
  // fora, mas ela continuava "is-open" por baixo, bloqueando a nova.
  pageOverlays.forEach((p) => { if (p.id !== id) p.classList.remove('is-open'); });
  page.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  // Na portaria, some com os botões de Presentes/Confirmar Presença do
  // menu fixo: não fazem sentido pra quem está recebendo os convidados.
  document.body.classList.toggle('portaria-open', id === 'portaria');
}

function closePage(id) {
  const page = document.getElementById(id);
  if (!page) return;
  page.classList.remove('is-open');
  const anyOpen = Array.from(pageOverlays).some((p) => p.classList.contains('is-open'));
  if (!anyOpen) document.body.style.overflow = '';
  if (id === 'portaria') document.body.classList.remove('portaria-open');
}

document.querySelectorAll('[data-open-page]').forEach((btn) => {
  btn.addEventListener('click', () => {
    openPage(btn.dataset.openPage);
  });
});

document.querySelectorAll('[data-close-page]').forEach((btn) => {
  btn.addEventListener('click', () => closePage(btn.dataset.closePage));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    pageOverlays.forEach((p) => closePage(p.id));
    closeGiftModal();
    closeLoginModal();
  }
});

// ------------------------------------------------------------------
// LOGIN DA NOIVA (Firebase Authentication — só login, sem cadastro)
// ------------------------------------------------------------------
const loginModal = document.getElementById('loginModal');
const loginModalClose = document.getElementById('loginModalClose');
const loginModalTitle = document.getElementById('loginModalTitle');
const loginForm = document.getElementById('loginForm');
const loginEmailInput = document.getElementById('loginEmail');
const loginEmailLabel = document.getElementById('loginEmailLabel');
const loginPasswordInput = document.getElementById('loginPassword');
const loginPasswordToggle = document.getElementById('loginPasswordToggle');
const loginRemember = document.getElementById('loginRemember');
const loginFeedback = document.getElementById('loginFeedback');
const footerLoginBtn = document.getElementById('footerLoginBtn');

loginPasswordToggle.addEventListener('click', () => {
  const showing = loginPasswordInput.type === 'text';
  loginPasswordInput.type = showing ? 'password' : 'text';
  loginPasswordToggle.textContent = showing ? '👁' : '🙈';
  loginPasswordToggle.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
});

// Domínio interno usado para a conta da portaria: a interface pede só um
// "usuário" e aqui vira um e-mail fake (ex.: "recepcao" -> este domínio),
// porque o Firebase Auth só faz login com e-mail/senha. As regras do
// Firestore reconhecem esse domínio para dar acesso restrito (ver
// firestore.rules). A conta precisa existir com esse e-mail no Console.
// (".local" foi tentado antes, mas o Console do Firebase rejeita esse TLD
// na validação do formulário de usuário — ".app" passa normalmente.)
const PORTARIA_EMAIL_DOMAIN = '@portaria.app';

// Página a abrir logo depois do login (ex.: "portaria", quando o login foi
// pedido pelo link do rodapé). Zerada sempre que o modal fecha.
let pendingPageAfterLogin = null;

function openLoginModal(nextPage = null) {
  loginFeedback.textContent = '';
  pendingPageAfterLogin = nextPage;
  const isPortariaLogin = nextPage === 'portaria';
  loginModalTitle.textContent = isPortariaLogin ? 'Acesso da portaria' : 'Acesso restrito';
  loginEmailLabel.textContent = isPortariaLogin ? 'Usuário' : 'E-mail';
  loginEmailInput.autocomplete = isPortariaLogin ? 'off' : 'username';
  loginModal.classList.add('is-open');
}

function closeLoginModal() {
  loginModal.classList.remove('is-open');
  loginForm.reset();
  loginPasswordInput.type = 'password';
  loginPasswordToggle.textContent = '👁';
  loginPasswordToggle.setAttribute('aria-label', 'Mostrar senha');
  pendingPageAfterLogin = null;
}

footerLoginBtn.addEventListener('click', () => {
  if (auth.currentUser) {
    auth.signOut();
  } else {
    openLoginModal();
  }
});

loginModalClose.addEventListener('click', closeLoginModal);
loginModal.addEventListener('click', (e) => {
  if (e.target === loginModal) closeLoginModal();
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nextPage = pendingPageAfterLogin;
  const rawInput = loginEmailInput.value.trim();
  const email = nextPage === 'portaria' && !rawInput.includes('@')
    ? `${rawInput}${PORTARIA_EMAIL_DOMAIN}`
    : rawInput;
  const password = loginPasswordInput.value;

  try {
    await auth.setPersistence(
      loginRemember.checked ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION
    );
    await auth.signInWithEmailAndPassword(email, password);
    closeLoginModal();
    if (nextPage) openPage(nextPage);
  } catch (err) {
    loginFeedback.textContent = nextPage === 'portaria' ? 'Usuário ou senha inválidos.' : 'E-mail ou senha inválidos.';
    wrapUppercaseS(loginFeedback);
  }
});

// A conta da portaria (e-mail terminado em @portaria.app) não deve ver o
// painel da noiva (lá as regras do Firestore bloqueiam criar/apagar
// convidados e presentes, mas exibir os botões seria confuso).
function isNoivaAccount(user) {
  return !!user && !user.email.endsWith(PORTARIA_EMAIL_DOMAIN);
}

// Liga/desliga a interface da noiva conforme o estado de autenticação.
// "Sair" só aparece no lugar de "Acesso da noiva" quando é mesmo a conta da
// noiva logada — logada como portaria, esse botão continua "Acesso da
// noiva" (a portaria tem seu próprio jeito de sair, dentro da tela dela).
auth.onAuthStateChanged((user) => {
  const isNoiva = isNoivaAccount(user);
  footerLoginBtn.textContent = isNoiva ? 'Sair' : 'Acesso da noiva';
  siteMenuAdminItem.classList.toggle('is-hidden', !isNoiva);

  if (!isNoiva && document.getElementById('painel').classList.contains('is-open')) {
    closePage('painel');
  }

  if (isNoiva) {
    startAdminListeners();
  } else {
    stopAdminListeners();
  }
});

// ------------------------------------------------------------------
// GIFTS (lista de presentes pública — Firestore em tempo real)
// ------------------------------------------------------------------
const giftsGrid = document.getElementById('giftsGrid');
const giftsEmpty = document.getElementById('giftsEmpty');
const giftsCollection = db.collection('gifts');

const availableGiftsQuery = giftsCollection.where('claimedBy', '==', null);

availableGiftsQuery.onSnapshot((snapshot) => {
  giftsGrid.innerHTML = '';

  if (snapshot.empty) {
    giftsEmpty.classList.remove('is-hidden');
  } else {
    giftsEmpty.classList.add('is-hidden');
  }

  snapshot.forEach((docSnap) => {
    const gift = docSnap.data();
    const card = document.createElement('div');
    card.className = 'gift-card';
    const media = gift.image
      ? `<img class="gift-card__image" src="${gift.image}" alt="Foto do presente ${escapeHtml(gift.name)}" />`
      : `<div class="gift-card__icon">🎁</div>`;
    card.innerHTML = `
      ${media}
      <h3>${escapeHtml(gift.name)}</h3>
      ${gift.description ? `<p class="gift-card__description">${escapeHtml(gift.description)}</p>` : ''}
      <button class="gift-card__btn" data-id="${docSnap.id}">Escolher esse presente</button>
    `;
    wrapUppercaseS(card);
    giftsGrid.appendChild(card);
  });
}, (err) => {
  console.error('Não foi possível carregar a lista de presentes.', err);
});

giftsGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.gift-card__btn');
  if (!btn) return;
  const title = btn.closest('.gift-card').querySelector('h3').textContent;
  const description = btn.closest('.gift-card').querySelector('.gift-card__description');
  openGiftModal(btn.dataset.id, title, description ? description.textContent : '');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ------------------------------------------------------------------
// GIFT MODAL (convidado escolhe um presente informando o nome completo)
// ------------------------------------------------------------------
const giftModal = document.getElementById('giftModal');
const modalClose = document.getElementById('modalClose');
const modalGiftTitle = document.getElementById('modalGiftTitle');
const modalGiftDescription = document.getElementById('modalGiftDescription');
const giftClaimForm = document.getElementById('giftClaimForm');
const giftClaimFeedback = document.getElementById('giftClaimFeedback');
let currentGiftId = null;

function openGiftModal(giftId, title, description) {
  currentGiftId = giftId;
  modalGiftTitle.textContent = title;
  modalGiftDescription.textContent = description || '';
  giftClaimFeedback.textContent = '';
  giftClaimForm.reset();
  wrapUppercaseS(modalGiftTitle);
  giftModal.classList.add('is-open');
}

function closeGiftModal() {
  giftModal.classList.remove('is-open');
  currentGiftId = null;
}

modalClose.addEventListener('click', closeGiftModal);
giftModal.addEventListener('click', (e) => {
  if (e.target === giftModal) closeGiftModal();
});

giftClaimForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentGiftId) return;

  const fullName = document.getElementById('giftClaimName').value.trim();
  if (!fullName) return;

  try {
    await claimGift(currentGiftId, fullName);
    closeGiftModal();
  } catch (err) {
    if (err.message === 'already-claimed') {
      giftClaimFeedback.textContent = 'Ops! Esse presente acabou de ser escolhido por outra pessoa. Escolha outro na lista.';
    } else {
      giftClaimFeedback.textContent = 'Não foi possível confirmar agora. Tente novamente em instantes.';
    }
    wrapUppercaseS(giftClaimFeedback);
  }
});

async function claimGift(giftId, fullName) {
  const giftRef = giftsCollection.doc(giftId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(giftRef);
    if (!snap.exists || snap.data().claimedBy) {
      throw new Error('already-claimed');
    }
    transaction.update(giftRef, {
      claimedBy: fullName,
      claimedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
}

// ------------------------------------------------------------------
// CONVIDADOS (lista pública, só para o convidado achar o próprio nome no
// formulário de RSVP — impede quem não foi convidado de confirmar presença).
// Quem já respondeu (guests/{id}.confirmed) sai da lista de escolha.
// ------------------------------------------------------------------
const guestsCollection = db.collection('guests');
const rsvpsCollection = db.collection('rsvps');
const guestCombo = document.getElementById('guestCombo');
const guestSearchInput = document.getElementById('nomeBusca');
const guestIdInput = document.getElementById('nome');
const guestListbox = document.getElementById('guestListbox');
const guestsEmptyHint = document.getElementById('guestsEmptyHint');

let availableGuests = []; // [{ id, name }] — só quem ainda não respondeu
let visibleGuests = []; // resultado da busca atual
let activeGuestIndex = -1;
let totalGuestsCount = 0;

function setGuestListOpen(open) {
  guestListbox.classList.toggle('is-hidden', !open);
  guestSearchInput.setAttribute('aria-expanded', String(open));
  if (!open) setActiveGuest(-1);
}

function setActiveGuest(index) {
  activeGuestIndex = index;
  Array.from(guestListbox.children).forEach((li, i) => {
    const isActive = i === index;
    li.classList.toggle('is-active', isActive);
    li.setAttribute('aria-selected', String(isActive));
    if (isActive) {
      guestSearchInput.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    }
  });
  if (index < 0) guestSearchInput.removeAttribute('aria-activedescendant');
}

function renderGuestOptions() {
  visibleGuests = availableGuests.filter((guest) => GuestUtils.matchesSearch(guest.name, guestSearchInput.value));
  guestListbox.innerHTML = '';

  if (visibleGuests.length === 0) {
    const li = document.createElement('li');
    li.className = 'combo__empty';
    li.textContent = 'Nenhum nome encontrado.';
    guestListbox.appendChild(li);
  }

  visibleGuests.forEach((guest, i) => {
    const li = document.createElement('li');
    li.className = 'combo__option';
    li.id = `guestOption${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.id = guest.id;
    li.textContent = guest.name;
    guestListbox.appendChild(li);
  });
  activeGuestIndex = -1;
}

function selectGuest(guest) {
  guestIdInput.value = guest.id;
  guestSearchInput.value = guest.name;
  setGuestListOpen(false);
}

function clearGuestSelection() {
  guestIdInput.value = '';
}

function updateGuestAvailability() {
  let hint = '';
  if (totalGuestsCount === 0) {
    hint = 'A lista de convidados ainda não foi publicada. Volte em breve!';
  } else if (availableGuests.length === 0) {
    hint = 'Todos os convidados da lista já responderam.';
  }
  guestsEmptyHint.textContent = hint;
  guestsEmptyHint.classList.toggle('is-hidden', !hint);
  guestSearchInput.disabled = availableGuests.length === 0;
}

guestsCollection.onSnapshot((snapshot) => {
  totalGuestsCount = snapshot.size;
  availableGuests = snapshot.docs
    .filter((docSnap) => !docSnap.data().confirmed)
    .map((docSnap) => ({ id: docSnap.id, name: docSnap.data().name || '' }))
    .filter((guest) => guest.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // O nome escolhido pode ter sumido da lista (alguém acabou de responder).
  if (guestIdInput.value && !availableGuests.some((guest) => guest.id === guestIdInput.value)) {
    clearGuestSelection();
  }
  renderGuestOptions();
  updateGuestAvailability();
}, (err) => {
  console.error('Não foi possível carregar a lista de convidados.', err);
});

guestSearchInput.addEventListener('focus', () => {
  renderGuestOptions();
  setGuestListOpen(true);
});

guestSearchInput.addEventListener('input', () => {
  // Digitou depois de escolher: a escolha anterior não vale mais.
  clearGuestSelection();
  renderGuestOptions();
  setGuestListOpen(true);
});

guestSearchInput.addEventListener('keydown', (e) => {
  const isOpen = !guestListbox.classList.contains('is-hidden');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!isOpen) {
      renderGuestOptions();
      setGuestListOpen(true);
    }
    if (visibleGuests.length === 0) return;
    const step = e.key === 'ArrowDown' ? 1 : -1;
    setActiveGuest((activeGuestIndex + step + visibleGuests.length) % visibleGuests.length);
  } else if (e.key === 'Enter' && isOpen && activeGuestIndex >= 0) {
    e.preventDefault();
    selectGuest(visibleGuests[activeGuestIndex]);
  } else if (e.key === 'Escape' && isOpen) {
    setGuestListOpen(false);
  }
});

// mousedown não tira o foco do campo; o click escolhe o nome.
guestListbox.addEventListener('mousedown', (e) => e.preventDefault());
guestListbox.addEventListener('click', (e) => {
  const option = e.target.closest('.combo__option');
  if (!option) return;
  const guest = availableGuests.find((g) => g.id === option.dataset.id);
  if (guest) selectGuest(guest);
});

document.addEventListener('click', (e) => {
  if (!guestCombo.contains(e.target)) setGuestListOpen(false);
});
guestCombo.addEventListener('focusout', (e) => {
  if (!guestCombo.contains(e.relatedTarget)) setGuestListOpen(false);
});

// ------------------------------------------------------------------
// RSVP FORM (grava direto no Firestore — visível só no painel da noiva)
// Cada convidado tem UMA resposta: o documento em rsvps usa o id do
// convidado como id, e o convidado é marcado como "confirmed" no mesmo
// batch (as regras do Firestore exigem os dois juntos).
// ------------------------------------------------------------------
// Prazo final para confirmar presença (regra igual no firestore.rules,
// que é quem realmente impede a gravação depois disso).
const RSVP_DEADLINE = new Date('2026-10-31T23:59:59-03:00');
const rsvpClosedNotice = document.getElementById('rsvpClosedNotice');
const rsvpForm = document.getElementById('rsvpForm');
const formFeedback = document.getElementById('formFeedback');

if (new Date() > RSVP_DEADLINE) {
  rsvpForm.classList.add('is-hidden');
  rsvpClosedNotice.classList.remove('is-hidden');
}
const rsvpDone = document.getElementById('rsvpDone');
const rsvpDoneTitle = document.getElementById('rsvpDoneTitle');
const rsvpDoneText = document.getElementById('rsvpDoneText');
const rsvpQrBox = document.getElementById('rsvpQrBox');
const rsvpQrImg = document.getElementById('rsvpQrImg');
const rsvpQrName = document.getElementById('rsvpQrName');
const rsvpDownloadBtn = document.getElementById('rsvpDownloadBtn');
const rsvpAnotherBtn = document.getElementById('rsvpAnotherBtn');
let lastConfirmation = null; // { name, qrId } — só em memória, para o botão de baixar o PDF

async function submitRsvp({ guestId, name, presenca, mensagem }) {
  const qrId = presenca === 'sim' ? GuestUtils.generateQrId() : null;
  const batch = db.batch();
  batch.set(rsvpsCollection.doc(guestId), {
    guestId,
    nome: name,
    presenca,
    mensagem,
    qrId,
    checkedIn: false,
    checkedInAt: null,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  });
  batch.update(guestsCollection.doc(guestId), { confirmed: true });
  await batch.commit();
  return qrId;
}

function showRsvpDone({ name, presenca, qrId }) {
  rsvpForm.classList.add('is-hidden');
  rsvpDone.classList.remove('is-hidden');

  if (presenca === 'sim') {
    lastConfirmation = { name, qrId };
    rsvpDoneTitle.textContent = 'Presença confirmada! 💛';
    rsvpDoneText.textContent = 'Obrigado por avisar. Este é o seu QR code de entrada:';
    rsvpQrImg.src = QrPdf.previewDataUrl(name, qrId);
    rsvpQrName.textContent = name;
    rsvpQrBox.classList.remove('is-hidden');
  } else {
    lastConfirmation = null;
    rsvpDoneTitle.textContent = 'Recebemos a sua resposta';
    rsvpDoneText.textContent = 'Sentiremos a sua falta. Obrigado por avisar! 💛';
    rsvpQrBox.classList.add('is-hidden');
  }
  wrapUppercaseS(rsvpDone);
}

function resetRsvpView() {
  lastConfirmation = null;
  rsvpDone.classList.add('is-hidden');
  rsvpQrBox.classList.add('is-hidden');
  rsvpQrImg.removeAttribute('src');
  rsvpForm.classList.remove('is-hidden');
  rsvpForm.reset();
  clearGuestSelection();
}

rsvpForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (new Date() > RSVP_DEADLINE) {
    rsvpForm.classList.add('is-hidden');
    rsvpClosedNotice.classList.remove('is-hidden');
    return;
  }

  const guest = availableGuests.find((g) => g.id === guestIdInput.value);
  if (!guest) {
    showFeedback('Busque o seu nome e escolha-o na lista.');
    return;
  }

  const presenca = rsvpForm.querySelector('input[name="presenca"]:checked').value;
  const mensagem = document.getElementById('mensagem').value.trim();

  try {
    const qrId = await submitRsvp({ guestId: guest.id, name: guest.name, presenca, mensagem });
    showRsvpDone({ name: guest.name, presenca, qrId });
  } catch (err) {
    if (err.code === 'permission-denied') {
      showFeedback('Não foi possível confirmar: esse nome já respondeu ou não está na lista. Fale com os noivos.');
    } else {
      showFeedback('Não foi possível enviar agora. Tente novamente em instantes.');
    }
  }
});

rsvpDownloadBtn.addEventListener('click', async () => {
  if (!lastConfirmation) return;
  try {
    await QrPdf.downloadPdf(lastConfirmation.name, lastConfirmation.qrId);
  } catch (err) {
    console.error('Não foi possível gerar o PDF do QR code.', err);
    window.alert('Não foi possível baixar o PDF agora. Tente novamente.');
  }
});

rsvpAnotherBtn.addEventListener('click', resetRsvpView);

function showFeedback(message) {
  formFeedback.textContent = message;
  wrapUppercaseS(formFeedback);
  setTimeout(() => (formFeedback.textContent = ''), 6000);
}

// ------------------------------------------------------------------
// PAINEL DA NOIVA (só ativo enquanto autenticada)
// ------------------------------------------------------------------
const adminGuestsList = document.getElementById('adminGuestsList');
const adminGuestsEmpty = document.getElementById('adminGuestsEmpty');
const adminGuestSearch = document.getElementById('adminGuestSearch');
const adminGuestForm = document.getElementById('adminGuestForm');
const adminGuestFeedback = document.getElementById('adminGuestFeedback');
const adminRsvpsList = document.getElementById('adminRsvpsList');
const adminRsvpsEmpty = document.getElementById('adminRsvpsEmpty');
const adminRsvpFilter = document.getElementById('adminRsvpFilter');
const adminGuestsCount = document.getElementById('adminGuestsCount');
const adminRsvpsCount = document.getElementById('adminRsvpsCount');
const adminGiftsList = document.getElementById('adminGiftsList');
const adminGiftsEmpty = document.getElementById('adminGiftsEmpty');
const adminGiftFilter = document.getElementById('adminGiftFilter');
const adminGiftForm = document.getElementById('adminGiftForm');
const adminGiftFeedback = document.getElementById('adminGiftFeedback');
const adminGiftsAvailableCount = document.getElementById('adminGiftsAvailableCount');
const adminGiftsClaimedCount = document.getElementById('adminGiftsClaimedCount');

let unsubscribeAdminGuests = null;
let unsubscribeRsvps = null;
let unsubscribeAdminGifts = null;

// Últimos dados recebidos do Firestore: as buscas/filtros re-desenham a
// lista a partir daqui, sem consultar o banco de novo.
let adminGuestsCache = []; // [{ id, name, confirmed }]
let adminRsvpsCache = []; // [{ id, ...dados do rsvp }]
let adminGiftsCache = []; // [{ id, ...dados do presente }]
let adminGiftFilterValue = 'all'; // 'all' | 'available' | 'claimed'
let adminRsvpFilterValue = 'sim'; // 'sim' | 'nao'

const PRESENCA_LABELS = { sim: 'Vai comparecer', nao: 'Não vai comparecer' };

// Abas do painel (Convidados / Confirmações / Presentes)
const adminTabs = document.querySelectorAll('.admin__tab');
const adminPanels = document.querySelectorAll('[data-panel]');

adminTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    adminTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
    adminPanels.forEach((panel) => panel.classList.toggle('is-hidden', panel.dataset.panel !== tab.dataset.tab));
  });
});

function renderAdminGuests() {
  const matches = adminGuestsCache.filter((guest) => GuestUtils.matchesSearch(guest.name, adminGuestSearch.value));
  adminGuestsList.innerHTML = '';
  adminGuestsCount.textContent = adminGuestsCache.length;

  adminGuestsEmpty.textContent = adminGuestsCache.length === 0
    ? 'Nenhum convidado cadastrado ainda.'
    : 'Nenhum convidado encontrado.';
  adminGuestsEmpty.classList.toggle('is-hidden', matches.length > 0);

  matches.forEach((guest) => {
    const item = document.createElement('div');
    item.className = 'admin__item';
    item.innerHTML = `
      <p class="admin__item-title">${escapeHtml(guest.name)}${guest.confirmed ? ' <span class="admin__tag">já respondeu</span>' : ''}</p>
      <button class="admin__item-delete" data-id="${guest.id}">Excluir</button>
    `;
    adminGuestsList.appendChild(item);
  });
  wrapUppercaseS(adminGuestsList);
}

function renderAdminRsvps() {
  adminRsvpsList.innerHTML = '';
  adminRsvpsCount.textContent = adminRsvpsCache.filter((rsvp) => rsvp.presenca === 'sim').length;

  const matches = adminRsvpsCache.filter((rsvp) => rsvp.presenca === adminRsvpFilterValue);
  adminRsvpsEmpty.textContent = adminRsvpsCache.length === 0
    ? 'Ninguém confirmou presença ainda.'
    : 'Ninguém nesse grupo ainda.';
  adminRsvpsEmpty.classList.toggle('is-hidden', matches.length > 0);

  matches.forEach((rsvp) => {
    const item = document.createElement('div');
    item.className = 'admin__item';
    const canDownloadQr = rsvp.presenca === 'sim' && rsvp.qrId;
    item.innerHTML = `
      <p class="admin__item-title">${escapeHtml(rsvp.nome || '(sem nome)')}${rsvp.checkedIn ? ' <span class="admin__tag admin__tag--ok">já entrou</span>' : ''}</p>
      <p class="admin__item-meta">${PRESENCA_LABELS[rsvp.presenca] || rsvp.presenca}${rsvp.presenca === 'sim' && !rsvp.qrId ? ' · sem QR code (resposta antiga: exclua para o convidado responder de novo)' : ''}</p>
      ${rsvp.mensagem ? `<p class="admin__item-message">"${escapeHtml(rsvp.mensagem)}"</p>` : ''}
      <div class="admin__item-actions">
        ${canDownloadQr ? `<button class="admin__item-action" data-action="qr" data-id="${rsvp.id}">Baixar QR code (PDF)</button>` : ''}
        <button class="admin__item-delete" data-action="delete" data-id="${rsvp.id}">Excluir resposta</button>
      </div>
    `;
    adminRsvpsList.appendChild(item);
  });
  wrapUppercaseS(adminRsvpsList);
}

function renderAdminGifts() {
  const claimedCount = adminGiftsCache.filter((gift) => gift.claimedBy).length;
  adminGiftsClaimedCount.textContent = claimedCount;
  adminGiftsAvailableCount.textContent = adminGiftsCache.length - claimedCount;

  const matches = adminGiftsCache.filter((gift) => {
    if (adminGiftFilterValue === 'available') return !gift.claimedBy;
    if (adminGiftFilterValue === 'claimed') return Boolean(gift.claimedBy);
    return true;
  });

  const emptyMessages = {
    all: 'Nenhum presente cadastrado ainda.',
    available: 'Nenhum presente disponível.',
    claimed: 'Nenhum presente indisponível.',
  };
  adminGiftsEmpty.textContent = emptyMessages[adminGiftFilterValue];
  adminGiftsEmpty.classList.toggle('is-hidden', matches.length > 0);

  adminGiftsList.innerHTML = '';
  matches.forEach((gift) => {
    const item = document.createElement('div');
    item.className = 'admin__item';
    item.innerHTML = `
      ${gift.image ? `<img class="admin__item-thumb" src="${gift.image}" alt="" />` : ''}
      <p class="admin__item-title">${escapeHtml(gift.name)}</p>
      <p class="admin__item-meta">${gift.claimedBy ? `Escolhido por <strong>${escapeHtml(gift.claimedBy)}</strong>` : 'Disponível'}</p>
      <button class="admin__item-delete" data-id="${gift.id}">Excluir</button>
    `;
    adminGiftsList.appendChild(item);
  });
  wrapUppercaseS(adminGiftsList);
}

function startAdminListeners() {
  if (unsubscribeRsvps || unsubscribeAdminGifts || unsubscribeAdminGuests) return; // já estão rodando

  unsubscribeAdminGuests = guestsCollection.onSnapshot(
    (snapshot) => {
      adminGuestsCache = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, name: docSnap.data().name || '', confirmed: Boolean(docSnap.data().confirmed) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      renderAdminGuests();
    },
    (err) => console.error('Não foi possível carregar a lista de convidados.', err)
  );

  unsubscribeRsvps = rsvpsCollection.orderBy('criadoEm', 'desc').onSnapshot(
    (snapshot) => {
      adminRsvpsCache = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderAdminRsvps();
    },
    (err) => console.error('Não foi possível carregar as confirmações.', err)
  );

  unsubscribeAdminGifts = giftsCollection.orderBy('createdAt', 'desc').onSnapshot(
    (snapshot) => {
      adminGiftsCache = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderAdminGifts();
    },
    (err) => console.error('Não foi possível carregar os presentes.', err)
  );
}

function stopAdminListeners() {
  if (unsubscribeAdminGuests) unsubscribeAdminGuests();
  if (unsubscribeRsvps) unsubscribeRsvps();
  if (unsubscribeAdminGifts) unsubscribeAdminGifts();
  unsubscribeAdminGuests = null;
  unsubscribeRsvps = null;
  unsubscribeAdminGifts = null;
  adminGuestsCache = [];
  adminRsvpsCache = [];
  adminGiftsCache = [];
  adminGuestSearch.value = '';
  adminGuestsList.innerHTML = '';
  adminRsvpsList.innerHTML = '';
  adminGiftsList.innerHTML = '';
  adminGuestsCount.textContent = '0';
  adminRsvpsCount.textContent = '0';
  adminGiftsAvailableCount.textContent = '0';
  adminGiftsClaimedCount.textContent = '0';
}

adminGuestSearch.addEventListener('input', renderAdminGuests);

adminRsvpFilter.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-rsvp-filter]');
  if (!btn) return;
  adminRsvpFilterValue = btn.dataset.rsvpFilter;
  adminRsvpFilter.querySelectorAll('[data-rsvp-filter]').forEach((b) => {
    b.classList.toggle('is-active', b === btn);
  });
  renderAdminRsvps();
});

adminGiftFilter.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-gift-filter]');
  if (!btn) return;
  adminGiftFilterValue = btn.dataset.giftFilter;
  adminGiftFilter.querySelectorAll('[data-gift-filter]').forEach((b) => {
    b.classList.toggle('is-active', b === btn);
  });
  renderAdminGifts();
});

adminRsvpsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const rsvp = adminRsvpsCache.find((r) => r.id === btn.dataset.id);
  if (!rsvp) return;

  if (btn.dataset.action === 'qr') {
    try {
      await QrPdf.downloadPdf(rsvp.nome, rsvp.qrId);
    } catch (err) {
      console.error('Não foi possível gerar o PDF do QR code.', err);
      window.alert('Não foi possível baixar o PDF agora. Tente novamente.');
    }
    return;
  }

  // Excluir a resposta libera o convidado para responder de novo (o QR
  // antigo deixa de valer, porque o registro some).
  const warning = `Excluir a resposta de ${rsvp.nome}? O nome volta para a lista de confirmação e o QR code atual deixa de valer.`;
  if (!window.confirm(warning)) return;
  try {
    const batch = db.batch();
    batch.delete(rsvpsCollection.doc(rsvp.id));
    if (rsvp.guestId) {
      const guestRef = guestsCollection.doc(rsvp.guestId);
      if ((await guestRef.get()).exists) batch.update(guestRef, { confirmed: false });
    }
    await batch.commit();
  } catch (err) {
    console.error('Não foi possível excluir a resposta.', err);
    window.alert('Não foi possível excluir agora. Tente novamente.');
  }
});

adminGuestForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const namesInput = document.getElementById('adminGuestNames');
  const names = namesInput.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (names.length === 0) return;

  try {
    const batch = db.batch();
    names.forEach((name) => {
      const ref = guestsCollection.doc();
      batch.set(ref, { name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();
    namesInput.value = '';
    adminGuestFeedback.textContent = names.length === 1
      ? 'Convidado adicionado à lista!'
      : `${names.length} convidados adicionados à lista!`;
  } catch (err) {
    adminGuestFeedback.textContent = 'Não foi possível adicionar agora. Tente novamente.';
  }
  wrapUppercaseS(adminGuestFeedback);
  setTimeout(() => (adminGuestFeedback.textContent = ''), 4000);
});

adminGuestsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.admin__item-delete');
  if (!btn) return;
  // Junto com o convidado some a resposta dele (mesmo id), se existir.
  const batch = db.batch();
  batch.delete(guestsCollection.doc(btn.dataset.id));
  batch.delete(rsvpsCollection.doc(btn.dataset.id));
  await batch.commit();
});

// Foto do presente: redimensiona no navegador e grava como base64 direto
// no Firestore (sem precisar configurar o Firebase Storage à parte).
const adminGiftImageInput = document.getElementById('adminGiftImage');
const adminGiftPreview = document.getElementById('adminGiftPreview');
let adminGiftImageData = null;

function resizeImageFile(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode-failed'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Tenta qualidades decrescentes até caber com folga no limite de 1MB
// por documento do Firestore.
async function processGiftImage(file) {
  const attempts = [[640, 0.72], [640, 0.5], [480, 0.4]];
  let lastDataUrl = null;
  for (const [maxSize, quality] of attempts) {
    lastDataUrl = await resizeImageFile(file, maxSize, quality);
    if (lastDataUrl.length < 700000) return lastDataUrl;
  }
  throw new Error('image-too-large');
}

function resetAdminGiftImage() {
  adminGiftImageData = null;
  adminGiftImageInput.value = '';
  adminGiftPreview.classList.add('is-hidden');
  adminGiftPreview.removeAttribute('src');
}

adminGiftImageInput.addEventListener('change', async () => {
  const file = adminGiftImageInput.files[0];
  if (!file) {
    resetAdminGiftImage();
    return;
  }

  try {
    adminGiftImageData = await processGiftImage(file);
    adminGiftPreview.src = adminGiftImageData;
    adminGiftPreview.classList.remove('is-hidden');
  } catch (err) {
    resetAdminGiftImage();
    adminGiftFeedback.textContent = 'Não foi possível usar essa foto. Tente uma imagem menor.';
    wrapUppercaseS(adminGiftFeedback);
  }
});

adminGiftForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('adminGiftName').value.trim();
  const description = document.getElementById('adminGiftDescription').value.trim();
  if (!name) return;

  try {
    await giftsCollection.add({
      name,
      description: description || null,
      image: adminGiftImageData || null,
      claimedBy: null,
      claimedAt: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    adminGiftForm.reset();
    resetAdminGiftImage();
    adminGiftFeedback.textContent = 'Presente adicionado à lista!';
  } catch (err) {
    adminGiftFeedback.textContent = 'Não foi possível adicionar agora. Tente novamente.';
  }
  wrapUppercaseS(adminGiftFeedback);
  setTimeout(() => (adminGiftFeedback.textContent = ''), 4000);
});

adminGiftsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.admin__item-delete');
  if (!btn) return;
  await giftsCollection.doc(btn.dataset.id).delete();
});

// ------------------------------------------------------------------
// CARROSSEL DE FOTOS DO CASAL
// ------------------------------------------------------------------
const coupleCarousel = document.getElementById('coupleCarousel');
if (coupleCarousel) {
  const track = document.getElementById('coupleCarouselTrack');
  const slides = Array.from(track.children);
  const dotsContainer = document.getElementById('coupleCarouselDots');
  const prevBtn = document.getElementById('coupleCarouselPrev');
  const nextBtn = document.getElementById('coupleCarouselNext');
  const AUTOPLAY_MS = 5000;
  let current = 0;
  let autoplayTimer = null;

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel__dot';
    dot.setAttribute('aria-label', `Ir para a foto ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dotsContainer.appendChild(dot);
  });
  const dots = Array.from(dotsContainer.children);

  function render() {
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === current));
  }

  function goTo(index) {
    current = (index + slides.length) % slides.length;
    render();
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function startAutoplay() {
    stopAutoplay();
    autoplayTimer = setInterval(next, AUTOPLAY_MS);
  }

  function stopAutoplay() {
    if (autoplayTimer) clearInterval(autoplayTimer);
  }

  prevBtn.addEventListener('click', () => { prev(); startAutoplay(); });
  nextBtn.addEventListener('click', () => { next(); startAutoplay(); });

  render();
  startAutoplay();
}

// ------------------------------------------------------------------
// Varre a página inteira; a própria função filtra e só troca o "S"
// nos trechos que estiverem em Shelley Script (ver comentário acima).
// ------------------------------------------------------------------
wrapUppercaseS(document.body);
