import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  Download,
  Printer,
  FileCheck,
  Building,
  Layers,
  History,
  Lock,
  Eye,
  Check,
  X,
} from 'lucide-react';
import { DocumentModel, Cabinet } from '../../types';
import { DemoNoticeBanner } from '../common/DemoNoticeBanner';

interface DocumentosModuleProps {
  documents: DocumentModel[];
  activeCabinet: Cabinet;
  customLogoUrl?: string;
  onOpenLogoModal: () => void;
  onCreateDocument: (newDoc: Omit<DocumentModel, 'id'>) => void;
}

export const DocumentosModule: React.FC<DocumentosModuleProps> = ({
  documents,
  activeCabinet,
  customLogoUrl,
  onOpenLogoModal,
  onCreateDocument,
}) => {
  const [selectedDoc, setSelectedDoc] = useState<DocumentModel>(documents[0]);
  const [categoryFilter, setCategoryFilter] = useState<string>('todos');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [newDocModalOpen, setNewDocModalOpen] = useState(false);

  // New Doc Form
  const [docForm, setDocForm] = useState({
    title: '',
    category: 'Ofício' as any,
    recipient: '',
    contentPreview: '',
  });

  const filteredDocs = documents.filter((d) => {
    const matchesCategory =
      categoryFilter === 'todos' || d.category === categoryFilter;
    const matchesSearch =
      d.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      d.code.toLowerCase().includes(searchFilter.toLowerCase()) ||
      d.recipient.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.title.trim()) return;

    onCreateDocument({
      code: `OF-${Math.floor(100 + Math.random() * 900)}/2026-GAB`,
      title: docForm.title,
      category: docForm.category,
      recipient: docForm.recipient,
      author: 'Dep. Mariana Ribeiro / Assessoria',
      createdAt: new Date().toISOString().split('T')[0],
      version: '1.0',
      status: 'rascunho',
      contentPreview: docForm.contentPreview,
    });
    setNewDocModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <DemoNoticeBanner
        moduleName="Documentos & Proposições Oficiais"
        contextText="Modelos institucionais timbrados (Ofícios, Requerimentos, Indicações e Projetos de Lei) com versionamento e cabeçalho oficial."
      />

      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#176B80]" />
            Biblioteca de Documentos & Modelos Timbrados
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Expedição formal perante o Poder Executivo, secretarias de estado e órgãos de controle
          </p>
        </div>

        <button
          onClick={() => setNewDocModalOpen(true)}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Redigir Novo Documento</span>
        </button>
      </div>

      {/* Main Grid: Document List & Document Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left List (1 span) */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-100 bg-slate-50/50 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar por código ou destinatário..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:ring-1 focus:ring-[#176B80]"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto text-xs">
              {['todos', 'Ofício', 'Requerimento', 'Projeto de Lei', 'Indicação'].map(
                (cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2 py-0.5 rounded text-[11px] whitespace-nowrap font-medium ${
                      categoryFilter === cat
                        ? 'bg-[#102C45] text-white'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
            {filteredDocs.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className={`p-3.5 cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#E9F1F4]/70 border-l-4 border-l-[#176B80]' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="font-bold text-[#102C45]">{doc.code}</span>
                    <span className="text-slate-400 font-semibold">{doc.category}</span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-xs mt-1 line-clamp-2">
                    {doc.title}
                  </h4>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5">
                    <span className="truncate max-w-[150px]">{doc.recipient}</span>
                    <span className="font-mono">v{doc.version}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 2 spans: Official Timbrada Document Sheet Preview */}
        {selectedDoc && (
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              {/* Actions Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#102C45] bg-slate-100 px-2 py-0.5 rounded">
                    {selectedDoc.code}
                  </span>
                  <span className="text-xs text-slate-500">Versão {selectedDoc.version}</span>
                  <span className="text-emerald-700 text-xs font-semibold capitalize font-mono">
                    Status: {selectedDoc.status}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    title="Imprimir documento"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      alert(`Download simulado do arquivo ${selectedDoc.code}.pdf`)
                    }
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar PDF</span>
                  </button>
                </div>
              </div>

              {/* Official Timbrada Sheet */}
              <div className="p-8 border border-slate-300 rounded-lg bg-white shadow-xs max-w-2xl mx-auto space-y-6 font-serif text-slate-800 text-xs leading-relaxed">
                {/* Header Timbrado */}
                <div className="text-center pb-4 border-b border-slate-300 space-y-1">
                  <div className="w-14 h-14 mx-auto mb-2 flex items-center justify-center">
                    {customLogoUrl ? (
                      <img
                        src={customLogoUrl}
                        alt="Brasão"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full border-2 border-[#102C45] flex items-center justify-center font-sans font-bold text-[#102C45]">
                        ALMT
                      </div>
                    )}
                  </div>
                  <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-[#102C45]">
                    {activeCabinet.house}
                  </h3>
                  <p className="font-sans text-[11px] text-slate-600">
                    Gabinete da {activeCabinet.parliamentarian}
                  </p>
                  <p className="font-sans text-[10px] text-slate-400">
                    Palácio Paschoal Moreira Cabral · Centro Político Administrativo · Cuiabá - MT
                  </p>
                </div>

                {/* Identification & Number */}
                <div className="font-sans flex justify-between font-bold text-[11px] text-slate-700">
                  <span>{selectedDoc.code}</span>
                  <span>Cuiabá-MT, {selectedDoc.createdAt}</span>
                </div>

                {/* Recipient */}
                <div className="space-y-1">
                  <p className="font-bold">A Sua Excelência o(a) Senhor(a),</p>
                  <p className="font-bold">{selectedDoc.recipient}</p>
                  <p className="text-slate-600">Estado de Mato Grosso</p>
                </div>

                {/* Subject */}
                <div>
                  <p className="font-bold font-sans">
                    Assunto: <span className="font-normal">{selectedDoc.title}</span>
                  </p>
                </div>

                {/* Content */}
                <div className="space-y-3 text-justify indent-6">
                  <p>{selectedDoc.contentPreview}</p>
                  <p>
                    Na certeza de contar com a costumeira presteza e atenção de Vossa Excelência para com as demandas legítimas da população mato-grossense, renovamos nossos protestos de elevada estima e distinta consideração.
                  </p>
                </div>

                {/* Signature Block */}
                <div className="pt-8 text-center space-y-1 font-sans">
                  <div className="w-48 border-t border-slate-400 mx-auto" />
                  <p className="font-bold text-xs text-[#102C45]">
                    {activeCabinet.parliamentarian}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Deputada Estadual · Estado de Mato Grosso
                  </p>
                  <div className="mt-2 text-[9px] font-mono text-emerald-700 bg-emerald-50 p-1 rounded inline-block">
                    ✓ Assinado Digitalmente · ICP-Brasil · Hash: 9fa2...e41b
                  </div>
                </div>
              </div>
            </div>

            {/* Logo Customizer Prompt */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Precisa trocar o brasão ou logo timbrado?</span>
              <button
                onClick={onOpenLogoModal}
                className="text-[#176B80] hover:underline font-medium"
              >
                Personalizar Logotipo do Gabinete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Novo Documento */}
      {newDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden"
          >
            <div className="px-6 py-4 bg-[#102C45] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Elaborar Novo Documento</h3>
              <button
                type="button"
                onClick={() => setNewDocModalOpen(false)}
                className="text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">Tipo de Proposição</label>
                  <select
                    value={docForm.category}
                    onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="Ofício">Ofício</option>
                    <option value="Requerimento">Requerimento de Informação</option>
                    <option value="Projeto de Lei">Projeto de Lei</option>
                    <option value="Indicação">Indicação</option>
                    <option value="Emenda Parlamentar">Emenda Parlamentar</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">Destinatário</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Secretário da SINFRA-MT"
                    value={docForm.recipient}
                    onChange={(e) => setDocForm({ ...docForm, recipient: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Título / Ementa</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Requer providências imediatas quanto à MT-249"
                  value={docForm.title}
                  onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Texto da Proposição</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Cumprimentando-o cordialmente, vimos por meio deste solicitar..."
                  value={docForm.contentPreview}
                  onChange={(e) => setDocForm({ ...docForm, contentPreview: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewDocModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#102C45] rounded-lg"
              >
                Gerar Minuta
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
