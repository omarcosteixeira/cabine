import { filterCss, loadImage } from './strip';
import type { BoothEvent, FilterId } from '../types';

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;

function mimeType() {
  const options = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return options.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) ?? '';
}

function drawVerticalCover(context: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number) {
  const scale = Math.max(VIDEO_WIDTH / width, VIDEO_HEIGHT / height);
  const cropWidth = VIDEO_WIDTH / scale;
  const cropHeight = VIDEO_HEIGHT / scale;
  context.drawImage(source, (width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
}

function drawOverlay(context: CanvasRenderingContext2D, event: BoothEvent, logo: HTMLImageElement | undefined, template: HTMLImageElement | undefined, filter: FilterId) {
  context.fillStyle = '#1822187d';
  context.fillRect(0, 0, VIDEO_WIDTH, 122);
  context.fillStyle = '#fffaf0';
  context.textAlign = 'center';
  context.font = '600 26px "DM Sans", sans-serif';
  context.fillText(event.name.toUpperCase().slice(0, 42), VIDEO_WIDTH / 2, 62);
  context.font = '500 20px "DM Sans", sans-serif';
  context.fillText('360 VIDEO', VIDEO_WIDTH / 2, 94);
  if (logo) {
    const scale = Math.min(165 / logo.naturalWidth, 110 / logo.naturalHeight);
    const width = logo.naturalWidth * scale;
    const height = logo.naturalHeight * scale;
    context.drawImage(logo, (VIDEO_WIDTH - width) / 2, VIDEO_HEIGHT - 185 - height, width, height);
  }
  context.fillStyle = event.color;
  context.fillRect(VIDEO_WIDTH / 2 - 48, VIDEO_HEIGHT - 42, 96, 4);
  if (template && event.templateLayer === 'overlay') context.drawImage(template, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  if (filter === 'color') return;
}

export async function renderSlowMotionVideo(source: Blob, event: BoothEvent, onProgress?: (value: number) => void) {
  if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) throw new Error('Este navegador não consegue processar o vídeo automaticamente. Baixe a gravação original ou tente no Chrome/Safari atualizado.');
  const mime = mimeType();
  if (!mime) throw new Error('O formato de vídeo deste navegador não pode ser exportado.');
  const url = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const logo = event.logo ? await loadImage(event.logo) : undefined;
  const template = event.template ? await loadImage(event.template) : undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Não foi possível ler a gravação para aplicar o slow motion.'));
      video.load();
    });
    const canvas = document.createElement('canvas');
    canvas.width = VIDEO_WIDTH;
    canvas.height = VIDEO_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Não foi possível preparar o vídeo vertical.');
    const output = canvas.captureStream(30);
    const recorder = new MediaRecorder(output, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    const result = new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });
    const duration = Math.min(event.videoDuration, video.duration || event.videoDuration);
    const slowStart = Math.max(0, duration - 5);
    let animation = 0;
    let began = performance.now();
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      const current = video.currentTime;
      const slow = current >= slowStart;
      video.playbackRate = slow ? 0.35 : 1;
      context.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      if (template && event.templateLayer === 'background') context.drawImage(template, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      context.filter = filterCss(event.videoFilter);
      drawVerticalCover(context, video, video.videoWidth || VIDEO_WIDTH, video.videoHeight || VIDEO_HEIGHT);
      context.filter = 'none';
      drawOverlay(context, event, logo, template, event.videoFilter);
      onProgress?.(Math.min(1, current / duration));
      if (video.ended || current >= duration - 0.02) {
        stopped = true;
        cancelAnimationFrame(animation);
        recorder.stop();
        output.getTracks().forEach((track) => track.stop());
        return;
      }
      if (performance.now() - began > (duration + 18) * 1000) {
        stopped = true;
        cancelAnimationFrame(animation);
        recorder.stop();
        output.getTracks().forEach((track) => track.stop());
        return;
      }
      animation = requestAnimationFrame(draw);
    };
    recorder.start(250);
    await video.play();
    began = performance.now();
    animation = requestAnimationFrame(draw);
    const rendered = await result;
    onProgress?.(1);
    return { blob: rendered, mime };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function videoFilename(name: string, mime = 'video/webm') {
  const safe = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'memoria';
  return `cabine-${safe}-360-${VIDEO_WIDTH}x${VIDEO_HEIGHT}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
}