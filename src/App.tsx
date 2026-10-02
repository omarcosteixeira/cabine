import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  ArrowDownToLine, ArrowRight, CalendarDays, Camera, Check, CheckCircle2, ChevronDown,
  CircleHelp, Clock3, Copy, Download, ExternalLink, FileImage, FileText, FolderOpen, Image, Images, Leaf, LoaderCircle,
  Link, LockKeyhole, Maximize2, Minimize2, MonitorPlay, Pencil, Plus, Printer, RotateCcw,
  Search, Share2, SlidersHorizontal, Sparkles, Square, SwitchCamera, Trash2,
  Video, Volume2, VolumeX, X,
} from 'lucide-react';
import Modal from './components/Modal';
import PhotoStrip, { Flower } from './components/PhotoStrip';
import EventEditor from './components/EventEditor';
import Video360Studio from './components/Video360Studio';
import AdminGate, { adminUnlocked, lockAdmin } from './components/AdminGate';
import SettingsView from './components/SettingsView';
import { firebaseReady, missingFirebaseKeys } from './lib/firebase';
import { getStoredGDriveSettings, uploadToGoogleDrive } from './lib/gdrive';
import { SEED_EVENT, storage, storageMode } from './lib/storage';
import { downloadStrip, drawCover, exportFilename, filterCss, pngBlob, saveBlob, renderStrip } from './lib/strip';
import { DEFAULT_EVENT, DEMO_PHOTOS, FILTERS, eventDate, linkedEventId, makeEventLink, makeId, normalizeEvent, readEventFromLink, type BoothEvent, type CameraMode, type FilterId, type PhotoSession, type SessionStage } from './types';

type Tab = 'admin' | 'booth' | 'gallery' | 'settings';
type ModalName = 'help' | 'camera' | 'export' | 'event-picker' | 'event-editor' | 'event-link' | 'gallery-detail' | null;
type Toast = { id: number; message: string; kind: 'success' | 'info' | 'error' };
type Confirm = { title: string; message: string; action: () => Promise<void> };

function rememberedEvent() {
  try { return localStorage.getItem('cabine-active-event') ?? DEFAULT_EVENT.id; }
  catch { return DEFAULT_EVENT.id; }
}

function Brand({ small = false }: { small?: boolean }) {
  return <span className={`brand ${small ? 'brand-small' : ''}`}><span className="brand-mark"><Camera size={small ? 19 : 25} strokeWidth={1.7} /><i /></span><span>cabine<span className="brand-dot">.</span></span></span>;
}

