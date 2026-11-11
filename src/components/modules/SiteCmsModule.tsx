import React, { useState } from 'react';
import {
  Globe,
  Plus,
  Search,
  Eye,
  CheckCircle2,
  Clock,
  ExternalLink,
  Share2,
  Sliders,
  Webhook,
} from 'lucide-react';
import { CMSPost } from '../../types';
import { DemoNoticeBanner } from '../common/DemoNoticeBanner';

interface SiteCmsModuleProps {
  posts: CMSPost[];
  onToggleFeatured: (postId: string) => void;
}

export const SiteCmsModule: React.FC<SiteCmsModuleProps> = ({
  posts,
  onToggleFeatured,
}) => {
  const [activeTab, setActiveTab] = useState<'posts' | 'webhooks'>('posts');
  const [webhookUrl, setWebhookUrl] = useState('https://marianaribeiro.com.br/api/sync-gabinete');
  const [webhookSaved, setWebhookSaved] = useState(false);

  const handleSaveWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookSaved(true);
    setTimeout(() => setWebhookSaved(false), 3000);
  };

  return (
    <div className="space-y-4">
      <DemoNoticeBanner
        moduleName="Site Oficial & CMS do Mandato"
        contextText="Gestão de notícias, prestação de contas de emendas e sincronização externa via Webhooks para o portal oficial do parlamentar."
      />

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#176B80]" />
            Site Institucional & Publicações Aprovadas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Publicação de emendas, propostas de lei e prestação de contas para a população
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setActiveTab('posts')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'posts'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Publicações do Portal
            </button>
            <button
              onClick={() => setActiveTab('webhooks')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'webhooks'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Webhooks & APIs Externas
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'posts' ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">
              Artigos & Transparência do Mandato
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {posts.length} publicações ativas
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {posts.map((post) => (
              <div
                key={post.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold font-mono uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-800">
                      {post.status}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {post.publishDate}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-[#176B80] font-semibold">
                      {post.category}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">{post.title}</h4>
                  <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
                    <span>{post.views.toLocaleString('pt-BR')} visualizações</span>
                    <span>·</span>
                    <span>Portal Oficial do Mandato</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onToggleFeatured(post.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      post.featured
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {post.featured ? '★ Destaque na Home' : 'Destacar'}
                  </button>
                  <button
                    onClick={() =>
                      alert('Pré-visualização da publicação no layout público do portal.')
                    }
                    className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                    title="Prévia pública"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Webhooks & APIs */
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Webhook className="w-4 h-4 text-[#176B80]" />
              Distribuição Externa de Conteúdo (Webhooks)
            </h3>
            <p className="text-xs text-slate-500">
              Configure endpoints seguros para republicar automaticamente matérias do gabinete no WordPress, Webflow ou aplicativo móvel do mandato.
            </p>
          </div>

          <form onSubmit={handleSaveWebhook} className="space-y-4 max-w-xl text-xs">
            <div>
              <label className="font-semibold text-slate-800 block mb-1">
                URL do Webhook de Produção
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-800"
              />
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <span className="font-semibold text-slate-900 block">
                Eventos Transmitidos:
              </span>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" defaultChecked className="rounded text-[#176B80]" />
                <span>release.published (Novo release oficial aprovado)</span>
              </label>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" defaultChecked className="rounded text-[#176B80]" />
                <span>amendment.allocated (Nova emenda cadastrada nos municípios)</span>
              </label>
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors"
            >
              Salvar Configuração de Webhook
            </button>

            {webhookSaved && (
              <p className="text-emerald-700 font-semibold text-xs">
                ✓ Endpoint salvo com sucesso e verificado com ping de teste!
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
};
