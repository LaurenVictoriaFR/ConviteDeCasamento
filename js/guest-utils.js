// Funções puras (sem Firebase, sem DOM) usadas pela confirmação de presença,
// pelo painel da noiva e pela portaria. Ficam num arquivo próprio para
// poderem ser testadas em Node (ver tests/).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GuestUtils = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Minúsculas + sem acentos, para "jose" achar "José".
  function normalizeText(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  // Todas as palavras digitadas precisam aparecer no nome, em qualquer
  // ordem ("silva maria" acha "Maria Silva"). Busca vazia mostra tudo.
  function matchesSearch(name, query) {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;
    const haystack = normalizeText(name);
    return terms.every((term) => haystack.includes(term));
  }

  // UUID v4 aleatório. Usa getRandomValues (funciona também fora de HTTPS,
  // ao contrário de crypto.randomUUID).
  function generateQrId() {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Conteúdo do QR code: nome completo + id único.
  function buildQrPayload(name, id) {
    return JSON.stringify({ n: String(name).normalize('NFC'), i: id });
  }

  // Devolve { name, id } ou null se o texto lido não for um QR do convite.
  function parseQrPayload(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return null;
    }
    if (!data || typeof data.n !== 'string' || typeof data.i !== 'string') return null;
    const name = data.n.normalize('NFC').trim();
    const id = data.i.trim();
    if (!name || !id) return null;
    return { name, id };
  }

  function fileNameForGuest(name) {
    const slug = normalizeText(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `convite-${slug || 'convidado'}.pdf`;
  }

  return { normalizeText, matchesSearch, generateQrId, buildQrPayload, parseQrPayload, fileNameForGuest };
});
