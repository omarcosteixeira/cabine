import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

const modalStack: symbol[] = [];
let unlockedOverflow = '';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}

export default function Modal({ title, onClose, children, wide = false, className = '' }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const token = useRef(Symbol('modal')).current;
  const titleId = useId();
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    if (modalStack.length === 0) unlockedOverflow = document.body.style.overflow;
    modalStack.push(token);
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>('input:not([type="file"]), button');
      (target ?? panel.current)?.focus();
    });
    function onKeyDown(event: KeyboardEvent) {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const targets = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
      if (!targets.length) { event.preventDefault(); return; }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      const wasTop = modalStack[modalStack.length - 1] === token;
      modalStack.splice(modalStack.indexOf(token), 1);
      if (modalStack.length === 0) document.body.style.overflow = unlockedOverflow;
      if (wasTop && previousFocus?.isConnected) previousFocus.focus();
    };
  }, [token]);

  return createPortal(
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`modal-panel ${wide ? 'modal-wide' : ''} ${className}`} initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.98 }} transition={{ duration: 0.24 }}>
        <button className="icon-button modal-close" onClick={onClose} aria-label="Fechar janela"><X size={20} /></button>
        <h2 id={titleId} className="modal-title">{title}</h2>
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}