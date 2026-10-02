import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Camera, Check, ChevronDown, CircleHelp, Download, ExternalLink, Film, FolderOpen, LoaderCircle, LockKeyhole, Maximize2, RotateCcw, Share2, SlidersHorizontal, Sparkles, Square, SwitchCamera, Video } from 'lucide-react';
import type { BoothEvent } from '../types';
import { FILTERS } from '../types';
import { saveBlob } from '../lib/strip';
import { renderSlowMotionVideo, videoFilename, VIDEO_HEIGHT, VIDEO_WIDTH } from '../lib/video';
import { getStoredGDriveSettings, uploadToGoogleDrive } from '../lib/gdrive';

interface Video360StudioProps {
  event: BoothEvent;
  onBackToAdmin?: () => void;
  external?: boolean;
  notify: (message: string, kind?: 'success' | 'info' | 'error') => void;
}

type Stage = 'idle' | 'ready' | 'recording' | 'processing' | 'review';

export default function Video360Studio({ event, onBackToAdmin, external = false, notify }: Video360StudioProps) {
  const video = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const rawUrl = useRef('');
  const outputUrl = useRef('');
  const [stage, setStage] = useState<Stage>('idle');
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [elapsed, setElapsed] = useState(0);
  const [permissionError, setPermissionError] = useState('');
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [progress, setProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [gdriveUrl, setGdriveUrl] = useState<string | null>(null);
  const [uploadingGDrive, setUploadingGDrive] = useState(false);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    if (rawUrl.current) URL.revokeObjectURL(rawUrl.current);
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
  }, []);

  useEffect(() => {
    if (stage === 'ready' && video.current && stream.current && video.current.srcObject !== stream.current) {
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => undefined);
    }
  }, [stage]);

  async function enableCamera(nextFacing = facing) {
    stream.current?.getTracks().forEach((track) => track.stop());
    setPermissionError('');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('A câmera precisa de HTTPS. Abra o link publicado na Vercel para liberar o vídeo.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing }, width: { ideal: VIDEO_WIDTH }, height: { ideal: VIDEO_HEIGHT }, aspectRatio: { ideal: 9 / 16 } } });
      stream.current = media;
      const reported = media.getVideoTracks()[0]?.getSettings().facingMode;
      setFacing(reported === 'user' || reported === 'environment' ? reported : nextFacing);
      setStage('ready');
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setPermissionError(name === 'NotAllowedError' ? 'Permita o acesso à câmera nas configurações do navegador.' : error instanceof Error ? error.message : 'Não foi possível ativar a câmera.');
    }
  }

  function beginRecording() {
    if (!stream.current || !video.current?.videoWidth) { notify('Ative a câmera antes de começar.', 'info'); return; }
    if (!('MediaRecorder' in window)) { notify('Seu navegador não oferece suporte à gravação de vídeo.', 'error'); return; }
    const mime = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
    if (!mime) { notify('O formato de vídeo não é compatível neste navegador.', 'error'); return; }
    chunks.current = [];
    const mediaRecorder = new MediaRecorder(stream.current, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    recorder.current = mediaRecorder;
    mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks.current, { type: mime });
      setSourceBlob(blob);
      if (rawUrl.current) URL.revokeObjectURL(rawUrl.current);
      rawUrl.current = URL.createObjectURL(blob);
      setStage('processing');
      void processVideo(blob);
    };
    let seconds = 0;
    setElapsed(0); setStage('recording');
    mediaRecorder.start(250);
    timer.current = setInterval(() => {
      seconds += 1; setElapsed(seconds);
      if (seconds >= event.videoDuration) stopRecording();
    }, 1000);
  }

  function stopRecording() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  async function triggerGDriveUpload(videoBlob: Blob) {
    const gdriveSettings = getStoredGDriveSettings();
    if (gdriveSettings.enabled && gdriveSettings.autoUploadVideos) {
      setUploadingGDrive(true);
      try {
        const uploadResult = await uploadToGoogleDrive({
          blob: videoBlob,
          filename: videoFilename(event.name, videoBlob.type),
          mimeType: videoBlob.type || 'video/mp4',
          eventName: event.name,
        });
        if (uploadResult.success && uploadResult.fileUrl) {
          setGdriveUrl(uploadResult.fileUrl);
          notify('Vídeo 360 enviado automaticamente para o Google Drive!', 'success');
        }
      } catch (err) {
        console.warn('Falha no upload automático para Google Drive:', err);
      } finally {
        setUploadingGDrive(false);
      }
    }
  }

  async function processVideo(blob: Blob) {
    setProgress(0);
    setGdriveUrl(null);
    try {
      const result = await renderSlowMotionVideo(blob, event, setProgress);
      setOutputBlob(result.blob);
      if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
      outputUrl.current = URL.createObjectURL(result.blob);
      setStage('review');
      notify('Vídeo pronto. Os últimos 5 segundos ganharam slow motion.');
      void triggerGDriveUpload(result.blob);
    } catch (error) {
      setOutputBlob(blob);
      if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
      outputUrl.current = rawUrl.current;
      setStage('review');
      notify(error instanceof Error ? `${error.message} A gravação original está disponível.` : 'O vídeo original está disponível.', 'info');
      void triggerGDriveUpload(blob);
    }
  }

  function download() {
    const blob = outputBlob ?? sourceBlob;
    if (!blob) return;
    saveBlob(blob, videoFilename(event.name, blob.type));
    notify('Vídeo salvo no dispositivo.');
  }

  async function share() {
    const blob = outputBlob ?? sourceBlob;
    if (!blob) return;
    const file = new File([blob], videoFilename(event.name, blob.type), { type: blob.type });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try { await navigator.share({ files: [file], title: event.name, text: 'Um momento em 360. Feito na Cabine.' }); }
      catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Não foi possível compartilhar esse vídeo.', 'info'); }
    } else { saveBlob(blob, file.name); notify('Vídeo salvo. Compartilhe o arquivo pelo aplicativo que preferir.', 'info'); }
  }

  const playingUrl = outputUrl.current || rawUrl.current;
  return (
    <section className="video360-page" aria-label="Cabine de vídeo 360">
      <div className="video360-intro"><div><div className="intro-eyebrow"><span /> GIROU, GRAVOU, GUARDOU.</div><h1>Vídeo 360. <em>O momento em movimento.</em></h1><p>Uma experiência vertical para celebrar cada ângulo da sua festa.</p></div>{external && <button className="button button-outline video-exit" onClick={onBackToAdmin}><CircleHelp size={15} />Painel admin</button>}</div>
      <div className="video360-layout">
        <div className={`video360-stage-wrap ${fullscreen ? 'video-fullscreen' : ''}`}>
          <div className="video360-stage">
            {stage === 'idle' && <div className="video-idle"><Video size={48} strokeWidth={1.2} /><h2>Seu vídeo começa aqui.</h2><p>Ative a câmera para criar um vídeo vertical de {event.videoDuration} segundos, com slow motion no final.</p><button className="button start-button" onClick={() => void enableCamera()}><Camera size={17} />Ativar câmera<ChevronDown size={14} /></button></div>}
            <video ref={video} muted playsInline autoPlay className={`video-live ${stage === 'ready' || stage === 'recording' ? '' : 'is-hidden'} ${facing === 'user' ? 'mirrored' : ''}`} style={{ filter: FILTERS.find((filter) => filter.id === event.videoFilter)?.css }} />
            {stage === 'recording' && <div className="video-recording-ui"><span><i /> GRAVANDO</span><strong>{String(Math.max(0, event.videoDuration - elapsed)).padStart(2, '0')}s</strong><small>Gire devagar e aproveite o momento</small></div>}
            {stage === 'processing' && <div className="video-processing"><LoaderCircle size={35} className="spin" /><strong>Finalizando seu vídeo</strong><span>Aplicando filtro e slow motion... {Math.round(progress * 100)}%</span><div className="progress-bar"><i style={{ width: `${Math.max(3, progress * 100)}%` }} /></div></div>}
            {stage === 'review' && playingUrl && <video ref={preview} src={playingUrl} controls playsInline className="video-output" style={outputUrl.current === rawUrl.current ? { filter: FILTERS.find((filter) => filter.id === event.videoFilter)?.css } : undefined} />}
            <div className="video-stage-top"><span><Film size={14} />{event.name}</span><button onClick={() => setFullscreen(!fullscreen)} aria-label={fullscreen ? 'Sair da tela cheia' : 'Expandir vídeo'}>{fullscreen ? <ChevronDown size={16} /> : <Maximize2 size={16} />}</button></div>
            {stage !== 'idle' && <div className="video-stage-bottom"><span><LockKeyhole size={12} />Prévia privada neste dispositivo</span><span>9:16 · {VIDEO_WIDTH} x {VIDEO_HEIGHT}</span></div>}
          </div>
        </div>
        <aside className="video360-controls"><div className="video-control-heading"><div><span className="eyebrow">CONFIGURAÇÃO DO EVENTO</span><h2>{event.name}</h2></div><span className="video-mode-mark"><Sparkles size={14} />360</span></div><div className="video-spec-list"><div><span>Duração do vídeo</span><strong>{event.videoDuration} segundos</strong></div><div><span>Final</span><strong>5 segundos em slow motion</strong></div><div><span>Formato</span><strong>Vertical · 9:16</strong></div></div><div className="video-filter-picked"><span>Filtro aplicado</span><strong>{FILTERS.find((filter) => filter.id === event.videoFilter)?.label}</strong></div><div className="video-control-actions">{stage === 'idle' && <button className="button button-dark full-width" onClick={() => void enableCamera()}><Camera size={16} />Ativar câmera</button>}{stage === 'ready' && <><button className="button button-dark full-width" onClick={beginRecording}><Video size={16} />Começar vídeo</button><button className="button button-outline full-width" onClick={() => void enableCamera(facing === 'user' ? 'environment' : 'user')}><SwitchCamera size={16} />Trocar câmera</button></>}{stage === 'recording' && <button className="button button-cancel full-width" onClick={stopRecording}><Square size={15} />Finalizar agora</button>}{stage === 'processing' && <p className="video-wait-note"><LoaderCircle size={14} className="spin" />Não feche esta tela.</p>}{stage === 'review' && (
  <>
    <button className="button button-dark full-width" onClick={download}>
      <ArrowDownToLine size={16} />
      Baixar vídeo
    </button>
    <div className="video-buttons-row">
      <button className="button button-outline" onClick={() => void share()}>
        <Share2 size={15} />
        Enviar
      </button>
      <button
        className="button button-outline"
        onClick={() => {
          setSourceBlob(null);
          setOutputBlob(null);
          if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
          outputUrl.current = '';
          setGdriveUrl(null);
          setStage('ready');
        }}
      >
        <RotateCcw size={15} />
        Refazer
      </button>
    </div>
    {gdriveUrl && (
      <a
        href={gdriveUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="button button-outline gdrive-link-btn full-width"
        title="Abrir no Google Drive"
      >
        <FolderOpen size={15} />
        <span>Abrir no Google Drive</span>
        <ExternalLink size={13} />
      </a>
    )}
    {uploadingGDrive && (
      <div className="gdrive-uploading-tag">
        <LoaderCircle size={13} className="spin" />
        <span>Salvando no Google Drive...</span>
      </div>
    )}
  </>
)}</div><p className="video-note"><CircleHelp size={13} />A gravação não usa áudio. Use o botão de som do dispositivo para a trilha sonora do evento.</p>{permissionError && <p className="error-message" role="alert">{permissionError}</p>}<div className="video-privacy"><LockKeyhole size={14} /><span>O vídeo só sai deste dispositivo quando você tocar em baixar ou enviar.</span></div></aside>
      </div>
      <div className="video360-footer"><span><SlidersHorizontal size={14} />Personalização definida no painel admin</span><span><Check size={14} />Slow motion final automático</span><span><Download size={14} />Arquivo vertical pronto para redes sociais</span></div>
    </section>
  );
}