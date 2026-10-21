/**
 * Convierte el estimado o la factura (lo que se ve en pantalla) en un archivo PDF.
 * En el celular abre el menú de compartir (WhatsApp, email, Archivos); en la computadora lo descarga.
 * Las librerías se cargan solo cuando se toca el botón, para que el app siga rápido.
 */
export async function shareAsPdf(el: HTMLElement, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    // Los botones no van en el PDF
    ignoreElements: (node) => node instanceof HTMLElement && node.dataset.nopdf !== undefined,
  })
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  const margin = 24
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW - margin * 2
  const imgH = (canvas.height * imgW) / canvas.width
  const img = canvas.toDataURL('image/jpeg', 0.92)
  // Si es larga, sigue en otra página
  let y = margin
  let left = imgH
  pdf.addImage(img, 'JPEG', margin, y, imgW, imgH)
  left -= pageH - margin * 2
  while (left > 0) {
    y = margin - (imgH - left)
    pdf.addPage()
    pdf.addImage(img, 'JPEG', margin, y, imgW, imgH)
    left -= pageH - margin * 2
  }
  const file = new File([pdf.output('blob')], fileName, { type: 'application/pdf' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName.replace(/\.pdf$/, '') })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'downloaded'
}

/** "Factura-0004-David-Echevarria.pdf" (sin acentos ni espacios). */
export function pdfName(kind: 'invoice' | 'estimate', number: string | null, client: string) {
  const who = client.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${kind === 'invoice' ? `Factura-${number}` : 'Estimado'}-${who || 'cliente'}.pdf`
}
