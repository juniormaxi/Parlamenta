import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, LogOut, QrCode, Smartphone, WifiOff, AlertTriangle, BellRing, RefreshCw, X } from 'lucide-react';
import { wa, formatPhone, type WhatsAppStatus } from '../../../lib/whatsapp';
import { useDialog } from '../../common/Dialogs';

/** Status do WhatsApp com polling: rápido durante o pareamento, lento no resto. */
export function useWhatsAppStatus(slowMs = 20_000) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setStatus(await wa.status());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const fast = status?.status === 'pairing';
  useEffect(() => {
    const t = window.setInterval(refresh, fast ? 2_000 : slowMs);
    return () => window.clearInterval(t);
  }, [refresh, fast, slowMs]);
  return { status, error, refresh };
}

const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50';

export const WhatsAppConnection: React.FC<{ status: WhatsAppStatus | null; error?: string | null; refresh: () => Promise<void> }> = ({ status, error, refresh }) => {
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'qr' | 'phone'>('qr');
  const [phone, setPhone] = useState('');

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      dialog.alert({ title: 'WhatsApp', message: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-slate-500 flex items-center gap-2">
        {error ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <Loader2 className="w-4 h-4 animate-spin" />}
        {error ?? 'Carregando status do WhatsApp…'}
      </div>
    );
  }

  if (!status.installed) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-xs text-amber-900 space-y-1">
        <p className="font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Integração indisponível no servidor
        </p>
        <p>
          O componente <span className="font-mono">wacli</span> não foi encontrado. No servidor, rode{' '}
          <span className="font-mono bg-white/70 px-1 rounded">npm run wacli:install</span> (já incluído no build) ou defina{' '}
          <span className="font-mono">WACLI_BIN</span>.
        </p>
      </div>
    );
  }

  // ---- Conectado -----------------------------------------------------------
  if (status.status === 'connected') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`p-2.5 rounded-xl ${status.online ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {status.online ? <CheckCircle2 className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">{formatPhone(status.phone) || 'Número conectado'}</p>
              <p className="text-[11px] text-slate-500">
                {status.online ? 'Conectado e sincronizando' : 'Reconectando ao WhatsApp…'}
                {status.connectedAt && <> · desde {new Date(status.connectedAt).toLocaleDateString('pt-BR')}</>}
              </p>
            </div>
          </div>
          {status.canManage && (
            <button
              disabled={busy}
              onClick={async () => {
                const ok = await dialog.confirm({
                  title: 'Desconectar WhatsApp?',
                  message:
                    'O aparelho será removido dos "Dispositivos conectados" do celular e o histórico sincronizado neste servidor será apagado. Alertas pendentes serão cancelados.',
                  confirmLabel: 'Desconectar',
                  tone: 'danger',
                });
                if (ok) act(wa.disconnect);
              }}
              className={`${btn} border border-red-200 text-red-700 hover:bg-red-50`}
            >
              <LogOut className="w-3.5 h-3.5" /> Desconectar
            </button>
          )}
        </div>
        {!status.online && status.lastError && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2 font-mono">{status.lastError}</p>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Alertas enviados (24h)', status.outbox.sent24h, 'text-emerald-700'],
            ['Na fila', status.outbox.pending, 'text-slate-700'],
            ['Com falha', status.outbox.failed, status.outbox.failed ? 'text-red-700' : 'text-slate-700'],
          ].map(([label, n, cls]) => (
            <div key={label as string} className="bg-slate-50 border border-slate-100 rounded-lg p-2">
              <p className={`text-lg font-bold ${cls}`}>{n as number}</p>
              <p className="text-[10px] text-slate-500">{label as string}</p>
            </div>
          ))}
        </div>

        <label className={`flex items-start gap-3 p-3 rounded-lg border ${status.alertsEnabled ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'}`}>
          <input
            type="checkbox"
            className="mt-0.5"
            disabled={!status.canManage || busy}
            checked={status.alertsEnabled}
            onChange={(e) => act(() => wa.settings(e.target.checked))}
          />
          <span className="text-xs text-slate-700">
            <span className="font-semibold flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5" /> Avisar o cidadão por WhatsApp
            </span>
            Abertura de protocolo, mudança de situação e resposta do gabinete são enviadas ao telefone do protocolo (além do e-mail).
          </span>
        </label>
      </div>
    );
  }

  // ---- Pareando --------------------------------------------------------------
  if (status.status === 'pairing') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="grid md:grid-cols-[240px_1fr] gap-6 items-center">
          <div className="w-[240px] h-[240px] mx-auto rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
            {status.phase === 'syncing' ? (
              <div className="text-center text-xs text-slate-600 space-y-2 p-4">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
                <p className="font-semibold">Aparelho conectado!</p>
                <p>Sincronizando conversas recentes… isso pode levar alguns minutos.</p>
              </div>
            ) : status.qrSvg ? (
              <img alt="QR code para conectar o WhatsApp" className="w-full h-full" src={`data:image/svg+xml;utf8,${encodeURIComponent(status.qrSvg)}`} />
            ) : status.pairCode ? (
              <div className="text-center p-4">
                <p className="text-[11px] text-slate-500 mb-2">Código de pareamento</p>
                <p className="font-mono text-2xl font-bold tracking-[0.2em] text-[#102C45]">{status.pairCode}</p>
              </div>
            ) : (
              <div className="text-center text-xs text-slate-500 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                <p>Gerando…</p>
              </div>
            )}
          </div>
          <div className="space-y-3 text-xs text-slate-700">
            <p className="text-sm font-bold text-slate-900">Conecte o WhatsApp do gabinete</p>
            <ol className="list-decimal pl-4 space-y-1.5">
              <li>Abra o WhatsApp no celular do gabinete.</li>
              <li>
                Toque em <strong>Configurações</strong> (ou ⋮) › <strong>Dispositivos conectados</strong> › <strong>Conectar dispositivo</strong>.
              </li>
              {status.pairCode ? (
                <li>
                  Escolha <strong>Conectar com número de telefone</strong> e digite o código ao lado.
                </li>
              ) : (
                <li>Aponte a câmera para o QR code ao lado. Ele se renova sozinho a cada ~20 segundos.</li>
              )}
            </ol>
            <p className="text-[11px] text-slate-500">
              O Parlamenta passa a funcionar como um aparelho conectado (igual ao WhatsApp Web). Mantenha o celular com internet.
            </p>
            {status.canManage && (
              <button disabled={busy} onClick={() => act(wa.cancel)} className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50`}>
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Desconectado ----------------------------------------------------------
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="p-2.5 rounded-xl bg-slate-100 text-slate-500">
          <WifiOff className="w-5 h-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-slate-900">Nenhum WhatsApp conectado</p>
          <p className="text-[11px] text-slate-500">Conecte o número do gabinete para atender e avisar cidadãos pelo WhatsApp.</p>
        </div>
      </div>
      {status.lastError && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {status.lastError}
        </p>
      )}
      {status.canManage ? (
        <div className="space-y-3">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
            {(
              [
                ['qr', 'QR code', QrCode],
                ['phone', 'Código pelo número', Smartphone],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 ${mode === m ? 'bg-[#102C45] text-white' : 'text-slate-600'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          {mode === 'phone' && (
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Número do WhatsApp do gabinete — ex.: (65) 99999-0000"
              className="w-full max-w-sm p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          )}
          <div>
            <button
              disabled={busy || (mode === 'phone' && phone.replace(/\D/g, '').length < 10)}
              onClick={() => act(() => wa.connect(mode === 'phone' ? phone : undefined))}
              className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : status.lastError ? <RefreshCw className="w-3.5 h-3.5" /> : <QrCode className="w-3.5 h-3.5" />}
              {mode === 'qr' ? 'Gerar QR code' : 'Gerar código'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Peça ao chefe de gabinete ou à coordenação de atendimento para conectar o número.</p>
      )}
    </div>
  );
};
