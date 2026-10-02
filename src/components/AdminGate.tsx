import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Camera, LoaderCircle, LockKeyhole, ShieldAlert } from 'lucide-react';
import { Flower } from './PhotoStrip';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || '22130302';
const UNLOCK_KEY = 'cabine-admin-unlocked';

export function adminUnlocked() {
  try { return sessionStorage.getItem(UNLOCK_KEY) === '1'; }
  catch { return false; }
}

export function lockAdmin() {
  try { sessionStorage.removeItem(UNLOCK_KEY); } catch { /* Navegação privada pode bloquear o sessionStorage. */ }
}

interface AdminGateProps {
  onUnlock: () => void;
  cloudReady: boolean;
  missingKeys: string[];
}

export default function AdminGate({ onUnlock, cloudReady, missingKeys }: AdminGateProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (checking) return;
    setChecking(true);
    setError('');
    window.setTimeout(() => {
      if (value === ADMIN_PASSWORD) {
        try { sessionStorage.setItem(UNLOCK_KEY, '1'); } catch { /* Sessão sem armazenamento ainda permite entrar. */ }
        onUnlock();
      } else {
        setError('Senha incorreta. Verifique e tente novamente.');
        setValue('');
        input.current?.focus();
      }
      setChecking(false);
    }, 260);
  }

  return (
    <div className="gate-screen">
      <div className="gate-glow" aria-hidden="true" />
      <motion.div className="gate-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="gate-brand"><span className="gate-mark"><Camera size={26} strokeWidth={1.6} /><i /></span><span className="gate-word">cabine<span>.</span></span></div>
        <div className="gate-flower"><Flower size={30} /></div>
        <h1>Área do organizador</h1>
        <p>Digite a senha de acesso para criar e personalizar os eventos da sua cabine.</p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="admin-password">Senha de acesso</label>
          <input
            id="admin-password"
            ref={input}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={value}
            onChange={(event) => { setValue(event.target.value); if (error) setError(''); }}
            placeholder="••••••••"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'gate-error' : 'gate-cloud'}
            maxLength={40}
            required
          />
          <button type="submit" className="button button-dark gate-submit" disabled={checking || !value}>
            {checking ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={16} />}
            {checking ? 'Verificando...' : 'Entrar no admin'}
            {!checking && <ArrowRight size={16} />}
          </button>
        </form>
        {error && <p className="gate-error" id="gate-error" role="alert"><ShieldAlert size={14} />{error}</p>}
        <p className="gate-cloud" id="gate-cloud">
          <i className={cloudReady ? 'cloud-on' : 'cloud-off'} aria-hidden="true" />
          {cloudReady ? 'Banco de dados Firebase conectado.' : 'Firebase não configurado: os eventos ficam apenas neste navegador.'}
        </p>
        {!cloudReady && missingKeys.length > 0 && (
          <details className="gate-details">
            <summary>Como conectar o Firebase</summary>
            <p>Crie um projeto no console do Firebase, ative o Firestore e adicione as variáveis de ambiente na Vercel: {missingKeys.join(', ')}.</p>
          </details>
        )}
      </motion.div>
      <p className="gate-footnote">Cabine compartilhada por link não precisa desta senha.</p>
      <footer className="gate-agency-credit">
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
      </footer>
    </div>
  );
}
