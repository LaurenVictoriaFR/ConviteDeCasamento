// Testa firestore.rules contra o emulador do Firestore.
// Uso: npm run test:rules   (o script sobe o emulador e roda este arquivo)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const QR_ID = '3f2a9c1e-7b4d-4e58-9a06-1d2c3b4a5f60';
let env;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-convite',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
});

test.after(async () => {
  await env.cleanup();
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('guests/maria').set({ name: 'Maria Silva' });
    await db.doc('guests/joao').set({ name: 'João Souza' });
    await db.doc('guests/ana').set({ name: 'Ana Costa', confirmed: true });
    await db.doc('gifts/livre').set({ name: 'Panela', claimedBy: null, claimedAt: null });
    await db.doc('gifts/tomado').set({ name: 'Jarra', claimedBy: 'Fulano', claimedAt: new Date() });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const bride = () => env.authenticatedContext('noiva').firestore();
const ts = () => firebase.firestore.FieldValue.serverTimestamp();

function rsvpData(guestId, name, overrides = {}) {
  return {
    guestId, nome: name, presenca: 'sim', mensagem: '', qrId: QR_ID,
    checkedIn: false, checkedInAt: null, criadoEm: ts(), ...overrides,
  };
}

// O mesmo batch que o site envia: cria a resposta e marca o convidado.
function confirmBatch(db, guestId, name, overrides = {}) {
  const batch = db.batch();
  batch.set(db.doc(`rsvps/${guestId}`), rsvpData(guestId, name, overrides));
  batch.update(db.doc(`guests/${guestId}`), { confirmed: true });
  return batch;
}

// ---------------- Confirmação de presença (convidado, sem login) ----------------

test('convidado confirma "sim": cria a resposta e some da lista (confirmed = true)', async () => {
  const db = anon();
  await assertSucceeds(confirmBatch(db, 'maria', 'Maria Silva').commit());
  let confirmed;
  await env.withSecurityRulesDisabled(async (ctx) => {
    confirmed = (await ctx.firestore().doc('guests/maria').get()).data().confirmed;
  });
  assert.equal(confirmed, true);
});

test('convidado responde "não": permitido, sem QR id', async () => {
  await assertSucceeds(confirmBatch(anon(), 'joao', 'João Souza', { presenca: 'nao', qrId: null }).commit());
});

test('mensagem opcional de até 1000 caracteres é aceita; maior que isso, não', async () => {
  await assertSucceeds(confirmBatch(anon(), 'maria', 'Maria Silva', { mensagem: 'x'.repeat(1000) }).commit());
  await assertFails(confirmBatch(anon(), 'joao', 'João Souza', { mensagem: 'x'.repeat(1001) }).commit());
});

test('mesmo convidado NÃO consegue responder duas vezes', async () => {
  await assertSucceeds(confirmBatch(anon(), 'maria', 'Maria Silva').commit());
  await assertFails(confirmBatch(anon(), 'maria', 'Maria Silva', { qrId: '11111111-2222-4333-8444-555555555555' }).commit());
});

test('convidado já marcado como confirmed na lista não pode criar resposta', async () => {
  await assertFails(confirmBatch(anon(), 'ana', 'Ana Costa').commit());
});

test('nome fora da lista de convidados não confirma', async () => {
  await assertFails(confirmBatch(anon(), 'inexistente', 'Penetra Qualquer').commit());
});

test('o nome gravado precisa ser exatamente o da lista', async () => {
  await assertFails(confirmBatch(anon(), 'maria', 'Maria Silva Falsificada').commit());
});

test('o id do documento precisa ser o do convidado (impede respostas soltas)', async () => {
  const db = anon();
  await assertFails(db.doc('rsvps/outro-id').set(rsvpData('maria', 'Maria Silva')));
  await assertFails(db.collection('rsvps').add(rsvpData('maria', 'Maria Silva')));
});

test('"sim" exige qrId; "não" não pode trazer qrId', async () => {
  await assertFails(confirmBatch(anon(), 'maria', 'Maria Silva', { qrId: null }).commit());
  await assertFails(confirmBatch(anon(), 'maria', 'Maria Silva', { qrId: 'curto' }).commit());
  await assertFails(confirmBatch(anon(), 'joao', 'João Souza', { presenca: 'nao', qrId: QR_ID }).commit());
});

test('presenca só aceita "sim" ou "nao"', async () => {
  await assertFails(confirmBatch(anon(), 'maria', 'Maria Silva', { presenca: 'talvez' }).commit());
});

test('convidado não consegue criar a resposta já marcada como "entrou"', async () => {
  await assertFails(confirmBatch(anon(), 'maria', 'Maria Silva', { checkedIn: true }).commit());
  await assertFails(confirmBatch(anon(), 'maria', 'Maria Silva', { checkedInAt: new Date() }).commit());
});

test('criadoEm precisa ser o horário do servidor (não uma data inventada)', async () => {
  await assertFails(confirmBatch(anon(), 'maria', 'Maria Silva', { criadoEm: new Date('2020-01-01') }).commit());
});

test('campos extras na resposta são recusados', async () => {
  await assertFails(confirmBatch(anon(), 'maria', 'Maria Silva', { admin: true }).commit());
});

// ---------------- Campo "confirmed" na lista de convidados ----------------

test('ninguém marca "confirmed" no convidado dos outros sem criar a resposta junto', async () => {
  await assertFails(anon().doc('guests/maria').update({ confirmed: true }));
});

test('convidado sem login não altera nome, não desmarca e não cria/apaga convidados', async () => {
  const db = anon();
  await assertFails(db.doc('guests/maria').update({ name: 'Outro Nome' }));
  await assertFails(db.doc('guests/ana').update({ confirmed: false }));
  await assertFails(db.doc('guests/novo').set({ name: 'Novo' }));
  await assertFails(db.doc('guests/maria').delete());
});

test('qualquer um lê a lista de convidados (o formulário precisa dela)', async () => {
  await assertSucceeds(anon().collection('guests').get());
});

// ---------------- Respostas: só a noiva autenticada ----------------

test('sem login: não lê, não lista, não altera e não apaga respostas', async () => {
  await assertSucceeds(confirmBatch(anon(), 'maria', 'Maria Silva').commit());
  const db = anon();
  await assertFails(db.doc('rsvps/maria').get());
  await assertFails(db.collection('rsvps').get());
  await assertFails(db.collection('rsvps').where('qrId', '==', QR_ID).get());
  await assertFails(db.doc('rsvps/maria').update({ checkedIn: true }));
  await assertFails(db.doc('rsvps/maria').delete());
});

test('noiva autenticada lê, busca por qrId, marca entrada e apaga', async () => {
  await assertSucceeds(confirmBatch(anon(), 'maria', 'Maria Silva').commit());
  const db = bride();
  const found = await assertSucceeds(db.collection('rsvps').where('qrId', '==', QR_ID).limit(1).get());
  assert.equal(found.size, 1);
  await assertSucceeds(db.doc('rsvps/maria').update({ checkedIn: true, checkedInAt: ts() }));
  await assertSucceeds(db.collection('rsvps').where('presenca', '==', 'sim').get());
  await assertSucceeds(db.doc('rsvps/maria').delete());
});

test('noiva gerencia convidados (criar, marcar confirmed, apagar)', async () => {
  const db = bride();
  await assertSucceeds(db.doc('guests/novo').set({ name: 'Novo Convidado' }));
  await assertSucceeds(db.doc('guests/novo').update({ confirmed: true }));
  await assertSucceeds(db.doc('guests/novo').update({ confirmed: false }));
  await assertSucceeds(db.doc('guests/novo').delete());
});

// ---------------- Presentes (regressão: regras antigas seguem valendo) ----------------

test('presentes: convidado escolhe um livre, não um já escolhido, e não cria presentes', async () => {
  const db = anon();
  await assertSucceeds(db.doc('gifts/livre').update({ claimedBy: 'Beltrano', claimedAt: ts() }));
  await assertFails(db.doc('gifts/tomado').update({ claimedBy: 'Beltrano', claimedAt: ts() }));
  await assertFails(db.doc('gifts/novo').set({ name: 'Algo', claimedBy: null }));
  await assertSucceeds(db.collection('gifts').get());
});
