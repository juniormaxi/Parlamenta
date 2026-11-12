import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageCircle,
  Search,
  Send,
  Paperclip,
  FilePlus2,
  Loader2,
  Users,
  User,
  Check,
  CheckCheck,
  Image as ImageIcon,
  FileText,
  Mic,
  Video,
  RefreshCw,
  Plus,
  X,
  BellRing,
  Settings2,
  AlertTriangle,
} from 'lucide-react';
import { uploadFile } from '../../lib/api';
import { wa, formatPhone, localPhone, type WhatsAppChat, type WhatsAppMessage, type WhatsAppOutboxItem } from '../../lib/whatsapp';
import { useDialog } from '../common/Dialogs';
import { WhatsAppConnection, useWhatsAppStatus } from './whatsapp/WhatsAppConnection';

export interface ProtocolPrefill {
  citizenName: string;
  citizenPhone: string;
  subject: string;
  description: string;
  channelName: string;
}

interface Props {
  onOpenProtocol: (prefill: ProtocolPrefill) => void;
  onUnreadChange?: (n: number) => void;
}

type Tab = 'conversas' | 'alertas' | 'conexao';

const time = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const MEDIA: Record<string, [React.ElementType, string]> = {
  image: [ImageIcon, 'Imagem'],
  video: [Video, 'Vídeo'],
  audio: [Mic, 'Áudio'],
  document: [FileText, 'Documento'],
  sticker: [ImageIcon, 'Figurinha'],
};

