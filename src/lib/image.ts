/** Achica la foto en el celular antes de subirla (máx. ~1600 px de lado, JPEG). */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8, type: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo convertir la foto'))), type, quality))
  } finally {
    URL.revokeObjectURL(url)
  }
}
