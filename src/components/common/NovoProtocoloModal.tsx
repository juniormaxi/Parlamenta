import React, { useEffect, useState } from 'react';
import { X, Check, ShieldCheck } from 'lucide-react';
import { PriorityType, ChannelType } from '../../types';
import { api } from '../../lib/api';
import { channelTypeFromName } from '../../lib/channels';
import { MunicipioAutocomplete } from './MunicipioAutocomplete';
import { useDialog } from './Dialogs';
import type { Taxonomy, EntryChannel } from '../modules/banco/ui';

interface NovoProtocoloModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProtocol: (protocolData: {
    citizenName: string;
    citizenCity: string;
    citizenPhone: string;
    citizenEmail?: string;
    citizenCategory: string;
    channel: ChannelType;
    channelLabel?: string;
    theme: any;
    subject: string;
    description: string;
    priority: PriorityType;
  }) => void;
  canManageLists?: boolean;
  onManageList?: (tab: 'canais' | 'temas') => void;
  /** Pré-preenchimento (ex.: protocolo gerado a partir de uma conversa do WhatsApp). */
  initial?: Partial<{ citizenName: string; citizenPhone: string; subject: string; description: string; channelName: string }>;
}

export const NovoProtocoloModal: React.FC<NovoProtocoloModalProps> = ({
  isOpen,
  onClose,
  onCreateProtocol,
  canManageLists = false,
  onManageList,
  initial,
}) => {
  const dialog = useDialog();
  const emptyForm = {
    citizenName: '',
    citizenCity: '',
    citizenPhone: '(65) 9',
    citizenEmail: '',
    citizenCategory: 'Cidadão Geral',
    channelName: '',
    theme: '',
    subject: '',
    description: '',
    priority: 'alta' as PriorityType,
  };
  const [form, setForm] = useState(emptyForm);
  const [lists, setLists] = useState<{ channels: EntryChannel[]; themes: EntryChannel[] } | null>(null);

  // Canais de entrada e temas vêm de Banco de Dados › Categorias.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setLists(null);
    if (initial) setForm({ ...emptyForm, ...initial });
    api<Taxonomy>('/tenant/db/taxonomy')
      .then((tx) => {
        if (!alive) return;
        setLists({ channels: tx.entryChannels, themes: tx.demandThemes });
        setForm((f) => ({
          ...f,
          channelName: tx.entryChannels.some((c) => c.name === f.channelName)
            ? f.channelName
            : (tx.entryChannels.find((c) => f.channelName && c.name.toLowerCase().includes(f.channelName.toLowerCase()))?.name ??
              tx.entryChannels[0]?.name ??
              ''),
          theme: tx.demandThemes.some((t) => t.name === f.theme) ? f.theme : (tx.demandThemes[0]?.name ?? ''),
        }));
      })
      .catch((e) => {
        if (!alive) return;
        setLists({ channels: [], themes: [] });
        dialog.alert({ title: 'Erro ao carregar listas', message: (e as Error).message, tone: 'danger' });
      });
    return () => {
      alive = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, dialog]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.citizenName.trim() || !form.subject.trim()) return;
    if (form.citizenEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.citizenEmail.trim())) {
      dialog.alert({ title: 'E-mail inválido', message: 'Confira o e-mail do cidadão ou deixe o campo em branco.', tone: 'warning' });
      return;
    }
    if (!form.channelName || !form.theme) {
      dialog.alert({ title: 'Campos obrigatórios', message: 'Selecione o canal de entrada e o tema da demanda.', tone: 'warning' });
      return;
    }

    onCreateProtocol({
      citizenName: form.citizenName,
      citizenCity: form.citizenCity,
      citizenPhone: form.citizenPhone,
      citizenEmail: form.citizenEmail.trim(),
      citizenCategory: form.citizenCategory,
      channel: channelTypeFromName(form.channelName),
      channelLabel: form.channelName,
      theme: form.theme,
      subject: form.subject,
      description: form.description,
      priority: form.priority,
    });
    setForm(emptyForm);
    onClose();
  };

  const manageLink = (tab: 'canais' | 'temas') =>
    canManageLists && onManageList ? (
      <button type="button" onClick={() => onManageList(tab)} className="text-[11px] text-[#176B80] font-semibold hover:underline">
        Gerenciar
      </button>
    ) : null;

  const listSelect = (
    items: EntryChannel[] | undefined,
    value: string,
    onChange: (v: string) => void,
    emptyHint: string
  ) => (
    <>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!items || items.length === 0}
        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs disabled:opacity-60"
      >
        {!items && <option value="">Carregando…</option>}
        {items?.length === 0 && <option value="">Nenhuma opção cadastrada</option>}
        {items?.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
      {items?.length === 0 && <p className="text-[11px] text-amber-700 mt-1">{emptyHint}</p>}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">Abertura de Protocolo de Atendimento</h3>
            <p className="text-xs text-slate-300">
              Registro formal de demanda social no Gabinete Conectado
            </p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs text-slate-700 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-800 block mb-1">
                Nome do Demandante / Cidadão
              </label>
              <input
                type="text"
                required
                placeholder="Ex: João Silva"
                value={form.citizenName}
                onChange={(e) => setForm({ ...form, citizenName: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-800 block mb-1">Município</label>
              <MunicipioAutocomplete
                value={form.citizenCity}
                onChange={(citizenCity) => setForm({ ...form, citizenCity })}
                placeholder="Digite: Sinop, Cuiabá…"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-800 block mb-1">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={form.citizenPhone}
                onChange={(e) => setForm({ ...form, citizenPhone: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-800">Canal de Entrada</label>
                {manageLink('canais')}
              </div>
              {listSelect(
                lists?.channels,
                form.channelName,
                (channelName) => setForm({ ...form, channelName }),
                'Cadastre em Banco de Dados › Categorias › Canais de Entrada.'
              )}
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-800 block mb-1">E-mail do Cidadão</label>
            <input
              type="email"
              placeholder="Opcional — recebe os alertas de andamento do protocolo"
              value={form.citizenEmail}
              onChange={(e) => setForm({ ...form, citizenEmail: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-800">Tema da Demanda</label>
                {manageLink('temas')}
              </div>
              {listSelect(
                lists?.themes,
                form.theme,
                (theme) => setForm({ ...form, theme }),
                'Cadastre em Banco de Dados › Categorias › Temas de Demanda.'
              )}
            </div>
            <div>
              <label className="font-semibold text-slate-800 block mb-1">
                Prioridade SLA
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as PriorityType })
                }
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <option value="baixa">Baixa (Rotina)</option>
                <option value="media">Média (SLA 5 dias)</option>
                <option value="alta">Alta (SLA 48h)</option>
                <option value="urgente">Urgente (SLA 24h)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-800 block mb-1">
              Assunto
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Reforma da ponte vicinal sobre o Rio Claro"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-800 block mb-1">
              Detalhamento dos Fatos
            </label>
            <textarea
              rows={8}
              placeholder="Descreva o contexto, solicitações e dados técnicos..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs min-h-[160px] resize-y leading-relaxed"
            />
          </div>

          <div className="bg-[#E9F1F4] p-3 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#176B80] shrink-0 mt-0.5" />
            <span>
              O número de protocolo será gerado sequencialmente com assinatura de data/hora no padrão <code>PRT-2026-XXXX</code>.
            </span>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Criar Protocolo</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
