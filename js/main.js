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
// MENU DO SITE (PC: fixo no header · Celular: fixo embaixo) + PÁGINAS
// EM ABA (Presentes / Confirmar Presença / Painel)
// ------------------------------------------------------------------
const siteMenuAdminItem = document.getElementById('siteMenuAdminItem');
const pageOverlays = document.querySelectorAll('.page-overlay');

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
const loginForm = document.getElementById('loginForm');
const loginFeedback = document.getElementById('loginFeedback');
const footerLoginBtn = document.getElementById('footerLoginBtn');

function openLoginModal() {
  loginFeedback.textContent = '';
  loginModal.classList.add('is-open');
}

function closeLoginModal() {
  loginModal.classList.remove('is-open');
  loginForm.reset();
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
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    await auth.signInWithEmailAndPassword(email, password);
    closeLoginModal();
  } catch (err) {
    loginFeedback.textContent = 'E-mail ou senha inválidos.';
    wrapUppercaseS(loginFeedback);
  }
});

// Liga/desliga a interface da noiva conforme o estado de autenticação.
auth.onAuthStateChanged((user) => {
  footerLoginBtn.textContent = user ? 'Sair' : 'Acesso da noiva';
  siteMenuAdminItem.classList.toggle('is-hidden', !user);

  if (!user && document.getElementById('painel').classList.contains('is-open')) {
    closePage('painel');
  }

  if (user) {
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
// CONVIDADOS (lista pública, só para preencher o seletor de nome do RSVP —
// impede quem não foi convidado de confirmar presença)
// ------------------------------------------------------------------
const guestsCollection = db.collection('guests');
const guestSelect = document.getElementById('nome');
const guestsEmptyHint = document.getElementById('guestsEmptyHint');
const guestNamePlaceholder = guestSelect.querySelector('option');

guestsCollection.orderBy('name').onSnapshot((snapshot) => {
  guestSelect.querySelectorAll('option:not(:first-child)').forEach((opt) => opt.remove());

  snapshot.forEach((docSnap) => {
    const option = document.createElement('option');
    option.value = docSnap.id;
    option.textContent = docSnap.data().name;
    guestSelect.appendChild(option);
  });

  const isEmpty = snapshot.empty;
  guestsEmptyHint.classList.toggle('is-hidden', !isEmpty);
  guestSelect.disabled = isEmpty;
  guestNamePlaceholder.textContent = isEmpty ? 'Nenhum convidado cadastrado' : 'Selecione seu nome na lista';
}, (err) => {
  console.error('Não foi possível carregar a lista de convidados.', err);
});

// ------------------------------------------------------------------
// RSVP FORM (grava direto no Firestore — visível só no painel da noiva)
// ------------------------------------------------------------------
const rsvpForm = document.getElementById('rsvpForm');
const formFeedback = document.getElementById('formFeedback');

rsvpForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const guestId = guestSelect.value;
  const guestName = guestSelect.selectedOptions[0] ? guestSelect.selectedOptions[0].textContent : '';
  if (!guestId) return;

  const convidados = document.getElementById('convidados').value;
  const presenca = rsvpForm.querySelector('input[name="presenca"]:checked').value;
  const mensagem = document.getElementById('mensagem').value.trim();

  try {
    await db.collection('rsvps').add({
      guestId,
      nome: guestName,
      convidados,
      presenca,
      mensagem,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showFeedback('Presença confirmada! Obrigado por avisar. 💛');
    rsvpForm.reset();
  } catch (err) {
    if (err.code === 'permission-denied') {
      showFeedback('Seu nome não foi encontrado na lista de convidados. Fale com os noivos.');
    } else {
      showFeedback('Não foi possível enviar agora. Tente novamente em instantes.');
    }
  }
});

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
const adminGuestForm = document.getElementById('adminGuestForm');
const adminGuestFeedback = document.getElementById('adminGuestFeedback');
const adminRsvpsList = document.getElementById('adminRsvpsList');
const adminRsvpsEmpty = document.getElementById('adminRsvpsEmpty');
const adminGiftsList = document.getElementById('adminGiftsList');
const adminGiftsEmpty = document.getElementById('adminGiftsEmpty');
const adminGiftForm = document.getElementById('adminGiftForm');
const adminGiftFeedback = document.getElementById('adminGiftFeedback');

let unsubscribeAdminGuests = null;
let unsubscribeRsvps = null;
let unsubscribeAdminGifts = null;

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

function startAdminListeners() {
  if (unsubscribeRsvps || unsubscribeAdminGifts || unsubscribeAdminGuests) return; // já estão rodando

  unsubscribeAdminGuests = guestsCollection.orderBy('name').onSnapshot(
    (snapshot) => {
      adminGuestsList.innerHTML = '';
      adminGuestsEmpty.classList.toggle('is-hidden', !snapshot.empty);

      snapshot.forEach((docSnap) => {
        const guest = docSnap.data();
        const item = document.createElement('div');
        item.className = 'admin__item';
        item.innerHTML = `
          <p class="admin__item-title">${escapeHtml(guest.name)}</p>
          <button class="admin__item-delete" data-id="${docSnap.id}">Excluir</button>
        `;
        adminGuestsList.appendChild(item);
      });
      wrapUppercaseS(adminGuestsList);
    },
    (err) => console.error('Não foi possível carregar a lista de convidados.', err)
  );

  unsubscribeRsvps = db.collection('rsvps').orderBy('criadoEm', 'desc').onSnapshot(
    (snapshot) => {
      adminRsvpsList.innerHTML = '';
      adminRsvpsEmpty.classList.toggle('is-hidden', !snapshot.empty);

      snapshot.forEach((docSnap) => {
        const rsvp = docSnap.data();
        const item = document.createElement('div');
        item.className = 'admin__item';
        item.innerHTML = `
          <p class="admin__item-title">${escapeHtml(rsvp.nome || '(sem nome)')}</p>
          <p class="admin__item-meta">${PRESENCA_LABELS[rsvp.presenca] || rsvp.presenca} · ${escapeHtml(String(rsvp.convidados ?? '0'))} acompanhante(s)</p>
          ${rsvp.mensagem ? `<p class="admin__item-message">"${escapeHtml(rsvp.mensagem)}"</p>` : ''}
        `;
        adminRsvpsList.appendChild(item);
      });
      wrapUppercaseS(adminRsvpsList);
    },
    (err) => console.error('Não foi possível carregar as confirmações.', err)
  );

  unsubscribeAdminGifts = giftsCollection.orderBy('createdAt', 'desc').onSnapshot(
    (snapshot) => {
      adminGiftsList.innerHTML = '';
      adminGiftsEmpty.classList.toggle('is-hidden', !snapshot.empty);

      snapshot.forEach((docSnap) => {
        const gift = docSnap.data();
        const item = document.createElement('div');
        item.className = 'admin__item';
        item.innerHTML = `
          ${gift.image ? `<img class="admin__item-thumb" src="${gift.image}" alt="" />` : ''}
          <p class="admin__item-title">${escapeHtml(gift.name)}</p>
          <p class="admin__item-meta">${gift.claimedBy ? `Escolhido por <strong>${escapeHtml(gift.claimedBy)}</strong>` : 'Disponível'}</p>
          <button class="admin__item-delete" data-id="${docSnap.id}">Excluir</button>
        `;
        adminGiftsList.appendChild(item);
      });
      wrapUppercaseS(adminGiftsList);
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
  adminGuestsList.innerHTML = '';
  adminRsvpsList.innerHTML = '';
  adminGiftsList.innerHTML = '';
}

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
  await guestsCollection.doc(btn.dataset.id).delete();
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
// Varre a página inteira; a própria função filtra e só troca o "S"
// nos trechos que estiverem em Shelley Script (ver comentário acima).
// ------------------------------------------------------------------
wrapUppercaseS(document.body);
