/**
 * Convierte algo de la pantalla (ej. la tarjeta de regalo) en una foto y abre el menú de compartir
 * (WhatsApp, etc.). Si el teléfono no deja compartir fotos, la descarga.
 */
export async function shareAsImage(el: HTMLElement, fileName: string, text?: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const { default: html2canvas } = await import('html2canvas-pro')
  const canvas = await html2canvas(el, { scale: 3, backgroundColor: null, useCORS: true })
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
  if (!blob) throw new Error('No se pudo hacer la foto')
  const file = new File([blob], fileName, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
