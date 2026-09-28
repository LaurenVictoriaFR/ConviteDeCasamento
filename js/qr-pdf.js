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

  // Monta o PDF (A4) com o QR code. Devolve o objeto jsPDF; quem chama
  // decide se salva ou só inspeciona.
  function createPdf(name, qrId) {
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

    doc.setTextColor(...brown);
    doc.setFont('times', 'italic');
    doc.setFontSize(44);
    doc.text('Ruth & Víctor', center, 52, { align: 'center' });

    doc.setTextColor(...soft);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text('Sábado, 5 de dezembro de 2026 · 16h30', center, 66, { align: 'center' });
    doc.setFontSize(11);
    doc.text('Sítio DKF · Brejo do Arroz 2 (próx. à Irrigação)', center, 73, { align: 'center' });

    doc.setDrawColor(...brown);
    doc.setLineWidth(0.3);
    doc.line(70, 82, 140, 82);

    doc.setFontSize(10);
    doc.text('CONVIDADO(A)', center, 95, { align: 'center' });

    doc.setTextColor(...brown);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    const nameLines = doc.splitTextToSize(name, 150);
    doc.text(nameLines, center, 105, { align: 'center' });
    const nameBottom = 105 + (nameLines.length - 1) * 8;

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

  function downloadPdf(name, qrId) {
    createPdf(name, qrId).save(root.GuestUtils.fileNameForGuest(name));
  }

  root.QrPdf = { previewDataUrl, createPdf, downloadPdf };
})(typeof self !== 'undefined' ? self : this);
