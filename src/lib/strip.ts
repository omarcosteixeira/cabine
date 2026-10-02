import { FILTERS, eventDate, eventTitle, type BoothEvent, type FilterId } from '../types';

export const STRIP_WIDTH = 600;
export const STRIP_HEIGHT = 1800;
const PADDING = 36;
const PHOTO_Y = 102;
const PHOTO_WIDTH = 528;
const PHOTO_HEIGHT = 396;
const PHOTO_GAP = 21;

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(source: string) {
  let promise = imageCache.get(source);
  if (!promise) {
    promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        imageCache.delete(source);
        reject(new Error('Não foi possível carregar uma das imagens.'));
      };
      image.src = source;
    });
    if (imageCache.size > 36) imageCache.delete(imageCache.keys().next().value!);
    imageCache.set(source, promise);
  }
  return promise;
}

export function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  context.drawImage(image, (sourceWidth - cropWidth) / 2, (sourceHeight - cropHeight) / 2, cropWidth, cropHeight, x, y, width, height);
}

// Pixel-based filters also work in Safari versions without Canvas.filter support.
function applyPhotoFilter(context: CanvasRenderingContext2D, x: number, y: number, filter: FilterId) {
  if (filter === 'color') return;
  const image = context.getImageData(x, y, PHOTO_WIDTH, PHOTO_HEIGHT);
  const data = image.data;
  const radians = (315 * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const hue = [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ];
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (filter === 'bw') {
      const gray = (0.2126 * r + 0.7152 * g + 0.0722 * b - 127.5) * 1.05 + 127.5;
      r = g = b = gray;
    } else {
      const amount = filter === 'warm' ? 0.55 : 0.28;
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      r = r * (1 - amount) + sr * amount;
      g = g * (1 - amount) + sg * amount;
      b = b * (1 - amount) + sb * amount;
      if (filter === 'rose') {
        const nr = hue[0] * r + hue[1] * g + hue[2] * b;
        const ng = hue[3] * r + hue[4] * g + hue[5] * b;
        const nb = hue[6] * r + hue[7] * g + hue[8] * b;
        r = nr; g = ng; b = nb;
      }
      const gray = 0.213 * r + 0.715 * g + 0.072 * b;
      const saturation = filter === 'warm' ? 0.85 : 0.8;
      const brightness = filter === 'warm' ? 1.07 : 1.06;
      r = (gray + (r - gray) * saturation) * brightness;
      g = (gray + (g - gray) * saturation) * brightness;
      b = (gray + (b - gray) * saturation) * brightness;
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
  context.putImageData(image, x, y);
}

function drawFlower(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  context.save();
  context.fillStyle = color;
  for (let petal = 0; petal < 5; petal++) {
    const angle = (petal * Math.PI * 2) / 5 - Math.PI / 2;
    context.beginPath();
    context.ellipse(x + Math.cos(angle) * radius * 0.56, y + Math.sin(angle) * radius * 0.56, radius * 0.46, radius * 0.54, angle + Math.PI / 2, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = '#fbf7ed';
  context.beginPath(); context.arc(x, y, radius * 0.21, 0, Math.PI * 2); context.fill();
  context.restore();
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, initialSize: number, font: string) {
  let size = initialSize;
  context.font = `${size}px ${font}`;
  while (context.measureText(text).width > maxWidth && size > 12) {
    size -= 2;
    context.font = `${size}px ${font}`;
  }
  return size;
}

function spacedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const characters = [...text];
  const width = characters.reduce((sum, character) => sum + context.measureText(character).width, 0) + (characters.length - 1) * spacing;
  let position = x - width / 2;
  context.textAlign = 'left';
  for (const character of characters) {
    context.fillText(character, position, y);
    position += context.measureText(character).width + spacing;
  }
  context.textAlign = 'center';
}

export async function renderStrip(photos: string[], event: BoothEvent, filter: FilterId) {
  await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))]);
  const [images, logo, template] = await Promise.all([
    Promise.all(photos.slice(0, 3).map(loadImage)),
    event.logo ? loadImage(event.logo) : Promise.resolve(undefined),
    event.template ? loadImage(event.template) : Promise.resolve(undefined),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = STRIP_WIDTH;
  canvas.height = STRIP_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Este navegador não oferece suporte à geração da tirinha.');
  context.imageSmoothingQuality = 'high';
  const dark = event.style === 'midnight';
  const ink = dark ? '#f8f4e8' : '#343c34';
  context.fillStyle = dark ? '#28322d' : event.style === 'sage' ? '#e7ece3' : '#fffdf8';
  context.fillRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);
  if (template && event.templateLayer === 'background') context.drawImage(template, 0, 0, STRIP_WIDTH, STRIP_HEIGHT);
  context.fillStyle = ink;
  context.textAlign = 'center';
  context.font = '18px "DM Sans", sans-serif';
  if (event.showText) spacedText(context, eventDate(event.date), 300, 65, 5);

  images.forEach((image, index) => {
    const y = PHOTO_Y + index * (PHOTO_HEIGHT + PHOTO_GAP);
    drawCover(context, image, image.naturalWidth, image.naturalHeight, PADDING, y, PHOTO_WIDTH, PHOTO_HEIGHT);
    applyPhotoFilter(context, PADDING, y, filter);
  });

  if (event.showText) {
    if (logo) {
      const scale = Math.min(145 / logo.naturalWidth, 94 / logo.naturalHeight);
      const width = logo.naturalWidth * scale;
      const height = logo.naturalHeight * scale;
      context.drawImage(logo, (600 - width) / 2, 1420 - height / 2, width, height);
    } else {
      drawFlower(context, 300, 1420, 39, event.color);
    }
    const title = eventTitle(event.name);
    context.fillStyle = ink;
    if (title.prefix) {
      context.font = '34px "DM Sans", sans-serif';
      context.fillText(title.prefix.toLowerCase(), 300, 1510);
    }
    fitText(context, title.main, 510, title.prefix ? 104 : 78, '"DM Serif Display", Georgia, serif');
    context.fillText(title.main, 300, title.prefix ? 1628 : 1586);
    context.font = '18px "DM Sans", sans-serif';
    const tagline = event.tagline.slice(0, 55).toUpperCase();
    const spacing = tagline.length > 35 ? 1 : 2;
    fitText(context, tagline, 480 - Math.max(0, tagline.length - 1) * spacing, 18, '"DM Sans", sans-serif');
    spacedText(context, tagline, 300, 1697, spacing);

    context.strokeStyle = event.color;
    context.lineWidth = 2;
    context.beginPath(); context.moveTo(244, 1744); context.lineTo(356, 1744); context.stroke();
  }
  if (template && event.templateLayer === 'overlay') context.drawImage(template, 0, 0, STRIP_WIDTH, STRIP_HEIGHT);
  return canvas.toDataURL('image/png');
}

