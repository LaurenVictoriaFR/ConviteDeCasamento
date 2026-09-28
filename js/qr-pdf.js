// Geração do QR code do convidado (pré-visualização na tela e PDF para
// baixar). Depende de js/vendor/qrcode.js (+ qrcode_UTF8.js, para acentos
// no nome) e js/vendor/jspdf.umd.min.js, além de js/guest-utils.js.
(function (root) {
  const QR_QUIET_ZONE_MODULES = 4;

  function buildQr(text) {
    const qr = root.qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    return qr;
  }

  // Imagem (data URL) para mostrar na página logo depois da confirmação.
  function previewDataUrl(name, qrId) {
    return buildQr(root.GuestUtils.buildQrPayload(name, qrId)).createDataURL(6, QR_QUIET_ZONE_MODULES);
  }

  // "Ruth & Víctor" desenhado num <canvas> com as MESMAS fontes do site
  // (@font-face em css/style.css) e exportado como PNG, pra sair no PDF
  // igual ao logo do site — as fontes do jsPDF não têm essa fonte script.
  const COUPLE_NAME_FONT = '"Shelley Script LT Std"';
  const COUPLE_AMP_FONT = '"The Mumbai Sticker"';

  // Ambientes sem DOM/canvas (ex.: os testes de unidade, que rodam os
  // scripts do site num vm do Node) caem pro texto padrão do jsPDF mais
  // abaixo, em vez da imagem com a fonte do site.
  function hasCanvasSupport() {
    return typeof root.document !== 'undefined'
      && typeof root.document.createElement === 'function'
      && typeof root.document.fonts !== 'undefined';
  }

  let coupleFontsPromise = null;

  function loadCoupleFonts() {
    if (!coupleFontsPromise) {
      const size = 100; // só precisa bater com o que é usado no measureText/fillText abaixo
      coupleFontsPromise = Promise.all([
        root.document.fonts.load(`${size}px ${COUPLE_NAME_FONT}`),
        root.document.fonts.load(`${size}px ${COUPLE_AMP_FONT}`),
      ]).then(() => root.document.fonts.ready);
    }
    return coupleFontsPromise;
  }

  async function coupleNamesImage() {
    await loadCoupleFonts();

    const nameSize = 260; // resolução alta pra sair nítido impresso
    const ampSize = Math.round(nameSize * 0.55); // mesma proporção de .hero__names span
    const canvas = root.document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    ctx.font = `${nameSize}px ${COUPLE_NAME_FONT}`;
    const widthRuth = ctx.measureText('Ruth ').width;
    const widthVictor = ctx.measureText(' Víctor').width;
    ctx.font = `${ampSize}px ${COUPLE_AMP_FONT}`;
    const widthAmp = ctx.measureText('&').width;

    const paddingX = nameSize * 0.12;
    const totalWidth = Math.ceil(widthRuth + widthAmp + widthVictor + paddingX * 2);
    const totalHeight = Math.ceil(nameSize * 1.3);
    canvas.width = totalWidth;
    canvas.height = totalHeight;

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#33170a'; // --ink
    const baselineY = totalHeight * 0.72;
    let x = paddingX;

    ctx.font = `${nameSize}px ${COUPLE_NAME_FONT}`;
    ctx.fillText('Ruth ', x, baselineY);
    x += widthRuth;

    ctx.font = `${ampSize}px ${COUPLE_AMP_FONT}`;
    ctx.fillText('&', x, baselineY);
    x += widthAmp;

    ctx.font = `${nameSize}px ${COUPLE_NAME_FONT}`;
    ctx.fillText(' Víctor', x, baselineY);

    return { dataUrl: canvas.toDataURL('image/png'), width: totalWidth, height: totalHeight };
  }

  // Começa a carregar a fonte assim que a página abre (não espera o clique
  // em "Baixar PDF"): assim, quando o clique acontece, a promise já está
  // pronta (ou já falhou) e o PDF sai na hora, sem a demora de rede
  // arriscar quebrar o download em navegadores (Safari sobretudo) que só
  // permitem salvar arquivo se for "perto" do clique.
  if (hasCanvasSupport()) {
    loadCoupleFonts().catch(() => {});
  }

  // Monta o PDF (A4) com o QR code. Devolve o objeto jsPDF; quem chama
  // decide se salva ou só inspeciona.
  async function createPdf(name, qrId) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const center = pageWidth / 2;
    const brown = [102, 40, 10];
    const soft = [124, 59, 26];

    doc.setDrawColor(...brown);
    doc.setLineWidth(0.8);
    doc.rect(10, 10, 190, 277);
    doc.setLineWidth(0.25);
    doc.rect(13, 13, 184, 271);

    doc.setTextColor(...soft);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('CONVITE INDIVIDUAL', center, 32, { align: 'center' });

    // Se a imagem com a fonte do site falhar por qualquer motivo (fonte não
    // carregou a tempo, canvas indisponível etc.), cai pro texto padrão do
    // jsPDF — o download não pode travar por causa de um detalhe visual.
    let coupleBottom;
    let couple = null;
    if (hasCanvasSupport()) {
      try {
        couple = await coupleNamesImage();
      } catch (err) {
        console.error('Não foi possível montar "Ruth & Víctor" com a fonte do site; usando o texto padrão.', err);
      }
    }
    if (couple) {
      const coupleTop = 36;
      const coupleWidth = 130;
      const coupleHeight = coupleWidth * (couple.height / couple.width);
      doc.addImage(couple.dataUrl, 'PNG', center - coupleWidth / 2, coupleTop, coupleWidth, coupleHeight);
      coupleBottom = coupleTop + coupleHeight;
    } else {
      doc.setTextColor(...brown);
      doc.setFont('times', 'italic');
      doc.setFontSize(44);
      doc.text('Ruth & Víctor', center, 52, { align: 'center' });
      coupleBottom = 58;
    }

    doc.setTextColor(...soft);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text('Sábado, 5 de dezembro de 2026 · 16h30', center, coupleBottom + 12, { align: 'center' });
    doc.setFontSize(11);
    doc.text('Sítio DKF · Brejo do Arroz 2 (próx. à Irrigação)', center, coupleBottom + 19, { align: 'center' });

    doc.setDrawColor(...brown);
    doc.setLineWidth(0.3);
    doc.line(70, coupleBottom + 28, 140, coupleBottom + 28);

    doc.setFontSize(10);
    doc.text('CONVIDADO(A)', center, coupleBottom + 41, { align: 'center' });

    doc.setTextColor(...brown);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    const nameLines = doc.splitTextToSize(name, 150);
    doc.text(nameLines, center, coupleBottom + 51, { align: 'center' });
    const nameBottom = coupleBottom + 51 + (nameLines.length - 1) * 8;

    // QR code desenhado como retângulos (vetorial: fica nítido em qualquer
    // impressão) sobre um fundo branco que serve de zona de silêncio.
    const qr = buildQr(root.GuestUtils.buildQrPayload(name, qrId));
    const count = qr.getModuleCount();
    const qrSize = 100;
    const cell = qrSize / (count + QR_QUIET_ZONE_MODULES * 2);
    const qrX = center - qrSize / 2;
    const qrY = nameBottom + 12;

    doc.setFillColor(255, 255, 255);
    doc.rect(qrX, qrY, qrSize, qrSize, 'F');
    doc.setFillColor(0, 0, 0);
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          doc.rect(
            qrX + (col + QR_QUIET_ZONE_MODULES) * cell,
            qrY + (row + QR_QUIET_ZONE_MODULES) * cell,
            cell + 0.02,
            cell + 0.02,
            'F'
          );
        }
      }
    }

    const textY = qrY + qrSize + 14;
    doc.setTextColor(...soft);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text('Apresente este QR code na portaria no dia do casamento.', center, textY, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Ele é pessoal e só pode ser lido uma vez. Não compartilhe.', center, textY + 7, { align: 'center' });

    return doc;
  }

  async function downloadPdf(name, qrId) {
    (await createPdf(name, qrId)).save(root.GuestUtils.fileNameForGuest(name));
  }

  root.QrPdf = { previewDataUrl, createPdf, downloadPdf };
})(typeof self !== 'undefined' ? self : this);
