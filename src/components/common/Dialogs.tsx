/**
 * In-app replacements for window.alert / window.confirm, styled with the Parlamentta
 * design system. Never use the browser's native dialogs in this app.
 *
 *   const dialog = useDialog();
 *   if (await dialog.confirm({ title: 'Excluir?', message: '...', tone: 'danger' })) { ... }
 *   await dialog.alert({ title: 'Campos obrigatórios', message: '...', tone: 'warning' });
 *   dialog.toast('Copiado!', 'success');
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from 'lucide-react';

export type DialogTone = 'info' | 'success' | 'warning' | 'danger';

interface BaseOptions {
  title: string;
  message?: React.ReactNode;
  tone?: DialogTone;
}
export interface ConfirmOptions extends BaseOptions {
  confirmLabel?: string;
  cancelLabel?: string;
}
export interface AlertOptions extends BaseOptions {
  okLabel?: string;
}

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<void>;
  toast: (message: string, tone?: DialogTone) => void;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>');
  return ctx;
}

const TONES: Record<DialogTone, { icon: React.ElementType; iconBox: string; button: string; toast: string }> = {
  info: {
    icon: Info,
    iconBox: 'bg-[#E9F1F4] text-[#176B80]',
    button: 'bg-[#102C45] hover:bg-[#176B80]',
    toast: 'bg-[#102C45]',
  },
  success: {
    icon: CheckCircle2,
    iconBox: 'bg-emerald-50 text-emerald-600',
    button: 'bg-[#102C45] hover:bg-[#176B80]',
    toast: 'bg-emerald-700',
  },
  warning: {
    icon: AlertTriangle,
    iconBox: 'bg-amber-50 text-amber-600',
    button: 'bg-amber-600 hover:bg-amber-700',
    toast: 'bg-amber-700',
  },
  danger: {
    icon: OctagonAlert,
    iconBox: 'bg-rose-50 text-rose-600',
    button: 'bg-rose-600 hover:bg-rose-700',
    toast: 'bg-rose-700',
  },
};

type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: AlertOptions; resolve: () => void };

interface Toast {
  id: number;
  message: string;
  tone: DialogTone;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setQueue((q) => [...q, { kind: 'confirm', opts, resolve }])),
    []
  );
  const alert = useCallback(
    (opts: AlertOptions) => new Promise<void>((resolve) => setQueue((q) => [...q, { kind: 'alert', opts, resolve }])),
    []
  );
  const toast = useCallback((message: string, tone: DialogTone = 'success') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const api = useMemo(() => ({ confirm, alert, toast }), [confirm, alert, toast]);
  const current = queue[0];
  const close = useCallback(
    (result: boolean) => {
      if (!current) return;
      if (current.kind === 'confirm') current.resolve(result);
      else current.resolve();
      setQueue((q) => q.slice(1));
    },
    [current]
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && <DialogView key={queue.length} pending={current} onClose={close} />}
      <div className="fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => {
          const Icon = TONES[t.tone].icon;
          return (
            <div
              key={t.id}
              className={`${TONES[t.tone].toast} text-white text-xs font-medium pl-3 pr-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-200`}
            >
              <Icon className="w-4 h-4 shrink-0 opacity-90" />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </DialogContext.Provider>
  );
}

function DialogView({ pending, onClose }: { pending: Pending; onClose: (result: boolean) => void }) {
  const { opts, kind } = pending;
  const tone = opts.tone ?? (kind === 'confirm' ? 'warning' : 'info');
  const t = TONES[tone];
  const Icon = t.icon;
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // For destructive confirmations, focus "Cancelar" so Enter doesn't trigger the action by accident.
    (kind === 'confirm' && tone === 'danger' ? cancelRef : primaryRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind, tone, onClose]);

  const primaryLabel = kind === 'confirm' ? (opts as ConfirmOptions).confirmLabel ?? 'Confirmar' : (opts as AlertOptions).okLabel ?? 'Entendi';

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4 animate-in fade-in duration-150"
      onMouseDown={() => onClose(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pl-dialog-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 animate-in zoom-in-95 duration-150"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-5 flex gap-3.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.iconBox}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 id="pl-dialog-title" className="text-sm font-bold text-slate-900">
              {opts.title}
            </h3>
            {opts.message && <div className="text-xs text-slate-600 mt-1.5 leading-relaxed">{opts.message}</div>}
          </div>
          <button onClick={() => onClose(false)} className="p-1 h-fit rounded-md hover:bg-slate-100 text-slate-400" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-2">
          {kind === 'confirm' && (
            <button
              ref={cancelRef}
              onClick={() => onClose(false)}
              className="px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors focus:outline-hidden focus:ring-2 focus:ring-[#176B80]/40"
            >
              {(opts as ConfirmOptions).cancelLabel ?? 'Cancelar'}
            </button>
          )}
          <button
            ref={primaryRef}
            onClick={() => onClose(true)}
            className={`px-3.5 py-2 text-white text-xs font-semibold rounded-lg transition-colors focus:outline-hidden focus:ring-2 focus:ring-offset-1 focus:ring-[#176B80]/50 ${t.button}`}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
