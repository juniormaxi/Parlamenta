import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Search, Plus, Loader2, Unlock, RefreshCw } from 'lucide-react';
import { blocklist, type BlockedNumber } from '../../../lib/crm';
import { useDialog } from '../../common/Dialogs';
import { Modal, Field, inputCls, btnPrimary, btnGhost, fmtPhone } from '../banco/ui';

const SOURCE: Record<string, string> = { crm: 'CRM · “Não enviar mais mensagens”', manual: 'Incluído manualmente' };
const fmtWhen = (s: string) => {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(+d) ? s : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Administração & LGPD › Números Bloqueados: quem pediu para não receber mensagens. */
export function BlockedNumbersPanel() {
  const dialog = useDialog();
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ canUnblock: boolean; items: BlockedNumber[] } | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(
    (query: string) =>
      blocklist
        .list(query)
        .then(setData)
        .catch((e) => dialog.alert({ title: 'Erro ao carregar números bloqueados', message: (e as Error).message, tone: 'danger' })),
    [dialog]
  );
  useEffect(() => {
    const t = window.setTimeout(() => load(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q, load]);

  const unblock = async (b: BlockedNumber) => {
    const ok = await dialog.confirm({
      title: 'Desbloquear número?',
      message: (
        <>
          <strong className="font-mono">{fmtPhone(b.phone)}</strong>
          {b.name && <> · {b.name}</>}
          <br />O sistema voltará a permitir mensagens para este número. Faça isso apenas se o titular autorizou novamente (LGPD).
        </>
      ),
      confirmLabel: 'Desbloquear',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await blocklist.remove(b.id);
      dialog.toast('Número desbloqueado.');
      load(q.trim());
    } catch (e) {
      dialog.alert({ title: 'Erro ao desbloquear', message: (e as Error).message, tone: 'danger' });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-800" /> Números Bloqueados
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Titulares que pediram para não receber mensagens. O sistema não envia WhatsApp para estes números (conversas, CRM e alertas de protocolo) e
            recusa o número em novas importações de leads.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className={btnGhost} onClick={() => load(q.trim())} title="Atualizar">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button className={btnPrimary} onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Bloquear número
          </button>
        </div>
      </div>
      <div className="p-3 border-b border-slate-100">
        <div className="relative max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-8`} placeholder="Buscar por número, nome ou motivo…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!data ? (
        <div className="p-10 text-center">
          <Loader2 className="w-5 h-5 animate-spin inline text-slate-400" />
        </div>
      ) : data.items.length === 0 ? (
        <p className="p-10 text-center text-xs text-slate-500">{q ? 'Nenhum número encontrado.' : 'Nenhum número bloqueado.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {['Número', 'Nome', 'Motivo / origem', 'Bloqueado em', ''].map((h) => (
                  <th key={h} className="text-left font-semibold px-4 py-2.5 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 whitespace-nowrap">{fmtPhone(b.phone)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{b.name || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {b.reason}
                    <span className="block text-[10px] text-slate-400">{SOURCE[b.source] ?? b.source}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                    {fmtWhen(b.createdAt)}
                    {b.createdBy && <span className="block text-[10px] text-slate-400">por {b.createdBy}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {data.canUnblock && (
                      <button className={btnGhost} onClick={() => unblock(b)}>
                        <Unlock className="w-3.5 h-3.5" /> Desbloquear
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[10px] text-slate-500 border-t border-slate-100">{data.items.length} número(s) bloqueado(s).</p>
        </div>
      )}

      {adding && (
        <AddModal
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            load(q.trim());
          }}
        />
      )}
    </div>
  );
}

function AddModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const dialog = useDialog();
  const [f, setF] = useState({ phone: '', name: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await blocklist.add(f);
      dialog.toast('Número bloqueado.');
      onDone();
    } catch (e) {
      dialog.alert({ title: 'Não foi possível bloquear', message: (e as Error).message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Bloquear número"
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={save} disabled={saving || f.phone.replace(/\D/g, '').length < 10}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Bloquear
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        <Field label="Telefone com DDD">
          <input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(65) 99999-0000" inputMode="tel" autoFocus />
        </Field>
        <Field label="Nome (opcional)">
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Motivo" hint="Ex.: pediu por telefone em 12/11 para não receber mais mensagens.">
          <input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
