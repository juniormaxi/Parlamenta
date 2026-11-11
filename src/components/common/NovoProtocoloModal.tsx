import React, { useState } from 'react';
import { X, Check, FileCheck, ShieldCheck } from 'lucide-react';
import { Protocol, PriorityType, ChannelType } from '../../types';

interface NovoProtocoloModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProtocol: (protocolData: {
    citizenName: string;
    citizenCity: string;
    citizenPhone: string;
    citizenCategory: string;
    channel: ChannelType;
    theme: any;
    subject: string;
    description: string;
    priority: PriorityType;
  }) => void;
}

export const NovoProtocoloModal: React.FC<NovoProtocoloModalProps> = ({
  isOpen,
  onClose,
  onCreateProtocol,
}) => {
  const [form, setForm] = useState({
    citizenName: '',
    citizenCity: 'Cuiabá',
    citizenPhone: '(65) 9',
    citizenCategory: 'Cidadão Geral',
    channel: 'whatsapp' as ChannelType,
    theme: 'Saúde',
    subject: '',
    description: '',
    priority: 'alta' as PriorityType,
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.citizenName.trim() || !form.subject.trim()) return;

    onCreateProtocol({
      citizenName: form.citizenName,
      citizenCity: form.citizenCity,
      citizenPhone: form.citizenPhone,
      citizenCategory: form.citizenCategory,
      channel: form.channel,
      theme: form.theme,
      subject: form.subject,
      description: form.description,
      priority: form.priority,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs text-slate-700">
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
              <label className="font-semibold text-slate-800 block mb-1">
                Município de Mato Grosso
              </label>
              <select
                value={form.citizenCity}
                onChange={(e) => setForm({ ...form, citizenCity: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <option value="Cuiabá">Cuiabá</option>
                <option value="Várzea Grande">Várzea Grande</option>
                <option value="Rondonópolis">Rondonópolis</option>
                <option value="Sinop">Sinop</option>
                <option value="Sorriso">Sorriso</option>
                <option value="Nova Mutum">Nova Mutum</option>
                <option value="Tangará da Serra">Tangará da Serra</option>
                <option value="Barra do Garças">Barra do Garças</option>
                <option value="Juína">Juína</option>
                <option value="Cáceres">Cáceres</option>
                <option value="Primavera do Leste">Primavera do Leste</option>
                <option value="Lucas do Rio Verde">Lucas do Rio Verde</option>
              </select>
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
              <label className="font-semibold text-slate-800 block mb-1">
                Canal de Entrada
              </label>
              <select
                value={form.channel}
                onChange={(e) =>
                  setForm({ ...form, channel: e.target.value as ChannelType })
                }
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <option value="whatsapp">WhatsApp Oficial</option>
                <option value="email">E-mail Institucional</option>
                <option value="instagram">Instagram Direct</option>
                <option value="presencial">Presencial no Gabinete (ALMT)</option>
                <option value="telefone">Telefone</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-800 block mb-1">
                Tema da Demanda
              </label>
              <select
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <option value="Saúde">Saúde</option>
                <option value="Educação">Educação</option>
                <option value="Infraestrutura">Infraestrutura</option>
                <option value="Agricultura Familiar">Agricultura Familiar</option>
                <option value="Segurança Pública">Segurança Pública</option>
                <option value="Cultura & Esporte">Cultura & Esporte</option>
                <option value="Meio Ambiente">Meio Ambiente</option>
              </select>
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
              Assunto Sintético
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
              rows={3}
              placeholder="Descreva o contexto, solicitações e dados técnicos..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
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
