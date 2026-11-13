/** Legislativo › Plenário: dados oficiais da casa do gabinete + ajustes do gabinete (server/plenario). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Parliamentarian, VotingSession, VoteChoice } from '../types';

export interface PlenarioSource {
  name: string;
  url: string;
  scope: string;
}

export interface PlenarioHouse {
  key: string;
  label: string;
  legislature: string;
  sources: PlenarioSource[];
  status: 'idle' | 'syncing' | 'ok' | 'error';
  progress: string;
  error: string;
  warnings: string[];
  syncedAt: string | null;
}

export interface PlenarioState {
  house: PlenarioHouse;
  mandateMemberId: string | null;
  /** mandato = concordância com o parlamentar do gabinete; maioria = com a maioria do plenário. */
  alignmentBasis: 'mandato' | 'maioria';
  members: Parliamentarian[];
  /** Parlamentares da fonte oficial retirados da composição pelo gabinete. */
  hiddenMembers: { id: string; popularName: string; party: string }[];
  sessions: VotingSession[];
}

export type MemberInput = Partial<
  Pick<Parliamentarian, 'name' | 'popularName' | 'party' | 'seatNumber' | 'uf' | 'electoralBase' | 'role' | 'phone' | 'email'>
> & { hidden?: boolean; bloc?: Parliamentarian['bloc'] | null };

export interface SessionInput {
  matterCode: string;
  matterTitle: string;
  theme: VotingSession['theme'];
  quorumType: VotingSession['quorumType'];
  date: string;
  sessionNumber?: string;
  mandateVote: VoteChoice;
  result: VotingSession['result'];
  votes: Record<string, VoteChoice>;
  summary: string;
  strategicNote?: string;
}

const normalize = (s: PlenarioState): PlenarioState => ({
  ...s,
  sessions: s.sessions.map((x) => ({ ...x, votes: x.votes ?? {} })),
});

export function usePlenario() {
  const [state, setState] = useState<PlenarioState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Votos nominais já carregados, por votação. */
  const [votes, setVotes] = useState<Record<string, { votes: Record<string, VoteChoice>; matterTitle?: string; summary?: string }>>({});
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const s = await api<PlenarioState>('/tenant/plenario');
      if (!alive.current) return;
      setState(normalize(s));
      setError(null);
    } catch (e: any) {
      if (alive.current) setError(e.message ?? 'Falha ao carregar o plenário.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  // Enquanto a importação roda, acompanha o progresso; ao terminar, recarrega os votos abertos.
  const syncing = state?.house.status === 'syncing';
  useEffect(() => {
    if (!syncing) return;
    const t = setInterval(() => void reload(), 4000);
    return () => {
      clearInterval(t);
      setVotes({});
    };
  }, [syncing, reload]);

  const apply = (s: PlenarioState) => setState(normalize(s));

  const loadVotes = useCallback(
    async (id: string) => {
      if (votes[id]) return votes[id]!;
      const r = await api<{ votes: Record<string, VoteChoice>; matterTitle?: string; summary?: string }>(`/tenant/plenario/votacoes/${encodeURIComponent(id)}`);
      setVotes((v) => ({ ...v, [id]: r }));
      return r;
    },
    [votes]
  );

  return {
    state,
    error,
    loading,
    votes,
    reload,
    loadVotes,
    async sync() {
      await api('/tenant/plenario/sincronizar', { method: 'POST' });
      await reload();
    },
    async setMandate(mandateMemberId: string | null) {
      apply(await api<PlenarioState>('/tenant/plenario/config', { method: 'PUT', body: { mandateMemberId } }));
    },
    async addMember(m: MemberInput) {
      const r = await api<{ id: string; state: PlenarioState }>('/tenant/plenario/membros', { method: 'POST', body: m });
      apply(r.state);
      return r.id;
    },
    async updateMember(id: string, m: MemberInput) {
      apply(await api<PlenarioState>(`/tenant/plenario/membros/${encodeURIComponent(id)}`, { method: 'PATCH', body: m }));
    },
    async resetMember(id: string) {
      apply(await api<PlenarioState>(`/tenant/plenario/membros/${encodeURIComponent(id)}`, { method: 'DELETE' }));
    },
    async addSession(s: SessionInput) {
      const r = await api<{ id: string; state: PlenarioState }>('/tenant/plenario/votacoes', { method: 'POST', body: s });
      setVotes((v) => ({ ...v, [r.id]: { votes: s.votes, matterTitle: s.matterTitle, summary: s.summary } }));
      apply(r.state);
      return r.id;
    },
    async patchSession(id: string, patch: { strategicNote?: string; theme?: VotingSession['theme'] }) {
      apply(await api<PlenarioState>(`/tenant/plenario/votacoes/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }));
    },
    async deleteSession(id: string) {
      apply(await api<PlenarioState>(`/tenant/plenario/votacoes/${encodeURIComponent(id)}`, { method: 'DELETE' }));
    },
  };
}

/** "2026-11-13 10:06:55" (UTC) -> "13/11/2026 06:06" no fuso do navegador. */
export function formatSyncedAt(s: string | null) {
  if (!s) return '';
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
