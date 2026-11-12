/**
 * Página pública do gabinete (/site/<gabinete>) — para o site do parlamentar.
 * O cidadão abre uma demanda (entra em Protocolos com a tag "Demanda Web") e acompanha a
 * linha do tempo pelo número do protocolo + 4 últimos dígitos do telefone.
 * Pode ser incorporada por iframe (?embed=1 remove o cabeçalho e o rodapé).
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Search, ShieldCheck, Clock, Landmark, AlertCircle, Copy } from 'lucide-react';
import { api } from '../../lib/api';
import { MunicipioAutocomplete } from '../common/MunicipioAutocomplete';

type Site = { name: string; parliamentarian: string; house: string; state: string; themes: string[] };
type Tracking = {
  number: string;
  status: string;
  statusLabel: string;
  theme: string;
  city: string;
  subject: string;
  createdAt: string;
  events: { at: string; action: string; description: string }[];
};

const input =
  'w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#176B80]/40 focus:border-[#176B80]';
const label = 'block text-sm font-semibold text-slate-800 mb-1';
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export function PublicSitePage({ slug }: { slug: string }) {
  const params = new URLSearchParams(window.location.search);
  const embed = params.get('embed') === '1';
  const [site, setSite] = useState<Site | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<'abrir' | 'consultar'>(params.get('protocolo') ? 'consultar' : 'abrir');

  useEffect(() => {
    api<Site>(`/public/sites/${encodeURIComponent(slug)}`)
      .then((s) => {
        setSite(s);
        document.title = `Atendimento ao Cidadão · ${s.parliamentarian || s.name}`;
      })
      .catch((e) => setLoadError((e as Error).message));
  }, [slug]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-sm text-slate-600">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          {loadError}
        </div>
      </div>
    );
  }
  if (!site) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">Carregando…</div>;

  return (
    <div className={`min-h-screen ${embed ? 'bg-transparent' : 'bg-[#F4F7F9]'} text-slate-800`}>
      {!embed && (
        <header className="bg-[#102C45] text-white">
          <div className="max-w-3xl mx-auto px-4 py-6 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Landmark className="w-6 h-6 text-[#36B7A5]" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-[#36B7A5] font-semibold">Atendimento ao Cidadão</p>
              <h1 className="text-lg sm:text-xl font-bold leading-tight">{site.parliamentarian || site.name}</h1>
              <p className="text-xs text-slate-300">{[site.house, site.state].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
        </header>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-200" role="tablist">
            {(
              [
                ['abrir', 'Abrir protocolo', FileText],
                ['consultar', 'Consultar protocolo', Search],
              ] as const
            ).map(([id, text, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  tab === id ? 'border-[#176B80] text-[#102C45] bg-[#E9F1F4]/50' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {text}
              </button>
            ))}
          </div>
          <div className="p-5 sm:p-7">
            {tab === 'abrir' ? (
              <OpenForm slug={slug} site={site} onTrack={() => setTab('consultar')} />
            ) : (
              <TrackForm slug={slug} initialNumber={params.get('protocolo') ?? ''} />
            )}
          </div>
        </div>
        {!embed && (
          <p className="text-center text-[11px] text-slate-400 mt-6">
            Seus dados são tratados conforme a LGPD (Lei nº 13.709/2018) exclusivamente para o atendimento da sua demanda.
          </p>
        )}
      </main>
    </div>
  );
}

function OpenForm({ slug, site, onTrack }: { slug: string; site: Site; onTrack: () => void }) {
  const empty = { name: '', city: '', phone: '', email: '', theme: '', subject: '', description: '', consent: false, website: '' };
  const [f, setF] = useState(empty);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const r = await api<{ number: string }>(`/public/sites/${encodeURIComponent(slug)}/protocols`, { method: 'POST', body: f });
      setDone(r.number);
      setF(empty);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-6 space-y-4">
        <CheckCircle2 className="w-12 h-12 text-[#36B7A5] mx-auto" />
        <div>
          <h2 className="text-lg font-bold text-slate-900">Demanda registrada!</h2>
          <p className="text-sm text-slate-600 mt-1">Guarde o número do seu protocolo para acompanhar o andamento:</p>
        </div>
        <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#E9F1F4] border border-[#176B80]/30">
          <span className="font-mono text-xl font-bold text-[#102C45] tracking-wide">{done}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(done).then(() => setCopied(true)).catch(() => undefined)}
            className="p-1.5 rounded-md hover:bg-white text-[#176B80]"
            aria-label="Copiar número do protocolo"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        {copied && <p className="text-xs text-[#176B80]">Número copiado.</p>}
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Para consultar, informe este número e os 4 últimos dígitos do telefone que você cadastrou. A equipe do gabinete fará a triagem e você
          poderá acompanhar cada etapa.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <button onClick={onTrack} className="px-4 py-2 text-sm font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg">
            Consultar protocolo
          </button>
          <button onClick={() => setDone(null)} className="px-4 py-2 text-sm font-semibold text-[#102C45] border border-slate-300 rounded-lg hover:bg-slate-50">
            Abrir outra demanda
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Registre sua solicitação ao gabinete. Ela recebe um número de protocolo e é encaminhada para a equipe de atendimento.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="w-name">Nome completo *</label>
          <input id="w-name" className={input} required maxLength={200} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
        </div>
        <div>
          <label className={label} htmlFor="w-city">Município *</label>
          <MunicipioAutocomplete id="w-city" value={f.city} onChange={(city) => setF({ ...f, city })} className={input} placeholder="Digite o nome do município" />
        </div>
        <div>
          <label className={label} htmlFor="w-phone">Telefone / WhatsApp *</label>
          <input
            id="w-phone"
            className={input}
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="(65) 99999-9999"
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: fmtPhone(e.target.value) })}
          />
        </div>
        <div>
          <label className={label} htmlFor="w-email">E-mail</label>
          <input id="w-email" type="email" className={input} maxLength={200} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        </div>
        <div>
          <label className={label} htmlFor="w-theme">Tema da demanda *</label>
          <select id="w-theme" className={input} required value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })}>
            <option value="">Selecione…</option>
            {site.themes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="w-subject">Assunto *</label>
          <input
            id="w-subject"
            className={input}
            required
            maxLength={300}
            placeholder="Ex.: Reforma da ponte sobre o Rio Claro"
            value={f.subject}
            onChange={(e) => setF({ ...f, subject: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="w-desc">Detalhamento dos fatos *</label>
          <textarea
            id="w-desc"
            className={`${input} min-h-[180px] resize-y leading-relaxed`}
            rows={8}
            required
            maxLength={8000}
            placeholder="Descreva a situação, onde acontece, há quanto tempo e o que você precisa."
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </div>
      </div>

      {/* Honeypot anti-spam: invisível para pessoas. */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
        </label>
      </div>

      <label className="flex items-start gap-2.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
        <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#176B80]" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} required />
        <span>
          Autorizo o gabinete a usar meus dados exclusivamente para o atendimento desta demanda e para me informar sobre o andamento, conforme a LGPD
          (Lei nº 13.709/2018).
        </span>
      </label>

      {error && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-start gap-2" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg disabled:opacity-60"
      >
        {sending ? 'Enviando…' : 'Enviar demanda'}
      </button>
    </form>
  );
}

