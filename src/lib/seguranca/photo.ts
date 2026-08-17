/** Compressão de fotos de evidência (padrão do checklist de frota: ≤5MB, alvo ~200-800KB). */

const MAX_BYTES = 5 * 1024 * 1024;

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl.length;
  return Math.ceil(((dataUrl.length - comma - 1) * 3) / 4);
}

/** Redimensiona via canvas (máx. 1280px) e re-encode em JPEG. Rejeita se passar de 5MB mesmo comprimida. */
export async function compressImage(file: File, maxDim = 1280, quality = 0.75): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Imagem inválida"));
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador");
  ctx.drawImage(img, 0, 0, width, height);

  let out = canvas.toDataURL("image/jpeg", quality);
  if (estimateDataUrlBytes(out) > MAX_BYTES) {
    out = canvas.toDataURL("image/jpeg", 0.5);
  }
  if (estimateDataUrlBytes(out) > MAX_BYTES) {
    throw new Error("Foto muito grande mesmo após compressão (limite: 5MB)");
  }
  return out;
}
