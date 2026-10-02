import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, Download, Film, ImagePlus, LoaderCircle, Upload, Video, X } from 'lucide-react';
import Modal from './Modal';
import PhotoStrip from './PhotoStrip';
import { DEFAULT_EVENT, DEMO_PHOTOS, makeId, type BoothEvent, type EventStyle } from '../types';
import { downloadTemplateGuide, prepareUpload, renderStrip } from '../lib/strip';

interface EventEditorProps {
  event?: BoothEvent;
  onClose: () => void;
  onSave: (event: BoothEvent) => Promise<void>;
  onError: (message: string) => void;
}

export default function EventEditor({ event, onClose, onSave, onError }: EventEditorProps) {
  const [draft, setDraft] = useState<BoothEvent>(() => event ? { ...event } : {
    ...DEFAULT_EVENT,
    id: makeId(),
    name: '',
    date: new Date().toLocaleDateString('sv-SE'),
    tagline: 'um dia para guardar',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'template' | null>(null);
  const [preview, setPreview] = useState('');
  const logoInput = useRef<HTMLInputElement>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  const update = <K extends keyof BoothEvent>(key: K, value: BoothEvent[K]) => setDraft((previous) => ({ ...previous, [key]: value }));

  useEffect(() => {
    let alive = true;
    setPreview('');
    const timeout = setTimeout(() => {
      void renderStrip(DEMO_PHOTOS, { ...draft, name: draft.name || 'Seu evento' }, 'color').then((source) => { if (alive) setPreview(source); }).catch(() => undefined);
    }, 160);
    return () => { alive = false; clearTimeout(timeout); };
  }, [draft]);

  async function upload(event: ChangeEvent<HTMLInputElement>, kind: 'logo' | 'template') {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(kind);
    try { update(kind, await prepareUpload(file, kind)); }
    catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível abrir essa imagem.'); }
    finally { setUploading(null); event.target.value = ''; }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.date || uploading) return;
    setSaving(true);
    try { await onSave({ ...draft, name: draft.name.trim(), tagline: draft.tagline.trim() }); }
    finally { setSaving(false); }
  }

  const styles: { id: EventStyle; name: string; color: string }[] = [
    { id: 'garden', name: 'Jardim', color: '#fffdf8' },
    { id: 'sage', name: 'Sálvia', color: '#e7ece3' },
    { id: 'midnight', name: 'Noite', color: '#28322d' },
  ];

  return (
    <Modal title={event ? 'Um modelo com a sua cara.' : 'Sua festa. Sua identidade.'} onClose={() => { if (!saving) onClose(); }} wide className="event-editor">
      <p className="modal-description">Personalize a tirinha e deixe cada lembrança ainda mais especial.</p>
      <div className="editor-layout">
        <form onSubmit={submit} className="editor-form">
          <div className="form-section">
            <h3><span>01</span> O formato da experiência</h3>
            <div className="event-mode-options">
              <button type="button" className={draft.mode === 'booth' ? 'selected' : ''} onClick={() => update('mode', 'booth')}><span><ImagePlus size={21} /><strong>Cabine de fotos</strong><small>3 fotos em uma tirinha vertical</small></span>{draft.mode === 'booth' && <Check size={15} />}</button>
              <button type="button" className={draft.mode === 'video360' ? 'selected' : ''} onClick={() => update('mode', 'video360')}><span><Film size={21} /><strong>Modo Video 360</strong><small>Vídeo vertical com slow motion</small></span>{draft.mode === 'video360' && <Check size={15} />}</button>
            </div>
            {draft.mode === 'video360' && <div className="video-editor-settings"><div><label className="field-label" htmlFor="video-duration">Duração do vídeo</label><select id="video-duration" value={draft.videoDuration} onChange={(e) => update('videoDuration', Number(e.target.value) as BoothEvent['videoDuration'])}><option value="15">15 segundos</option><option value="20">20 segundos</option><option value="25">25 segundos</option></select></div><div><label className="field-label" htmlFor="video-filter">Filtro do vídeo</label><select id="video-filter" value={draft.videoFilter} onChange={(e) => update('videoFilter', e.target.value as BoothEvent['videoFilter'])}>{['color', 'bw', 'warm', 'rose'].map((id) => <option key={id} value={id}>{id === 'color' ? 'Colorido' : id === 'bw' ? 'Preto e branco' : id === 'warm' ? 'Amarelado' : 'Rosado'}</option>)}</select></div><p><Video size={13} />Saída recomendada: 1080 x 1920 px · proporção 9:16 · slow motion automático nos 5 segundos finais.</p></div>}
          </div>
          <div className="form-section">
            <h3><span>02</span> Os detalhes do evento</h3>
            <label className="field-label" htmlFor="event-name">Nome do evento</label>
            <input id="event-name" data-autofocus value={draft.name} onChange={(e) => update('name', e.target.value)} placeholder="Ex.: Casamento da Ana e do Pedro" required maxLength={60} />
            <div className="form-row">
              <div><label className="field-label" htmlFor="event-date">Data</label><input id="event-date" type="date" value={draft.date} onChange={(e) => update('date', e.target.value)} required min="1900-01-01" max="2100-12-31" /></div>
              <div><label className="field-label" htmlFor="event-tagline">Uma frase para guardar</label><input id="event-tagline" value={draft.tagline} onChange={(e) => update('tagline', e.target.value)} placeholder="celebrando o amor" maxLength={55} /></div>
            </div>
          </div>
          <div className="form-section">
            <h3><span>03</span> Um toque de personalidade</h3>
            <div className="style-options">
              {styles.map((style) => <button type="button" key={style.id} className={`style-option ${draft.style === style.id ? 'selected' : ''}`} onClick={() => update('style', style.id)} aria-pressed={draft.style === style.id}><span className="style-swatch" style={{ background: style.color }}><i /><i /><i /></span>{style.name}{draft.style === style.id && <Check size={14} />}</button>)}
            </div>
            <label className="color-field">Cor dos detalhes<input type="color" value={draft.color} onChange={(e) => update('color', e.target.value)} aria-label="Escolher a cor dos detalhes da tirinha" /><span>{draft.color.toUpperCase()}</span></label>
          </div>
          <div className="form-section upload-section">
            <h3><span>04</span> Deixe do seu jeito <span className="optional-label">opcional</span></h3>
            <div className="upload-grid">
              {(['logo', 'template'] as const).map((kind) => <div className={`upload-field ${draft[kind] ? 'has-upload' : ''}`} key={kind}>
                <button type="button" className="upload-trigger" onClick={() => (kind === 'logo' ? logoInput : templateInput).current?.click()} disabled={uploading !== null}>
                  {uploading === kind ? <LoaderCircle className="spin" size={23} /> : draft[kind] ? <img src={draft[kind]} alt={kind === 'logo' ? 'Logo enviada' : 'Modelo enviado'} /> : kind === 'logo' ? <ImagePlus size={23} /> : <Upload size={23} />}
                  <strong>{draft[kind] ? `Trocar ${kind === 'logo' ? 'logo' : 'arte'}` : kind === 'logo' ? 'Adicionar logo' : 'Enviar sua arte'}</strong>
                  <span>{kind === 'logo' ? 'PNG, JPG ou WebP' : draft.mode === 'video360' ? '1080 x 1920 px · PNG ou JPG' : '600 x 1800 px · PNG ou JPG'}</span>
                </button>
                {draft[kind] && <button type="button" className="upload-remove" aria-label={`Remover ${kind === 'logo' ? 'logo' : 'arte'}`} onClick={() => update(kind, undefined)}><X size={13} /></button>}
              </div>)}
            </div>
            <input type="file" ref={logoInput} accept="image/png,image/jpeg,image/webp" className="visually-hidden" tabIndex={-1} onChange={(e) => void upload(e, 'logo')} />
            <input type="file" ref={templateInput} accept="image/png,image/jpeg,image/webp" className="visually-hidden" tabIndex={-1} onChange={(e) => void upload(e, 'template')} />
            {draft.template && <div className="template-settings">
              <label className="field-label" htmlFor="template-layer">Como usar a arte</label>
              <select id="template-layer" value={draft.templateLayer} onChange={(e) => update('templateLayer', e.target.value as BoothEvent['templateLayer'])}><option value="background">Fundo: fotos e textos por cima</option><option value="overlay">Moldura: PNG transparente por cima</option></select>
              <label className="checkbox-field"><input type="checkbox" checked={draft.showText} onChange={(e) => update('showText', e.target.checked)} />Adicionar nome, data e logo sobre a arte</label>
            </div>}
            {draft.mode === 'booth' ? <button type="button" className="text-button guide-link" onClick={downloadTemplateGuide}><Download size={13} /> Baixar guia para criar sua arte</button> : <p className="video-art-guide"><Video size={13} />Para Video 360, prepare sua arte vertical em 1080 x 1920 px. As áreas transparentes preservam o vídeo.</p>}
            <p className="field-hint">As três fotos usam espaços fixos. O guia mostra as medidas exatas. Imagens de até 8 MB.</p>
          </div>
          <div className="editor-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="button button-dark" disabled={saving || uploading !== null}>{saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{saving ? 'Salvando...' : event ? 'Salvar alterações' : 'Criar evento'}</button></div>
        </form>
        <aside className="editor-preview"><span className="eyebrow">SEU MODELO, AO VIVO</span><div className={`editor-preview-stage ${draft.mode === 'video360' ? 'video-preview-stage' : ''}`}>{draft.mode === 'video360' ? <div className="video-preview-card" style={{ background: draft.style === 'midnight' ? '#28322d' : draft.style === 'sage' ? '#e7ece3' : '#59684d' }}><Video size={32} /><strong>VIDEO 360</strong><span>1080 x 1920 px</span><i style={{ background: draft.color }} /></div> : preview ? <img src={preview} className="photo-strip raster-strip" alt="Prévia exata do modelo personalizado" /> : <PhotoStrip event={{ ...draft, name: draft.name || 'Seu evento' }} />}</div><p>{draft.mode === 'video360' ? `${draft.videoDuration} segundos em 9:16.` : '5 x 15 cm de boas memórias.'}</p><span className="preview-disclaimer">{draft.mode === 'video360' ? 'A personalização aparece sobre o vídeo.' : 'As fotos acima são apenas exemplos.'}</span></aside>
      </div>
    </Modal>
  );
}