function TrackForm({ slug, initialNumber }: { slug: string; initialNumber: string }) {
  const [number, setNumber] = useState(initialNumber);
  const [last4, setLast4] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<Tracking | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      setData(
        await api<Tracking>(`/public/sites/${encodeURIComponent(slug)}/consulta`, {
          method: 'POST',
          body: { number: number.trim(), phoneLast4: last4 },
        })
      );
    } catch (err) {
      setData(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const closed = data && (data.status === 'resolvido' || data.status === 'cancelado');

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">Acompanhe o andamento da sua demanda.</p>
        <div className="grid sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
          <div>
            <label className={label} htmlFor="t-num">Número do protocolo</label>
            <input
              id="t-num"
              className={`${input} font-mono uppercase`}
              required
              placeholder="PRT-2026-00001"
              value={number}
              onChange={(e) => setNumber(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className={label} htmlFor="t-last4">4 últimos dígitos do telefone</label>
            <input
              id="t-last4"
              className={`${input} font-mono tracking-widest`}
              required
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="0000"
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          <button type="submit" disabled={loading} className="px-5 py-2.5 text-sm font-semibold text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg disabled:opacity-60">
            {loading ? 'Consultando…' : 'Consultar'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#176B80]" />
          Pedimos os dígitos do telefone para que só você veja o andamento da sua demanda.
        </p>
      </form>

      {error && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-start gap-2" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      {data && (
        <section className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-sm font-bold text-[#102C45]">{data.number}</p>
              <p className="text-sm text-slate-800 font-semibold">{data.subject}</p>
              <p className="text-xs text-slate-500">
                {data.theme} · {data.city} · aberto em {fmtDate(data.createdAt)}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                data.status === 'resolvido'
                  ? 'bg-emerald-100 text-emerald-800'
                  : data.status === 'cancelado'
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-[#E9F1F4] text-[#176B80]'
              }`}
            >
              {data.statusLabel}
            </span>
          </div>
          <ol className="p-4 sm:p-5 space-y-0">
            {data.events.map((e, i) => {
              const last = i === data.events.length - 1;
              return (
                <li key={i} className="relative pl-7 pb-5 last:pb-0">
                  {!last && <span className="absolute left-[9px] top-5 bottom-0 w-px bg-slate-200" aria-hidden="true" />}
                  <span
                    className={`absolute left-0 top-0.5 w-[19px] h-[19px] rounded-full border-2 flex items-center justify-center ${
                      last ? (closed ? 'bg-emerald-500 border-emerald-500' : 'bg-[#176B80] border-[#176B80]') : 'bg-white border-slate-300'
                    }`}
                  >
                    {last && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <p className="text-sm font-semibold text-slate-900">{e.action}</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {fmtDate(e.at)}
                  </p>
                  {e.description && <p className="text-sm text-slate-700 mt-1 whitespace-pre-line">{e.description}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