export const WhatsAppModule: React.FC<Props> = ({ onOpenProtocol, onUnreadChange }) => {
  const dialog = useDialog();
  const { status, error, refresh } = useWhatsAppStatus(15_000);
  const connected = status?.status === 'connected';
  const [tab, setTab] = useState<Tab>('conversas');

  useEffect(() => {
    if (status) onUnreadChange?.(status.unread);
  }, [status, onUnreadChange]);

  // ---- conversas -----------------------------------------------------------
  const [chats, setChats] = useState<WhatsAppChat[] | null>(null);
  const [query, setQuery] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [selected, setSelected] = useState<WhatsAppChat | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [newChat, setNewChat] = useState<{ phone: string; text: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  const loadChats = useCallback(async () => {
    try {
      setChats(await wa.chats());
    } catch {
      /* próxima tentativa no polling */
    }
  }, []);

  useEffect(() => {
    if (!connected || tab !== 'conversas') return;
    loadChats();
    const t = window.setInterval(loadChats, 8_000);
    return () => window.clearInterval(t);
  }, [connected, tab, loadChats]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const selectedJid = useRef<string | null>(null);
  selectedJid.current = selected?.jid ?? null;

  const loadMessages = useCallback(async (chat: string) => {
    try {
      const r = await wa.messages(chat);
      if (selectedJid.current !== chat) return; // resposta atrasada de outra conversa
      const prev = messagesRef.current;
      if (!prev || prev[0]?.chatJid !== chat) {
        setMessages(r.messages);
        setHasMore(r.hasMore);
        return;
      }
      // Mantém as mensagens antigas já carregadas ("carregar anteriores") ao atualizar.
      const ids = new Set(r.messages.map((m) => m.id));
      const older = prev.filter((m) => !ids.has(m.id) && r.messages[0] && m.at < r.messages[0].at);
      setMessages([...older, ...r.messages]);
    } catch {
      if (selectedJid.current === chat) setMessages((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    if (!selected || !connected) return;
    stickToBottom.current = true;
    setMessages(null);
    loadMessages(selected.jid);
    if (selected.unread) wa.markRead(selected.jid).catch(() => undefined);
    const t = window.setInterval(() => loadMessages(selected.jid), 4_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.jid, connected, loadMessages]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const loadOlder = async () => {
    if (!selected || !messages?.length) return;
    stickToBottom.current = false;
    const r = await wa.messages(selected.jid, messages[0].at);
    setMessages((prev) => [...r.messages.filter((m) => !prev?.some((p) => p.id === m.id)), ...(prev ?? [])]);
    setHasMore(r.hasMore);
  };

  const visibleChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (chats ?? [])
      .filter((c) => !onlyUnread || c.unread)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, '') || '§'))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.lastMessageAt ?? '').localeCompare(String(a.lastMessageAt ?? '')));
  }, [chats, query, onlyUnread]);

  const send = async () => {
    const text = draft.trim();
    if (!selected || !text || sending) return;
    setSending(true);
    try {
      await wa.send(selected.jid, text);
      setDraft('');
      stickToBottom.current = true;
      await loadMessages(selected.jid);
      loadChats();
    } catch (e) {
      dialog.alert({ title: 'Mensagem não enviada', message: (e as Error).message, tone: 'danger' });
    } finally {
      setSending(false);
    }
  };

  const sendFile = async (file: File) => {
    if (!selected) return;
    if (file.size > 32 * 1024 * 1024) {
      dialog.alert({ title: 'Arquivo grande demais', message: 'O limite é 32 MB por arquivo.', tone: 'warning' });
      return;
    }
    setSending(true);
    try {
      const caption = draft.trim();
      await uploadFile(`/tenant/whatsapp/send-file?to=${encodeURIComponent(selected.jid)}${caption ? `&caption=${encodeURIComponent(caption)}` : ''}`, file);
      setDraft('');
      dialog.toast('Arquivo enviado.', 'success');
      await loadMessages(selected.jid);
    } catch (e) {
      dialog.alert({ title: 'Arquivo não enviado', message: (e as Error).message, tone: 'danger' });
    } finally {
      setSending(false);
    }
  };

  const startNewChat = async () => {
    if (!newChat) return;
    setSending(true);
    try {
      await wa.send(newChat.phone, newChat.text.trim());
      dialog.toast('Mensagem enviada.', 'success');
      setNewChat(null);
      const list = await wa.chats();
      setChats(list);
      const digits = newChat.phone.replace(/\D/g, '');
      const hit = list.find((c) => c.phone && c.phone.replace(/\D/g, '').endsWith(digits.slice(-8)));
      if (hit) setSelected(hit);
    } catch (e) {
      dialog.alert({ title: 'Mensagem não enviada', message: (e as Error).message, tone: 'danger' });
    } finally {
      setSending(false);
    }
  };

  const openProtocol = (from?: WhatsAppMessage) => {
    if (!selected) return;
    const received = (messages ?? []).filter((m) => !m.fromMe && m.text);
    const base = from ? [from] : received.slice(-5);
    onOpenProtocol({
      citizenName: selected.kind === 'group' ? (from?.senderName ?? '') : selected.name.startsWith('+') ? '' : selected.name,
      citizenPhone: localPhone(selected.kind === 'group' ? (from?.senderJid.split('@')[0] ?? '') : selected.phone),
      // A mensagem mais longa costuma ser a que descreve o problema.
      subject: ([...base].sort((x, y) => y.text.length - x.text.length)[0]?.text ?? '').split('\n')[0].slice(0, 120),
      description: base.map((m) => m.text).join('\n\n').slice(0, 4000),
      channelName: 'WhatsApp',
    });
  };

  // ---- alertas --------------------------------------------------------------
  const [outbox, setOutbox] = useState<WhatsAppOutboxItem[] | null>(null);
  const loadOutbox = useCallback(async () => {
    try {
      setOutbox(await wa.outbox());
    } catch {
      setOutbox([]);
    }
  }, []);
  useEffect(() => {
    if (tab === 'alertas') loadOutbox();
  }, [tab, loadOutbox]);

  // ---- layout ---------------------------------------------------------------
  const tabs: [Tab, string, React.ElementType][] = [
    ['conversas', 'Conversas', MessageCircle],
    ['alertas', 'Alertas automáticos', BellRing],
    ['conexao', 'Conexão', Settings2],
  ];
  const activeTab: Tab = !connected && tab === 'conversas' ? 'conexao' : tab;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-600" />
            WhatsApp do Gabinete
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {connected ? (
              <>
                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${status?.online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {formatPhone(status!.phone)} · {status?.online ? 'online' : 'reconectando…'}
              </>
            ) : (
              'Atendimento e avisos ao cidadão pelo número oficial do gabinete'
            )}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              disabled={id === 'conversas' && !connected}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 disabled:opacity-40 ${
                activeTab === id ? 'bg-[#102C45] text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'conexao' && <WhatsAppConnection status={status} error={error} refresh={refresh} />}

      {activeTab === 'alertas' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-600">
              Mensagens enviadas automaticamente ao cidadão quando um protocolo é aberto, muda de situação ou recebe resposta.
              {status && !status.alertsEnabled && <strong className="text-amber-700"> Os alertas estão desativados (aba Conexão).</strong>}
            </p>
            <button onClick={loadOutbox} className="text-slate-500 hover:text-slate-800" title="Atualizar">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {!outbox ? (
            <div className="p-6 text-center text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin inline" />
            </div>
          ) : outbox.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">Nenhum alerta enviado ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 text-left">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Quando</th>
                    <th className="px-4 py-2 font-semibold">Protocolo</th>
                    <th className="px-4 py-2 font-semibold">Para</th>
                    <th className="px-4 py-2 font-semibold">Mensagem</th>
                    <th className="px-4 py-2 font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {outbox.map((o) => (
                    <tr key={o.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-2 whitespace-nowrap text-slate-500">{new Date(o.createdAt.replace(' ', 'T') + 'Z').toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2 font-mono">{o.ref}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatPhone(o.to)}</td>
                      <td className="px-4 py-2 text-slate-600 max-w-md">
                        <p className="line-clamp-2 whitespace-pre-line">{o.body.split("\n\n").slice(1).join("\n") || o.body}</p>
                        {o.lastError && o.status !== 'sent' && <p className="text-[10px] text-red-600 font-mono mt-1">{o.lastError}</p>}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {
                          {
                            sent: <span className="text-emerald-700 font-semibold">Enviado</span>,
                            pending: <span className="text-slate-600">Na fila</span>,
                            failed: <span className="text-red-700 font-semibold">Falhou</span>,
                            uncertain: (
                              <span className="text-amber-700 font-semibold" title="A conexão caiu durante o envio; pode ter sido entregue.">
                                Não confirmado
                              </span>
                            ),
                          }[o.status]
                        }
                        {(o.status === 'failed' || o.status === 'uncertain') && status?.canManage && (
                          <button
                            className="ml-2 text-[#176B80] font-semibold hover:underline"
                            onClick={async () => {
                              if (
                                o.status === 'uncertain' &&
                                !(await dialog.confirm({
                                  title: 'Reenviar alerta?',
                                  message: 'Este envio não foi confirmado e pode ter chegado ao cidadão. Reenviar pode duplicar a mensagem.',
                                  confirmLabel: 'Reenviar',
                                }))
                              )
                                return;
                              try {
                                await wa.retry(o.id);
                                loadOutbox();
                              } catch (e) {
                                dialog.alert({ title: 'Erro', message: (e as Error).message, tone: 'danger' });
                              }
                            }}
                          >
                            Reenviar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'conversas' && connected && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid md:grid-cols-[320px_1fr] h-[calc(100vh-15rem)] min-h-[480px]">
          {/* Lista */}
          <div className={`border-r border-slate-200 flex flex-col min-h-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-3 space-y-2 border-b border-slate-100">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar nome ou número"
                    className="w-full pl-8 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <button
                  onClick={() => setNewChat({ phone: '', text: '' })}
                  title="Nova conversa"
                  className="px-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Só não lidas
              </label>
            </div>
            {newChat && (
              <div className="p-3 border-b border-slate-100 bg-emerald-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-800">Nova conversa</p>
                  <button onClick={() => setNewChat(null)} className="text-slate-400 hover:text-slate-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  value={newChat.phone}
                  onChange={(e) => setNewChat({ ...newChat, phone: e.target.value })}
                  placeholder="Telefone com DDD — (65) 99999-0000"
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                />
                <textarea
                  value={newChat.text}
                  onChange={(e) => setNewChat({ ...newChat, text: e.target.value })}
                  placeholder="Mensagem"
                  rows={3}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs resize-none"
                />
                <button
                  disabled={sending || newChat.phone.replace(/\D/g, '').length < 10 || !newChat.text.trim()}
                  onClick={startNewChat}
                  className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {sending ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {!chats ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Carregando conversas…
                </div>
              ) : visibleChats.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  {chats.length === 0 ? 'Nenhuma conversa sincronizada ainda. Novas mensagens aparecem aqui automaticamente.' : 'Nenhuma conversa encontrada.'}
                </div>
              ) : (
                visibleChats.map((c) => (
                  <button
                    key={c.jid}
                    onClick={() => setSelected(c)}
                    className={`w-full text-left px-3 py-2.5 border-b border-slate-50 flex gap-2.5 items-start hover:bg-slate-50 ${
                      selected?.jid === c.jid ? 'bg-[#E9F1F4]' : ''
                    }`}
                  >
                    <span className="w-9 h-9 shrink-0 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center">
                      {c.kind === 'group' ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-xs truncate ${c.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{c.name}</span>
                        <span className={`text-[10px] shrink-0 ${c.unread ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>{time(c.lastMessageAt)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500 truncate">
                          {c.preview ? `${c.preview.fromMe ? 'Você: ' : ''}${c.preview.text}` : c.phone ? formatPhone(c.phone) : ''}
                        </span>
                        {c.unread && (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {c.unreadCount || ''}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Conversa */}
          <div className={`flex flex-col min-h-0 ${selected ? 'flex' : 'hidden md:flex'}`}>
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">Selecione uma conversa</div>
            ) : (
              <>
                <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <button className="md:hidden text-slate-500" onClick={() => setSelected(null)}>
                      <X className="w-4 h-4" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{selected.name}</p>
                      {selected.phone && <p className="text-[11px] text-slate-500">{formatPhone(selected.phone)}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => openProtocol()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#102C45] text-white text-xs font-semibold hover:bg-[#176B80] shrink-0"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" /> Gerar protocolo
                  </button>
                </div>

                <div
                  ref={scroller}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                  }}
                  className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 bg-[#F4F1EC]"
                >
                  {!messages ? (
                    <div className="text-center text-xs text-slate-500 py-6">
                      <Loader2 className="w-4 h-4 animate-spin inline" />
                    </div>
                  ) : (
                    <>
                      {hasMore && (
                        <div className="text-center">
                          <button onClick={loadOlder} className="text-[11px] text-[#176B80] font-semibold hover:underline">
                            Carregar mensagens anteriores
                          </button>
                        </div>
                      )}
                      {messages.length === 0 && <p className="text-center text-xs text-slate-500 py-6">Sem mensagens sincronizadas nesta conversa.</p>}
                      {messages.map((m) => {
                        const media = m.mediaType ? MEDIA[m.mediaType] ?? [FileText, m.mediaType] : null;
                        const MediaIcon = media?.[0];
                        return (
                          <div key={m.id} className={`group flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`max-w-[75%] rounded-lg px-2.5 py-1.5 text-xs shadow-xs ${
                                m.fromMe ? 'bg-[#D9FDD3] text-slate-800' : 'bg-white text-slate-800'
                              }`}
                            >
                              {selected.kind === 'group' && !m.fromMe && (
                                <p className="text-[10px] font-semibold text-[#176B80] mb-0.5">{m.senderName || m.senderJid.split('@')[0]}</p>
                              )}
                              {m.revoked ? (
                                <p className="italic text-slate-400">Mensagem apagada</p>
                              ) : (
                                <>
                                  {media && MediaIcon && (
                                    <p className="flex items-center gap-1.5 text-slate-500 mb-0.5">
                                      <MediaIcon className="w-3.5 h-3.5" /> {m.filename || media[1]}
                                    </p>
                                  )}
                                  {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                                </>
                              )}
                              <p className="text-[9px] text-slate-400 text-right mt-0.5 flex items-center justify-end gap-1">
                                {!m.fromMe && m.text && (
                                  <button
                                    onClick={() => openProtocol(m)}
                                    className="opacity-0 group-hover:opacity-100 text-[#176B80] font-semibold mr-auto"
                                    title="Gerar protocolo com esta mensagem"
                                  >
                                    + protocolo
                                  </button>
                                )}
                                {m.edited && 'editada · '}
                                {new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                {m.fromMe &&
                                  (m.readBy > 0 ? (
                                    <CheckCheck className="w-3 h-3 text-sky-500" />
                                  ) : m.deliveredTo > 0 ? (
                                    <CheckCheck className="w-3 h-3" />
                                  ) : (
                                    <Check className="w-3 h-3" />
                                  ))}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

                {!status?.online && (
                  <p className="px-4 py-1.5 text-[11px] bg-amber-50 text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Reconectando ao WhatsApp — envios ficam disponíveis em instantes.
                  </p>
                )}
                <div className="p-2.5 border-t border-slate-200 flex items-end gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) sendFile(f);
                    }}
                  />
                  <button
                    disabled={sending || !status?.online}
                    onClick={() => fileInput.current?.click()}
                    title="Enviar arquivo (o texto digitado vira legenda)"
                    className="p-2 text-slate-500 hover:text-slate-800 disabled:opacity-40"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={Math.min(5, Math.max(1, draft.split('\n').length))}
                    placeholder="Digite uma mensagem (Enter envia, Shift+Enter quebra linha)"
                    className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs resize-none"
                  />
                  <button
                    disabled={sending || !draft.trim() || !status?.online}
                    onClick={send}
                    className="p-2.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