export async function prepareUpload(file: File, kind: 'logo' | 'template') {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Escolha uma imagem PNG, JPG ou WebP.');
  if (file.size > 8 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, kind === 'logo' ? 512 / Math.max(image.naturalWidth, image.naturalHeight) : 1800 / image.naturalHeight, kind === 'logo' ? 1 : 600 / image.naturalWidth);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    imageCache.delete(url);
    URL.revokeObjectURL(url);
  }
}

// Re-encodes an image data URL to a lighter version, used before writing to
// Firestore and when a smaller preview is enough.
export async function compactImage(source: string, maxWidth: number, mime = 'image/jpeg', quality = 0.82) {
  try {
    const image = await loadImage(source);
    if (image.naturalWidth <= maxWidth) {
      const same = document.createElement('canvas');
      same.width = image.naturalWidth;
      same.height = image.naturalHeight;
      same.getContext('2d')!.drawImage(image, 0, 0);
      return same.toDataURL(mime, quality);
    }
    const scale = maxWidth / image.naturalWidth;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d')!;
    if (mime === 'image/jpeg') { context.fillStyle = '#fffdf8'; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(mime, quality);
  } catch {
    return source;
  }
}

export function exportFilename(eventName: string) {
  return `cabine-${eventName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'memoria'}-5x15`;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// A pHYs chunk gives the 600 x 1800 PNG its exact 5 x 15 cm print density (304.8 dpi).
export async function pngBlob(source: string) {
  const raw = new Uint8Array(await (await fetch(source)).arrayBuffer());
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  view.setUint32(8, 12000);
  view.setUint32(12, 12000);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const chunks: Uint8Array[] = [raw.subarray(0, 33), chunk];
  let offset = 33;
  const rawView = new DataView(raw.buffer);
  while (offset + 12 <= raw.length) {
    const length = rawView.getUint32(offset);
    const end = offset + length + 12;
    const name = String.fromCharCode(...raw.subarray(offset + 4, offset + 8));
    if (name !== 'pHYs') chunks.push(raw.subarray(offset, end));
    offset = end;
  }
  const result = new Uint8Array(chunks.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of chunks) { result.set(part, cursor); cursor += part.length; }
  return new Blob([result.buffer], { type: 'image/png' });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function downloadStrip(source: string, name: string, format: 'png' | 'pdf') {
  if (format === 'png') {
    saveBlob(await pngBlob(source), `${exportFilename(name)}.png`);
  } else {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 150], compress: true });
    pdf.addImage(source, 'PNG', 0, 0, 50, 150);
    pdf.setProperties({ title: `${name} | Cabine 5 x 15 cm`, creator: 'Cabine' });
    pdf.save(`${exportFilename(name)}.pdf`);
  }
}

export function downloadTemplateGuide() {
  const canvas = document.createElement('canvas');
  canvas.width = STRIP_WIDTH; canvas.height = STRIP_HEIGHT;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fffdf8'; context.fillRect(0, 0, 600, 1800);
  context.textAlign = 'center'; context.fillStyle = '#465344'; context.font = '20px sans-serif';
  context.fillText('GUIA DE ARTE - 600 x 1800 px / 5 x 15 cm', 300, 64);
  for (let i = 0; i < 3; i++) {
    const y = PHOTO_Y + i * (PHOTO_HEIGHT + PHOTO_GAP);
    context.fillStyle = '#e5eadd'; context.fillRect(PADDING, y, PHOTO_WIDTH, PHOTO_HEIGHT);
    context.fillStyle = '#465344'; context.font = '34px sans-serif';
    context.fillText(`FOTO ${i + 1}`, 300, y + 184);
    context.font = '22px sans-serif'; context.fillText(`x: 36 / y: ${y} / 528 x 396 px`, 300, y + 229);
  }
  context.font = '26px sans-serif'; context.fillText('NOME, LOGO E DADOS DO EVENTO', 300, 1520);
  context.font = '20px sans-serif'; context.fillText('Área de personalização abaixo de y: 1332', 300, 1580);
  context.fillText('Para moldura: deixe as 3 áreas de foto transparentes.', 300, 1640);
  void pngBlob(canvas.toDataURL('image/png')).then((blob) => saveBlob(blob, 'cabine-guia-modelo-5x15.png'));
}

export const filterCss = (filter: FilterId) => FILTERS.find((item) => item.id === filter)?.css ?? 'none';