export default function App() {
  const [externalEvent, setExternalEvent] = useState<BoothEvent | null>(() => readEventFromLink());
  const [linkFetch, setLinkFetch] = useState<string | null>(() => (readEventFromLink() ? null : linkedEventId()));
  const [unlocked, setUnlocked] = useState(adminUnlocked);
  const isExternal = externalEvent !== null;
  const [tab, setTab] = useState<Tab>(() => (readEventFromLink() || linkedEventId()) ? 'booth' : 'admin');
  const [events, setEvents] = useState<BoothEvent[]>([DEFAULT_EVENT]);
  const [eventId, setEventId] = useState(rememberedEvent);
  const [sessions, setSessions] = useState<PhotoSession[]>([]);
  const [filter, setFilter] = useState<FilterId>('color');
  const [mode, setMode] = useState<CameraMode>('preview');
  const [stage, setStage] = useState<SessionStage>('idle');
  const [photos, setPhotos] = useState<string[]>([]);
  const [pose, setPose] = useState(0);
  const [countdown, setCountdown] = useState(10);
  const [flash, setFlash] = useState(false);
  const [sound, setSound] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const facingRef = useRef(facing);
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [editingEvent, setEditingEvent] = useState<BoothEvent>();
  const [linkEvent, setLinkEvent] = useState<BoothEvent | null>(null);
  const [detailSession, setDetailSession] = useState<PhotoSession | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [generated, setGenerated] = useState<{ source: string; name: string } | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [exportTarget, setExportTarget] = useState<{ source: string; name: string; demo: boolean } | null>(null);
  const [exportFormat, setExportFormat] = useState<'png' | 'pdf'>('png');
  const [exporting, setExporting] = useState(false);
  const [printSource, setPrintSource] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [sessionCreated, setSessionCreated] = useState('');
  const [sessionDemo, setSessionDemo] = useState(false);
  const [savedAction, setSavedAction] = useState(false);
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryEvent, setGalleryEvent] = useState('all');

  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundRef = useRef(sound);
  const stageRef = useRef(stage);
  const cameraRequest = useRef(0);
  const autoStartCamera = useRef(false);
  const storageWarning = useRef(false);
  const printImage = useRef<HTMLImageElement>(null);
  soundRef.current = sound;
  stageRef.current = stage;
  facingRef.current = facing;

  const activeEvent = externalEvent ?? events.find((event) => event.id === eventId) ?? events[0] ?? DEFAULT_EVENT;
  const currentStep = stage === 'review' ? savedAction ? 2 : 1 : 0;
  const shownPhoto = stage === 'review' && photos[2] ? photos[2] : mode === 'demo' && stage === 'capturing' ? DEMO_PHOTOS[Math.min(pose, 2)] : DEMO_PHOTOS[0];

  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    setToast({ id: Date.now(), message, kind });
  }, []);

  const stopCamera = useCallback(() => {
    cameraRequest.current += 1;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraReady(false);
    setCameraLoading(false);
  }, []);

  // A shared booth link with only an event id resolves it from Firestore.
  useEffect(() => {
    if (!linkFetch) return;
    let alive = true;
    void storage.getEvent(linkFetch).then((event) => {
      if (!alive) return;
      if (event) setExternalEvent(event);
      else {
        // A broken link should never stop a party: the booth opens with the
        // basic template and the organizer can send a fresh link.
        setExternalEvent(normalizeEvent({ id: linkFetch, name: 'Cabine do evento', tagline: 'modo sem conexão' }));
        notify('Não foi possível ler este evento no banco de dados. A cabine abriu em modo básico.', 'info');
      }
      setLinkFetch(null);
    });
    return () => { alive = false; };
  }, [linkFetch, notify]);

  useEffect(() => {
    if (!unlocked || isExternal) return;
    let alive = true;
    Promise.all([storage.getEvents(), storage.getSessions()]).then(([savedEvents, savedSessions]) => {
      if (!alive) return;
      if (savedEvents.length) {
        setEvents(savedEvents);
        const selected = rememberedEvent();
        setEventId(savedEvents.some((event) => event.id === selected) ? selected : savedEvents[0].id);
      } else if (storageMode === 'firebase') {
        void storage.saveEvent({ ...SEED_EVENT, id: `evento-${makeId().slice(0, 8)}` }).catch(() => undefined);
      } else {
        void storage.saveEvent(DEFAULT_EVENT).catch(() => undefined);
      }
      setSessions(savedSessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }).catch(() => {
      if (alive) notify('Não foi possível ler o banco de dados. Os eventos deste navegador continuam disponíveis.', 'info');
      storageWarning.current = true;
    });
    return () => { alive = false; };
  }, [isExternal, notify, unlocked]);

  useEffect(() => {
    try { localStorage.setItem('cabine-active-event', eventId); } catch { /* Private browsing can disable localStorage. */ }
  }, [eventId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const afterPrint = () => setPrintSource('');
    window.addEventListener('afterprint', afterPrint);
    return () => window.removeEventListener('afterprint', afterPrint);
  }, []);

  useEffect(() => {
    if (mode === 'live' && tab === 'booth' && video.current && stream.current && video.current.srcObject !== stream.current) {
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => undefined);
    }
  }, [mode, tab]);

  useEffect(() => {
    let alive = true;
    if (stage === 'capturing' || activeEvent.mode === 'video360') return;
    setIsRendering(true);
    setGenerated(null);
    setShareFile(null);
    const sourcePhotos = photos.length === 3 ? photos : DEMO_PHOTOS;
    renderStrip(sourcePhotos, activeEvent, filter).then(async (source) => {
      if (!alive) return;
      setGenerated({ source, name: activeEvent.name });
      setIsRendering(false);
      const blob = await pngBlob(source);
      if (!alive) return;
      setShareFile(new File([blob], `${exportFilename(activeEvent.name)}.png`, { type: 'image/png' }));
      if (stage === 'review' && photos.length === 3 && sessionId) {
        let gdriveUrl: string | undefined;
        const gdriveSettings = getStoredGDriveSettings();
        if (gdriveSettings.enabled && gdriveSettings.autoUploadStrips) {
          try {
            const gdriveRes = await uploadToGoogleDrive({
              blob,
              filename: `${exportFilename(activeEvent.name)}.png`,
              mimeType: 'image/png',
              eventName: activeEvent.name,
            });
            if (gdriveRes.success && gdriveRes.fileUrl) {
              gdriveUrl = gdriveRes.fileUrl;
              notify('Tirinha salva automaticamente no Google Drive!', 'success');
            }
          } catch (err) {
            console.warn('Falha no upload para o Google Drive:', err);
          }
        }

        const record: PhotoSession = {
          id: sessionId,
          eventId: activeEvent.id,
          eventName: activeEvent.name,
          createdAt: sessionCreated,
          filter,
          photos: [...photos],
          strip: source,
          demo: sessionDemo,
          gdriveUrl,
        };
        setSessions((previous) => [record, ...previous.filter((item) => item.id !== record.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        try { await storage.saveSession(record); }
        catch {
          if (!storageWarning.current) {
            notify('A tirinha foi guardada neste dispositivo, mas o envio ao banco de dados falhou. Baixe o arquivo para não perdê-la.', 'info');
            storageWarning.current = true;
          }
        }
      }
    }).catch((error: unknown) => {
      if (alive) {
        setIsRendering(false);
        notify(error instanceof Error ? error.message : 'Não foi possível montar a tirinha.', 'error');
      }
    });
    return () => { alive = false; };
  }, [activeEvent, photos, filter, stage, sessionId, sessionCreated, sessionDemo, notify]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    void audio.current?.close();
  }, []);

  const cancelCapture = useCallback((message = 'Sessão cancelada. Quando quiser, a gente tenta de novo.') => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setStage('idle');
    setPhotos([]);
    setPose(0);
    setCountdown(10);
    setFlash(false);
    setExpanded(false);
    notify(message, 'info');
  }, [notify]);

  useEffect(() => {
    function visibilityChanged() {
      if (document.hidden && stageRef.current === 'capturing') cancelCapture('A sessão foi interrompida ao sair da tela. Volte e comece uma nova sequência.');
      if (document.hidden) { stopCamera(); setMode((previous) => previous === 'live' ? 'preview' : previous); }
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => document.removeEventListener('visibilitychange', visibilityChanged);
  }, [cancelCapture, stopCamera]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape); };
  }, [expanded]);

  function playTone(frequency: number, duration: number, volume = 0.05) {
    if (!soundRef.current || !audio.current || audio.current.state !== 'running') return;
    const oscillator = audio.current.createOscillator();
    const gain = audio.current.createGain();
    oscillator.connect(gain); gain.connect(audio.current.destination);
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audio.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.current.currentTime + duration);
    oscillator.start(); oscillator.stop(audio.current.currentTime + duration);
  }

  function prepareAudio() {
    if (!soundRef.current) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => undefined);
    } catch { /* A silent session still works if Web Audio is unavailable. */ }
  }

  function toggleSound() {
    const next = !sound;
    soundRef.current = next;
    setSound(next);
    if (next) prepareAudio();
  }

  function capturePhoto() {
    if (!video.current?.videoWidth || !video.current.videoHeight || stream.current?.getVideoTracks()[0]?.readyState !== 'live') throw new Error('A câmera foi desconectada. Ative-a novamente para fotografar.');
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 900;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível capturar a imagem.');
    if (facingRef.current === 'user') { context.translate(canvas.width, 0); context.scale(-1, 1); }
    drawCover(context, video.current, video.current.videoWidth, video.current.videoHeight, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.94);
  }

  function beginCapture(captureMode: 'live' | 'demo') {
    if (timer.current) clearInterval(timer.current);
    if (captureMode === 'live' && !video.current?.videoWidth) { notify('Espere a câmera ficar pronta para começar.', 'info'); return; }
    if (captureMode === 'demo') stopCamera();
    setMode(captureMode);
    setStage('capturing'); stageRef.current = 'capturing';
    setPhotos([]); setPose(0); setCountdown(10); setSavedAction(false);
    setSessionId(makeId()); setSessionCreated(new Date().toISOString()); setSessionDemo(captureMode === 'demo');
    setGenerated(null); setShareFile(null);
    prepareAudio();
    let index = 0;
    let deadline = performance.now() + 10000;
    let lastSecond = 10;
    timer.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      if (remaining !== lastSecond) {
        setCountdown(remaining);
        lastSecond = remaining;
        if (remaining > 0 && remaining <= 3) playTone(720, 0.12);
      }
      if (remaining > 0) return;
      try {
        const shot = captureMode === 'demo' ? DEMO_PHOTOS[index] : capturePhoto();
        setPhotos((previous) => [...previous, shot]);
        setFlash(true);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(false), 180);
        playTone(1050, 0.18, 0.08);
        index += 1;
        if (index === 3) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          setPose(2); setStage('review'); stageRef.current = 'review'; setExpanded(false);
          notify(captureMode === 'demo' ? 'Demonstração concluída! Experimente os filtros na sua tirinha de exemplo.' : 'Três poses, uma boa memória. Sua tirinha está pronta!');
        } else {
          setPose(index); setCountdown(10); lastSecond = 10;
          deadline = performance.now() + 10000;
        }
      } catch (error) {
        cancelCapture(error instanceof Error ? error.message : 'A captura foi interrompida. Tente novamente.');
        stopCamera(); setMode('preview');
      }
    }, 100);
  }

  async function activateCamera(nextFacing: 'user' | 'environment' = facing, start = false) {
    if (start) prepareAudio();
    stopCamera();
    const requestId = ++cameraRequest.current;
    setCameraLoading(true); setCameraError('');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('A câmera precisa de uma conexão HTTPS. Abra o endereço publicado na Vercel, no Safari ou Chrome, e tente novamente.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing }, width: { ideal: 1920 }, height: { ideal: 1440 }, aspectRatio: { ideal: 4 / 3 } } });
      if (requestId !== cameraRequest.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const reportedFacing = media.getVideoTracks()[0]?.getSettings().facingMode;
      const actualFacing = reportedFacing === 'environment' || reportedFacing === 'user' ? reportedFacing : nextFacing;
      facingRef.current = actualFacing;
      setFacing(actualFacing); setMode('live');
      if (!video.current) throw new Error('Abra a aba Cabine antes de ativar a câmera.');
      video.current.srcObject = media;
      await video.current.play();
      if (requestId !== cameraRequest.current) return;
      setCameraReady(true); setCameraLoading(false); setModal(null);
      if (start) beginCapture('live');
      else notify('Câmera pronta. Agora é só caprichar na pose!');
    } catch (error) {
      if (requestId !== cameraRequest.current) return;
      stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
      setMode('preview'); setCameraReady(false); setCameraLoading(false);
      const name = error instanceof DOMException ? error.name : '';
      const message = name === 'NotAllowedError' ? 'O acesso à câmera não foi permitido. Libere a câmera nas configurações do navegador. Se estiver em uma prévia incorporada, abra o app em uma nova aba.' : name === 'NotFoundError' ? 'Nenhuma câmera foi encontrada neste dispositivo. Você pode testar a demonstração.' : name === 'NotReadableError' ? 'A câmera pode estar sendo usada por outro aplicativo. Feche-o e tente novamente.' : error instanceof Error ? error.message : 'Não foi possível ativar a câmera. Tente novamente.';
      setCameraError(message);
    }
  }

  function openCamera(start: boolean) {
    if (stage === 'capturing') return;
    autoStartCamera.current = start; setCameraError(''); setModal('camera');
  }

  function startSession() {
    prepareAudio();
    if (mode === 'live' && cameraReady) beginCapture('live');
    else if (mode === 'demo') beginCapture('demo');
    else openCamera(true);
  }

  function closeModal() {
    if (exporting) return;
    if (modal === 'camera' && cameraLoading) { cameraRequest.current += 1; setCameraLoading(false); }
    setModal(null);
  }

  function changeTab(next: Tab) {
    if (stage === 'capturing') { notify('Termine ou cancele a sequência antes de sair da cabine.', 'info'); return; }
    if (next !== 'booth') { stopCamera(); setMode((previous) => previous === 'live' ? 'preview' : previous); }
    setTab(next); setExpanded(false);
  }

  function leaveExternal() {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setExternalEvent(null);
    setTab('admin');
  }

  function openEventLink(event: BoothEvent) {
    window.open(makeEventLink(event), '_blank', 'noopener,noreferrer');
  }

  async function copyEventLink(event: BoothEvent) {
    const link = makeEventLink(event);
    try {
      await navigator.clipboard.writeText(link);
      notify('Link do evento copiado. Envie para o tablet ou computador da cabine.');
    } catch {
      setLinkEvent(event);
      setModal('event-link');
      notify('Copie o link diretamente na janela do evento.', 'info');
    }
  }

  function selectEvent(id: string) {
    if (stage === 'capturing') return;
    setEventId(id); setPhotos([]); setStage('idle'); setSessionId(''); setSavedAction(false); setFilter('color');
    setTab('booth'); setModal(null);
  }

  function editEvent(event?: BoothEvent) {
    if (stage === 'capturing') { notify('Termine a sequência antes de personalizar o evento.', 'info'); return; }
    setEditingEvent(event); setModal('event-editor');
  }

  async function saveEvent(event: BoothEvent) {
    let synced = true;
    try {
      synced = await storage.saveEvent(event);
    } catch {
      synced = false;
      storageWarning.current = true;
    }
    setEvents((previous) => [...previous.filter((item) => item.id !== event.id), event]);
    const isEditingActive = event.id === eventId;
    const isNewEvent = !editingEvent;
    setEventId(event.id); setTab('admin'); setModal(null);
    if (!isEditingActive) { setPhotos([]); setStage('idle'); setSessionId(''); setSavedAction(false); }
    if (isNewEvent) { setLinkEvent(event); setModal('event-link'); }
    if (!synced) notify(storageMode === 'firebase' ? 'Evento salvo neste navegador, mas o Firebase recusou a gravação. Verifique a conexão e as regras do Firestore.' : 'Evento salvo apenas neste navegador. Configure o Firebase para sincronizar com outros dispositivos.', 'info');
    else if (isNewEvent) notify('Evento criado e salvo no banco. Copie o link para abrir a cabine em outro dispositivo.');
    else notify('Modelo atualizado no banco de dados. Ficou com a cara da sua festa!');
  }

  function openExport(source = generated?.source, name = activeEvent.name, demo = photos.length !== 3 || sessionDemo) {
    if (!source) { notify('Só um instante. Estamos preparando a tirinha.', 'info'); return; }
    setExportTarget({ source, name, demo }); setExportFormat('png'); setModal('export');
  }

  async function exportCurrent() {
    if (!exportTarget) return;
    setExporting(true);
    try {
      await downloadStrip(exportTarget.source, exportTarget.name, exportFormat);
      setModal(null); setSavedAction(true);
      notify(exportFormat === 'pdf' ? 'PDF pronto: uma página de exatamente 5 x 15 cm.' : 'Tirinha baixada em alta resolução. Guarde essa memória!');
    } catch { notify('Não foi possível baixar. Tente novamente ou escolha outro formato.', 'error'); }
    finally { setExporting(false); }
  }

  async function printStrip(source = generated?.source) {
    if (!source) { notify('A tirinha ainda está ficando pronta.', 'info'); return; }
    flushSync(() => setPrintSource(source));
    try {
      if (printImage.current && !printImage.current.complete) await printImage.current.decode();
      window.print(); setSavedAction(true);
    } catch {
      notify('A impressão não está disponível nesta janela. Baixe o PDF e imprima pelo sistema do dispositivo.', 'info');
    }
  }

  async function shareStrip() {
    if (!shareFile) { notify('Espere a tirinha ficar pronta para compartilhar.', 'info'); return; }
    if (navigator.canShare?.({ files: [shareFile] }) && navigator.share) {
      try { await navigator.share({ files: [shareFile], title: activeEvent.name, text: 'Um momento para guardar. Feito na Cabine.' }); setSavedAction(true); }
      catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Não foi possível compartilhar. Você pode baixar a tirinha e enviá-la pelo aplicativo que preferir.', 'info'); }
    } else {
      saveBlob(shareFile, shareFile.name);
      notify('Tirinha baixada! Neste navegador, envie o arquivo pelo aplicativo que preferir.', 'info');
      setSavedAction(true);
    }
  }

  function deleteEvent(event: BoothEvent) {
    if (events.length === 1 && event.id === DEFAULT_EVENT.id) { notify('Crie um novo evento antes de remover o modelo de exemplo.', 'info'); return; }
    setConfirm({ title: 'Excluir este evento?', message: `O modelo de “${event.name}” será removido. As tirinhas já salvas continuam na galeria.`, action: async () => {
      try { await storage.deleteEvent(event.id); } catch (error) { if (!storageWarning.current) throw error; }
      const remaining = events.filter((item) => item.id !== event.id);
      if (!remaining.length) { remaining.push(DEFAULT_EVENT); await storage.saveEvent(DEFAULT_EVENT).catch(() => undefined); }
      setEvents(remaining);
      if (event.id === eventId) selectEvent(remaining[0].id);
      notify('Evento excluído. As suas memórias continuam guardadas.');
    } });
  }

  function deleteSession(session: PhotoSession) {
    setConfirm({ title: 'Apagar esta lembrança?', message: 'Esta sessão será removida da galeria deste dispositivo. Os arquivos que você já baixou não serão apagados.', action: async () => {
      try { await storage.deleteSession(session.id); } catch (error) { if (!storageWarning.current) throw error; }
      setSessions((previous) => previous.filter((item) => item.id !== session.id));
      if (session.id === sessionId) { setPhotos([]); setStage('idle'); setSessionId(''); }
      setModal(null); setDetailSession(null); notify('Sessão removida da galeria.');
    } });
  }

  const gallerySessions = useMemo(() => sessions.filter((session) => (galleryEvent === 'all' || session.eventId === galleryEvent) && session.eventName.toLocaleLowerCase('pt-BR').includes(gallerySearch.toLocaleLowerCase('pt-BR'))), [sessions, galleryEvent, gallerySearch]);
  const galleryEvents = useMemo(() => Array.from(new Map(sessions.map((session) => [session.eventId, session.eventName] as const)).entries()), [sessions]);

  if (linkFetch) {
    return (
      <div className="gate-screen">
        <div className="gate-card gate-loading"><LoaderCircle size={26} className="spin" /><h1>Preparando sua cabine</h1><p>Carregando as configurações do evento...</p></div>
      </div>
    );
  }

  if (!unlocked && !isExternal) {
    return <AdminGate cloudReady={firebaseReady} missingKeys={missingFirebaseKeys} onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <header className="site-header">
          <div className="header-inner">
            <button className="brand-button" aria-label="Cabine, ir para o painel admin" onClick={() => isExternal ? leaveExternal() : changeTab('admin')}><Brand /></button>
            {isExternal ? <div className="external-event-header"><span><Link size={14} />CABINE COMPARTILHADA</span><strong>{activeEvent.name}</strong></div> : <nav className="main-nav" aria-label="Navegação principal">
              <button className={tab === 'admin' ? 'active' : ''} onClick={() => changeTab('admin')} aria-current={tab === 'admin' ? 'page' : undefined}><LockKeyhole size={16} />Admin</button>
              <button className={tab === 'booth' ? 'active' : ''} onClick={() => changeTab('booth')} aria-current={tab === 'booth' ? 'page' : undefined}><Camera size={16} />Cabine</button>
              <button className={tab === 'gallery' ? 'active' : ''} onClick={() => changeTab('gallery')} aria-current={tab === 'gallery' ? 'page' : undefined}><Images size={16} />Galeria</button>
              <button className={tab === 'settings' ? 'active' : ''} onClick={() => changeTab('settings')} aria-current={tab === 'settings' ? 'page' : undefined}><SlidersHorizontal size={16} />Configurações</button>
            </nav>}
            <div className="header-actions">{isExternal ? <button className="button button-outline create-event" onClick={leaveExternal}><LockKeyhole size={15} /><span>Painel admin</span></button> : <><span className={`cloud-badge ${firebaseReady ? 'cloud-on' : 'cloud-off'}`} title={firebaseReady ? 'Eventos sincronizados no Firestore' : 'Firebase não configurado: dados apenas neste navegador'}><i />{firebaseReady ? 'Firebase' : 'Local'}</span><button className="help-button" onClick={() => setModal('help')} disabled={stage === 'capturing'}><CircleHelp size={16} /><span>Como funciona</span></button><button className="button button-outline create-event" onClick={() => editEvent()}><Plus size={16} /><span>Criar evento</span></button><button className="icon-button lock-button" onClick={() => { lockAdmin(); setUnlocked(false); setTab('admin'); }} title="Bloquear o painel admin" aria-label="Bloquear o painel admin"><LockKeyhole size={17} /></button></>}</div>
          </div>
        </header>

        <main className="main-container">
          <AnimatePresence mode="wait">
            {tab === 'booth' && activeEvent.mode === 'video360' && <motion.div key="video360" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.32 }}><Video360Studio event={activeEvent} external={isExternal} onBackToAdmin={leaveExternal} notify={notify} /></motion.div>}

            {tab === 'booth' && activeEvent.mode === 'booth' && <motion.div key="booth" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.32 }}>
              <section className="page-intro">
                <div><div className="intro-eyebrow"><span /> FEITO PARA VIVER. E REVIVER.</div><h1>Cabine de <em>boas memórias.</em></h1><p>Junte sua turma, faça uma pose e deixe o resto com a gente.</p></div>
                <button className="active-event" onClick={() => stage !== 'capturing' && setModal('event-picker')} disabled={stage === 'capturing'} aria-haspopup="dialog"><span className="event-icon"><CalendarDays size={20} strokeWidth={1.5} /></span><span className="active-event-copy"><span>SEU EVENTO</span><strong>{activeEvent.name}</strong></span><ChevronDown size={16} /></button>
              </section>

              <div className="studio-layout">
                <section className="capture-column" aria-label="Cabine de fotos">
                  <ol className="steps" aria-label="Etapas da sessão">{['Faça suas poses', 'Escolha o filtro', 'Guarde a memória'].map((label, index) => <li key={label} className={`${index === currentStep ? 'current' : ''} ${index < currentStep ? 'done' : ''}`}><span className="step-number">{index < currentStep ? <Check size={12} /> : `0${index + 1}`}</span><span>{label}</span>{index < 2 && <i />}</li>)}</ol>
                  <div className={`capture-region ${expanded ? 'expanded-camera' : ''}`}>
                    <div className="camera-stage">
                      <motion.img key={shownPhoto} className={`camera-demo-image ${mode === 'live' && stage !== 'review' ? 'is-hidden' : ''}`} src={shownPhoto} alt={stage === 'review' && photos[2] ? 'Sua terceira pose capturada' : 'Três amigos aproveitando um momento na cabine de fotos'} aria-hidden={mode === 'live' && stage !== 'review'} initial={{ scale: 1.035, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.65 }} style={{ filter: filterCss(filter) }} />
                      <video ref={video} muted playsInline autoPlay className={`camera-video ${mode === 'live' && stage !== 'review' ? '' : 'is-hidden'} ${facing === 'user' ? 'mirrored' : ''}`} onLoadedMetadata={() => setCameraReady(true)} style={{ filter: filterCss(filter) }} aria-label="Imagem ao vivo da câmera" aria-hidden={mode !== 'live' || stage === 'review'} />
                      <div className="camera-shade" />
                      <div className="camera-topbar"><span className="camera-status">{stage === 'review' ? <CheckCircle2 size={13} /> : mode === 'live' ? <span className="live-dot" /> : mode === 'demo' ? <MonitorPlay size={13} /> : <Image size={13} />}<span>{stage === 'review' ? 'Sessão concluída' : mode === 'live' ? 'Câmera ao vivo' : mode === 'demo' ? 'Modo demonstração' : 'Prévia da cabine'}</span></span><button className="camera-expand" onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Sair da tela cheia' : 'Expandir câmera'}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div>
                      <div className="viewfinder" aria-hidden="true"><i /><i /><i /><i /></div>
                      <AnimatePresence>{stage === 'capturing' && <motion.div className="countdown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><span className="countdown-label">SUA POSE {pose + 1} DE 3</span><motion.strong key={`${pose}-${countdown}`} initial={{ opacity: 0, scale: 1.16 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>{countdown || <Camera size={72} />}</motion.strong><span className="countdown-hint">{countdown <= 3 ? 'Sorria!' : pose === 0 ? 'Encontre sua melhor pose.' : 'Hora de uma pose diferente!'}</span></motion.div>}</AnimatePresence>
                      <div className="pose-indicators" aria-label={`${photos.length} de 3 fotos capturadas`}>{[0, 1, 2].map((index) => <span key={index} className={`${photos[index] ? 'captured' : ''} ${stage === 'capturing' && index === pose ? 'next-pose' : ''}`}>{photos[index] ? <Check size={12} /> : index + 1}</span>)}</div>
                      <AnimatePresence>{flash && <motion.div className="camera-flash" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />}</AnimatePresence>
                    </div>
                    <div className="camera-settings"><button onClick={() => openCamera(false)} disabled={stage === 'capturing'}><Camera size={15} /><span>{mode === 'live' ? facing === 'user' ? 'Câmera frontal' : 'Câmera traseira' : mode === 'demo' ? 'Fotos de demonstração' : 'Ativar minha câmera'}</span><ChevronDown size={13} /></button><button className={!sound ? 'sound-off' : ''} onClick={toggleSound} aria-pressed={sound}>{sound ? <Volume2 size={15} /> : <VolumeX size={15} />}<span>Som {sound ? 'ativado' : 'desativado'}</span></button></div>
                    <div className="capture-actions"><motion.button className={`button start-button ${stage === 'capturing' ? 'button-cancel' : ''}`} whileHover={stage === 'capturing' ? {} : { y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => stage === 'capturing' ? cancelCapture() : startSession()}>{stage === 'capturing' ? <Square size={15} /> : stage === 'review' ? <RotateCcw size={17} /> : <Camera size={18} />}{stage === 'capturing' ? 'Cancelar sessão' : stage === 'review' ? 'Fazer outra sessão' : 'Começar sessão'}{stage !== 'capturing' && <ArrowRight size={17} />}</motion.button><div className="session-timing"><Clock3 size={16} /><span>{stage === 'capturing' ? <>Próxima foto em <strong>{countdown}s</strong></> : <>3 fotos <i /> 10 s entre as poses</>}</span></div></div>
                  </div>
                  <section className="filter-section" aria-label="Filtros de foto"><div className="section-heading"><h2>Um toque de personalidade</h2><span>Escolha seu filtro favorito.</span></div><div className="filter-options">{FILTERS.map((item) => <button key={item.id} className={`filter-option ${item.id === filter ? 'selected' : ''}`} aria-pressed={item.id === filter} onClick={() => { setFilter(item.id); setSavedAction(false); }} disabled={stage === 'capturing'}><span className="filter-preview"><img src={photos[0] ?? DEMO_PHOTOS[0]} alt="" style={{ filter: item.css }} />{item.id === filter && <span className="filter-check"><Check size={12} strokeWidth={2.5} /></span>}</span><span className="filter-label">{item.label}</span></button>)}</div></section>
                </section>

                <aside className="preview-column" aria-label="Prévia da tirinha">
                  <div className="preview-heading"><h2>Sua tirinha <Sparkles size={15} /></h2><span>5 x 15 cm</span></div>
                  <div className="strip-stage"><div className="strip-stage-texture" /><motion.div className="strip-holder" initial={{ y: 16, rotate: -7, opacity: 0 }} animate={{ y: 0, rotate: -3, opacity: 1 }} transition={{ duration: 0.7, delay: 0.2 }}><div className="strip-tape" aria-hidden="true" />{generated && !isRendering && stage !== 'capturing' ? <img className="photo-strip raster-strip" src={generated.source} alt={`Prévia exata da tirinha de ${activeEvent.name}, 5 por 15 centímetros`} /> : <PhotoStrip event={activeEvent} photos={stage === 'idle' ? DEMO_PHOTOS : photos} filter={filter} placeholders={stage === 'capturing'} />}</motion.div><span className="strip-stage-note">{stage === 'capturing' ? `${photos.length} de 3 momentos capturados` : stage === 'review' ? 'uma lembrança só sua.' : 'um pedacinho de um bom dia.'}</span></div>
                  <button className="customize-button" onClick={() => editEvent(activeEvent)} disabled={stage === 'capturing'}><SlidersHorizontal size={14} />Personalizar modelo<ArrowRight size={14} /></button>
                  <div className="strip-actions"><button className="button button-dark download-button" onClick={() => openExport()} disabled={stage === 'capturing' || isRendering || !generated}>{isRendering ? <LoaderCircle className="spin" size={17} /> : <ArrowDownToLine size={17} />}<span>{isRendering ? 'Preparando tirinha...' : 'Baixar tirinha'}</span></button><div className="secondary-strip-actions"><button className="button button-outline" onClick={() => void printStrip()} disabled={stage === 'capturing' || isRendering || !generated}><Printer size={16} />Imprimir</button><button className="button button-outline share-button" onClick={() => void shareStrip()} aria-label="Compartilhar tirinha" title="Compartilhar tirinha" disabled={stage === 'capturing' || isRendering || !shareFile}><Share2 size={16} /></button></div></div>
                  <p className="print-note"><Leaf size={12} />{stage === 'review' ? 'Alta resolução. Pronta para guardar.' : 'Fotos ilustrativas. A próxima tirinha é sua.'}</p>
                </aside>
              </div>
            </motion.div>}

            {tab === 'admin' && <motion.div key="admin" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="secondary-page admin-page">
              <section className="page-intro"><div><div className="intro-eyebrow"><span /> ÁREA DO ORGANIZADOR.</div><h1>Seu evento. <em>Sua cabine.</em></h1><p>Crie experiências personalizadas e envie cada link para o dispositivo da festa.</p></div><button className="button button-dark" onClick={() => editEvent()}><Plus size={17} />Novo evento</button></section>
              <div className="admin-overview"><div><span>EVENTOS CRIADOS</span><strong>{events.length}</strong></div><div><span>FORMATO DE IMPRESSÃO</span><strong>5 x 15 cm</strong></div><div><span>FORMATO VIDEO 360</span><strong>9:16 vertical</strong></div><p><LockKeyhole size={14} />{firebaseReady ? 'Sincronizado no Firestore. Links funcionam em qualquer dispositivo.' : 'Sem Firebase configurado: os dados ficam neste navegador.'}</p></div>
              <div className="events-list">{events.map((event, index) => <motion.article className="event-row" key={event.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}><div className={`event-thumbnail theme-${event.style} ${event.mode === 'video360' ? 'video-thumbnail' : ''}`}>{event.mode === 'video360' ? <Video size={28} strokeWidth={1.4} /> : <Flower color={event.color} size={32} />}</div><div className="event-row-info"><h2>{event.name}{event.id === eventId && <span className="event-active-label">Selecionado</span>}</h2><p><CalendarDays size={13} />{eventDate(event.date, '/')}<span className="inline-dot" /><span className="event-mode-label">{event.mode === 'video360' ? 'Video 360 · 9:16 · ' + event.videoDuration + 's' : 'Cabine · tirinha 5 x 15 cm'}</span>{event.template && <span className="custom-art-label">Arte personalizada</span>}</p></div><div className="event-row-actions"><button className="button button-link" onClick={() => openEventLink(event)} title="Abrir link externo"><ExternalLink size={14} />Abrir link</button><button className="button button-outline link-copy-button" onClick={() => void copyEventLink(event)} title="Copiar link externo"><Copy size={14} />Copiar link</button><button className="button button-outline" onClick={() => selectEvent(event.id)}>{event.mode === 'video360' ? 'Pré-visualizar' : 'Abrir cabine'}<ArrowRight size={14} /></button><button className="icon-button" onClick={() => editEvent(event)} title="Editar evento" aria-label={`Editar ${event.name}`}><Pencil size={17} /></button><button className="icon-button danger-hover" onClick={() => deleteEvent(event)} title="Excluir evento" aria-label={`Excluir ${event.name}`}><Trash2 size={17} /></button></div></motion.article>)}</div>
              <p className="local-storage-note"><Link size={15} />Cada botão “Abrir link” gera uma cabine independente. Abra em uma nova aba no tablet, celular ou computador da festa.{firebaseReady ? ' O link busca o evento direto no banco de dados.' : ''}</p>
            </motion.div>}

            {tab === 'gallery' && <motion.div key="gallery" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="secondary-page">
              <section className="page-intro"><div><div className="intro-eyebrow"><span /> PARA REVER E SORRIR DE NOVO.</div><h1>Pequenas tirinhas. <em>Grandes histórias.</em></h1><p>As lembranças que você criou, guardadas neste dispositivo.</p></div><button className="button button-dark" onClick={() => changeTab('booth')}><Camera size={17} />Voltar à cabine</button></section>
              {sessions.length > 0 && <div className="gallery-toolbar"><label className="search-field"><Search size={17} /><input value={gallerySearch} onChange={(e) => setGallerySearch(e.target.value)} placeholder="Buscar uma lembrança pelo evento" aria-label="Buscar sessões pelo nome do evento" />{gallerySearch && <button className="icon-button" onClick={() => setGallerySearch('')} aria-label="Limpar busca"><X size={14} /></button>}</label><select value={galleryEvent} onChange={(e) => setGalleryEvent(e.target.value)} aria-label="Filtrar galeria por evento"><option value="all">Todos os eventos</option>{galleryEvents.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select><span>{gallerySessions.length} {gallerySessions.length === 1 ? 'lembrança' : 'lembranças'}</span></div>}
              {gallerySessions.length ? <div className="gallery-grid">{gallerySessions.map((session, index) => <motion.article className="gallery-item" key={session.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.06 }}><button className="gallery-image-button" onClick={() => { setDetailSession(session); setModal('gallery-detail'); }} aria-label={`Ver tirinha de ${session.eventName}`}><img src={session.strip} alt={`Tirinha com três fotos de ${session.eventName}`} loading="lazy" />{session.demo && <span className="gallery-demo-label">Demonstração</span>}<span className="gallery-open"><Maximize2 size={17} />Ver tirinha</span></button><div className="gallery-item-info"><h2>{session.eventName}</h2><p>{new Date(session.createdAt).toLocaleDateString('pt-BR')}<span className="inline-dot" />{new Date(session.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{session.gdriveUrl && <span className="gdrive-badge-item" title="Salvo no Google Drive">· Drive</span>}</p><button className="icon-button" aria-label={`Baixar tirinha de ${session.eventName}`} onClick={() => openExport(session.strip, session.eventName, session.demo)}><Download size={18} /></button></div></motion.article>)}</div> : <div className="empty-gallery"><div className="empty-illustration"><div /><div /><Camera size={36} strokeWidth={1.3} /></div><h2>{sessions.length ? 'Essa lembrança não está por aqui.' : 'A primeira de muitas memórias.'}</h2><p>{sessions.length ? 'Experimente outro nome ou selecione todos os eventos.' : 'Faça sua primeira sessão. As tirinhas aparecem aqui automaticamente.'}</p><button className="button start-button" onClick={() => sessions.length ? (setGallerySearch(''), setGalleryEvent('all')) : changeTab('booth')}>{sessions.length ? 'Limpar filtros' : 'Ir para a cabine'}<ArrowRight size={16} /></button></div>}
              <p className="local-storage-note"><LockKeyhole size={15} />{firebaseReady ? 'As tirinhas ficam registradas no Firestore em versão otimizada. O arquivo em alta resolução você baixa aqui.' : 'Só você tem acesso às suas fotos. Elas não são enviadas a um servidor. Baixe suas favoritas antes de limpar os dados do navegador.'}</p>
            </motion.div>}

            {tab === 'settings' && <motion.div key="settings" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="secondary-page"><SettingsView notify={notify} onFirebaseStatusChange={() => { void storage.getEvents().then(setEvents); }} /></motion.div>}
          </AnimatePresence>
        </main>

        <footer className="site-footer">
          <div><Brand small /><span>Seu momento. Do seu jeito.</span></div>
          <div className="agency-credit">
            <span>Sistema Criado por <strong>Agencia Argo's</strong> - Telefone: </span>
            <a
              href="https://wa.me/5524992777019?text=Ol%C3%A1%2C%20gostaria%20de%20solicitar%20um%20or%C3%A7amento%20para%20o%20sistema%20de%20foto%20cabine."
              target="_blank"
              rel="noopener noreferrer"
              className="agency-phone-link"
              title="Solicitar orçamento via WhatsApp (24) 99277-7019"
            >
              (24) 99277-7019
            </a>
          </div>
          <p><LockKeyhole size={13} />Suas fotos ficam apenas neste dispositivo.</p>
          <button className="text-button" onClick={() => setModal('help')} disabled={stage === 'capturing'}>Feito para guardar.<ArrowRight size={13} /></button>
        </footer>
      </div>

      <AnimatePresence>
        {modal === 'event-editor' && <EventEditor key="event-editor" event={editingEvent} onClose={closeModal} onSave={saveEvent} onError={(message) => notify(message, 'error')} />}

        {modal === 'event-link' && linkEvent && <Modal key="event-link" title="Seu evento está pronto." onClose={closeModal} className="event-link-modal"><p className="modal-description">Este é o link externo da cabine. Abra em outra aba ou envie para o tablet, celular ou computador que ficará no evento.</p><div className="link-success-mark"><CheckCircle2 size={32} /></div><label className="field-label" htmlFor="generated-event-link">Link da cabine</label><div className="generated-link-field"><input id="generated-event-link" readOnly value={makeEventLink(linkEvent)} onFocus={(event) => event.currentTarget.select()} /><button className="icon-button" onClick={() => void copyEventLink(linkEvent)} aria-label="Copiar link"><Copy size={17} /></button></div><div className="event-link-actions"><button className="button button-dark full-width" onClick={() => openEventLink(linkEvent)}><ExternalLink size={16} />Abrir cabine em nova aba</button><button className="button button-outline full-width" onClick={() => void copyEventLink(linkEvent)}><Copy size={16} />Copiar link</button></div><p className="field-hint link-note"><LockKeyhole size={12} />O link leva as configurações do evento. A câmera e as fotos só ficam no dispositivo da cabine.</p></Modal>}

        {modal === 'camera' && <Modal key="camera" title={mode === 'live' ? 'Encontre seu melhor ângulo.' : 'A sua vez de aparecer.'} onClose={closeModal} className="camera-modal"><p className="modal-description">Permita o acesso à câmera para transformar seu momento em uma tirinha.</p><div className="camera-modal-art"><Camera size={45} strokeWidth={1.25} /><Flower size={30} /></div>{cameraError && <p className="error-message" role="alert">{cameraError}</p>}<label className="field-label" htmlFor="camera-facing">Qual câmera vamos usar?</label><div className="camera-facing-field"><SwitchCamera size={17} /><select id="camera-facing" value={facing} onChange={(e) => setFacing(e.target.value as 'user' | 'environment')} disabled={cameraLoading}><option value="user">Câmera frontal</option><option value="environment">Câmera traseira</option></select></div><button className="button button-dark full-width" onClick={() => void activateCamera(facing, autoStartCamera.current)} disabled={cameraLoading}>{cameraLoading ? <LoaderCircle className="spin" size={17} /> : <Camera size={17} />}{cameraLoading ? 'Aguardando permissão...' : mode === 'live' ? 'Usar esta câmera' : 'Ativar minha câmera'}</button><button className="button button-ghost full-width demo-choice" onClick={() => { cameraRequest.current += 1; setCameraLoading(false); stopCamera(); setMode('demo'); setModal(null); if (autoStartCamera.current) beginCapture('demo'); else notify('Modo demonstração ativo. As fotos usadas são exemplos.', 'info'); }}><MonitorPlay size={17} />Testar com fotos de exemplo</button><p className="camera-privacy"><LockKeyhole size={12} />Sem microfone. Sem envio de fotos. Só boas memórias.</p></Modal>}

        {modal === 'event-picker' && <Modal key="event-picker" title="Qual é o motivo da festa?" onClose={closeModal}><p className="modal-description">Escolha o evento que vai dar a cara da sua tirinha.</p><div className="event-picker-list">{events.map((event) => <button className={event.id === eventId ? 'selected' : ''} key={event.id} onClick={() => selectEvent(event.id)}><span className={`picker-flower theme-${event.style}`}><Flower size={25} color={event.color} /></span><span><strong>{event.name}</strong><small>{eventDate(event.date, '/')}</small></span>{event.id === eventId ? <CheckCircle2 size={19} /> : <ArrowRight size={17} />}</button>)}</div><button className="button button-outline full-width" onClick={() => editEvent()}><Plus size={16} />Criar um novo evento</button></Modal>}

        {modal === 'export' && exportTarget && <Modal key="export" title="Essa memória é sua." onClose={closeModal} className="export-modal"><p className="modal-description">Escolha como levar sua tirinha com você.</p>{exportTarget.demo && <p className="example-notice"><MonitorPlay size={15} />Esta tirinha usa fotos de demonstração.</p>}<div className="export-formats">{([{ id: 'png', name: 'Imagem em alta resolução', detail: 'PNG · 600 x 1800 px · 304,8 dpi', Icon: FileImage }, { id: 'pdf', name: 'Arquivo pronto para impressão', detail: 'PDF · página de exatamente 5 x 15 cm', Icon: FileText }] as const).map((format) => <button key={format.id} className={exportFormat === format.id ? 'selected' : ''} onClick={() => setExportFormat(format.id)} aria-pressed={exportFormat === format.id}><format.Icon size={25} strokeWidth={1.5} /><span><strong>{format.name}</strong><small>{format.detail}</small></span><span className="radio-indicator">{exportFormat === format.id && <i />}</span></button>)}</div><div className="print-tip"><Printer size={18} /><p>Na impressão, escolha <strong>5 x 15 cm</strong>, escala <strong>100%</strong> e sem margens. O papel disponível depende da sua impressora.</p></div><button className="button button-dark full-width" onClick={() => void exportCurrent()} disabled={exporting}>{exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}{exporting ? 'Preparando arquivo...' : 'Salvar no dispositivo'}</button><p className="field-hint export-hint">No iPhone, o arquivo pode aparecer na pasta Downloads do app Arquivos.</p></Modal>}

        {modal === 'help' && <Modal key="help" title="Três poses. Uma boa memória." onClose={closeModal} className="help-modal"><p className="modal-description">Uma cabine inteira, direto no seu navegador.</p><div className="help-steps"><div><span>01</span><section><h3>Crie o evento no Admin</h3><p>Escolha Cabine de fotos ou Video 360, personalize a identidade e gere um link exclusivo para cada evento. Abra o link no dispositivo que ficará na festa.</p></section></div><div><span>02</span><section><h3>Escolha a experiência</h3><p>Na Cabine são três fotos, com uma contagem de 10 segundos antes de cada clique. No Video 360, grave em 15, 20 ou 25 segundos com slow motion automático no final.</p></section></div><div><span>03</span><section><h3>Leve a lembrança com você</h3><p>Baixe em PNG ou PDF, compartilhe pelo celular ou abra a impressão do navegador. A tirinha mede 5 x 15 cm e o vídeo sai em 1080 x 1920 px, 9:16.</p></section></div></div><div className="help-extra"><h3><Sparkles size={16} />Uma festa com a sua identidade</h3><p>No editor, adicione nome, data, logo, filtros e sua própria arte. Use PNG transparente como moldura ou uma imagem como fundo.</p><h3><MonitorPlay size={16} />No celular e no computador</h3><p>Use Safari no iPhone ou Chrome no Android e no computador, com HTTPS. Para instalar, use “Adicionar à Tela de Início” no menu de compartilhamento do iPhone ou no menu do navegador Android.</p><h3><LockKeyhole size={16} />A memória é sua. A privacidade também.</h3><p>Fotos e eventos ficam no armazenamento local deste navegador, sem sincronização entre dispositivos. Limpar esses dados também limpa sua galeria. Baixe os arquivos importantes para manter uma cópia.</p></div><button className="button button-dark full-width" onClick={closeModal}>Vamos criar uma memória<ArrowRight size={17} /></button></Modal>}

        {modal === 'gallery-detail' && detailSession && <Modal key="gallery-detail" title={detailSession.eventName} onClose={closeModal} className="gallery-detail-modal"><p className="modal-description">{new Date(detailSession.createdAt).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}{detailSession.demo ? ' · Demonstração' : ''}</p><div className="gallery-detail-image"><img src={detailSession.strip} alt={`Tirinha de ${detailSession.eventName}`} /></div><div className="gallery-detail-actions"><button className="button button-dark" onClick={() => openExport(detailSession.strip, detailSession.eventName, detailSession.demo)}><Download size={16} />Baixar tirinha</button><button className="button button-outline" onClick={() => void printStrip(detailSession.strip)}><Printer size={16} />Imprimir</button>{detailSession.gdriveUrl && <a href={detailSession.gdriveUrl} target="_blank" rel="noopener noreferrer" className="button button-outline gdrive-link-btn" title="Abrir no Google Drive"><FolderOpen size={15} />Drive</a>}<button className="icon-button danger-hover" onClick={() => deleteSession(detailSession)} aria-label="Excluir sessão"><Trash2 size={17} /></button></div></Modal>}
      </AnimatePresence>

      <AnimatePresence>{confirm && <Modal key="confirm" title={confirm.title} onClose={() => { if (!confirmBusy) setConfirm(null); }} className="confirm-modal"><p className="modal-description">{confirm.message}</p><div className="confirm-actions"><button className="button button-outline" disabled={confirmBusy} onClick={() => setConfirm(null)}>Manter</button><button className="button button-danger" disabled={confirmBusy} onClick={async () => { setConfirmBusy(true); try { await confirm.action(); setConfirm(null); } catch { notify('Não foi possível excluir. Tente novamente.', 'error'); } finally { setConfirmBusy(false); } }}>{confirmBusy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}Excluir</button></div></Modal>}</AnimatePresence>

      <AnimatePresence>{toast && <motion.div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><span>{toast.kind === 'success' ? <CheckCircle2 size={18} /> : toast.kind === 'error' ? <CircleHelp size={18} /> : <Sparkles size={18} />}</span><p>{toast.message}</p><button onClick={() => setToast(null)} aria-label="Fechar notificação"><X size={15} /></button></motion.div>}</AnimatePresence>

      <div className="print-only" aria-hidden="true">{(printSource || generated?.source) && <img ref={printImage} src={printSource || generated?.source} alt="Tirinha 5 x 15 cm para impressão" />}</div>
    </MotionConfig>
  );
}
