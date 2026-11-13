/**
 * Medições de desempenho em banco descartável (só roda com KB_PERF=1).
 * Cenário "Inicial" da auditoria: 10 gabinetes × 5.000 documentos = 50.000 documentos sintéticos.
 * Os números dependem da máquina; servem de linha de base, não de benchmark de produção.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { startTestEnv, type TestEnv } from './helpers/env';

const RUN = process.env.KB_PERF === '1';
const TENANTS = Number(process.env.KB_PERF_TENANTS || 10);
const DOCS = Number(process.env.KB_PERF_DOCS || 5000);

let env: TestEnv;
let h: typeof import('./helpers/app');
let api: ReturnType<typeof import('./helpers/app').client>;
let close: () => Promise<void>;
const tenants: string[] = [];
const users: import('./helpers/app').User[] = [];
const results: Record<string, unknown> = {};

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]! * 10) / 10;
};
async function measure(n: number, fn: (i: number) => Promise<unknown>) {
  const ts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn(i);
    ts.push(performance.now() - t0);
  }
  return { n, p50: pct(ts, 0.5), p95: pct(ts, 0.95), max: Math.round(Math.max(...ts)) };
}

before(async () => {
  if (!RUN) return;
  env = await startTestEnv({ KB_GRAPH_DEBOUNCE_MS: '3600000' }); // graph rebuilt explicitly below
  h = await import('./helpers/app');
  const s = await h.setupApp();
  api = h.client(s.base);
  close = s.close;
  for (let i = 0; i < TENANTS; i++) {
    const t = await h.createTenant(env.su, `perf-${i}`);
    tenants.push(t);
    users.push(await h.createUser(env.su, t, 'deputado'));
  }
});
after(async () => {
  if (!RUN) return;
  await h?.stopWorker();
  await close?.();
  await h?.pool.end().catch(() => undefined);
  await env?.stop();
  console.log('\n=== MEDIÇÕES ===\n' + JSON.stringify(results, null, 2));
});

test('ingestão real: publicação síncrona e indexação pela fila', { skip: !RUN }, async () => {
  const { publishDocument } = await import('../server/kb/ingest');
  const words = 'saude hospital leitos escola professores rodovia asfalto ponte policia seguranca agricultura produtor credito habitacao moradia cultura esporte emprego renda orcamento emenda convenio'.split(' ');
  const N = 1000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const body = Array.from({ length: 400 }, (_, j) => words[(i * 7 + j * 13) % words.length]).join(' ');
    await publishDocument(tenants[0]!, 'perf', `p${i}`, { title: `Documento ${i}`, content: `${body}\n\n${body}` }, users[0]!.id);
  }
  const pubMs = performance.now() - t0;
  const t1 = performance.now();
  h.startWorker(4);
  await h.waitIdle(env.su, 300_000);
  const idxMs = performance.now() - t1;
  results.ingestao = {
    documentos: N,
    publicacaoDocsPorSegundo: Math.round(N / (pubMs / 1000)),
    indexacaoDocsPorSegundo_4workers: Math.round(N / (idxMs / 1000)),
    observacao: 'inclui fila, hash, versões, auditoria e fragmentação; o Mapa Neural foi adiado (debounce).',
  };
  await h.stopWorker();
});

test('carga sintética de 50 mil documentos (SQL em lote)', { skip: !RUN }, async () => {
  const t0 = performance.now();
  for (const t of tenants) {
    await env.su.query(
      `WITH w AS (SELECT ARRAY['saude','hospital','leitos','escola','professores','rodovia','asfalto','ponte','policia','seguranca','agricultura',
                               'produtor','credito','habitacao','moradia','cultura','esporte','emprego','renda','orcamento','emenda','convenio',
                               'municipio','regional','estadual','urgente','reforma','construcao','ampliacao','manutencao'] AS a)
       INSERT INTO knowledge_items (id, tenant_id, source, source_id, title, summary, content, tags, meta, visibility, content_hash, content_bytes,
                                    index_status, doc_type, doc_date, themes, created_at, updated_at)
       SELECT $1 || ':' || g, $1, 'sint', g::text, 'Documento ' || g || ' ' || (SELECT a[1 + g % 30] FROM w), '',
              (SELECT string_agg(a[1 + ((g * 31 + k * 17) % 30)], ' ') FROM w, generate_series(1, 450) k)
                || ' ' || (SELECT string_agg(translate(substr(md5(((g % 400) * 7 + k)::text), 1, 8), '0123456789', 'ghijklmnop'), ' ') FROM generate_series(1, 6) k)
                || ' ' || (SELECT string_agg(translate(substr(md5(((g % 900) * 3 + k + 100000)::text), 1, 7), '0123456789', 'ghijklmnop'), ' ') FROM generate_series(1, 4) k),
              '["Sintético"]', '{}', CASE WHEN g % 10 = 0 THEN 'roles' ELSE 'tenant' END, md5(g::text), 3000, 'indexed', 'sint',
              to_char(date '2024-01-01' + (g % 700), 'YYYY-MM-DD'), '[{"theme":"Saúde","weight":1}]',
              to_char(now() - (g || ' minutes')::interval, 'YYYY-MM-DD HH24:MI:SS'), to_char(now() - (g || ' minutes')::interval, 'YYYY-MM-DD HH24:MI:SS')
         FROM generate_series(1, $2::int) g`,
      [t, DOCS]
    );
    await env.su.query(
      `INSERT INTO knowledge_chunks (id, tenant_id, item_id, version, ord, text, chunk_hash, char_start, char_end, token_estimate)
       SELECT id || ':1:0', tenant_id, id, 1, 0, content, md5(content), 0, length(content), length(content) / 4 FROM knowledge_items WHERE tenant_id = $1 AND source = 'sint'`,
      [t]
    );
  }
  await env.su.query('ANALYZE');
  const n = (await env.su.query(`SELECT COUNT(*)::int AS n FROM knowledge_items`)).rows[0].n;
  const size = (await env.su.query(`SELECT pg_size_pretty(pg_total_relation_size('knowledge_items')) AS items, pg_size_pretty(pg_total_relation_size('knowledge_chunks')) AS chunks`)).rows[0];
  results.carga = { documentos: n, segundos: Math.round((performance.now() - t0) / 1000), tamanhoCatalogo: size.items, tamanhoFragmentos: size.chunks };
  assert.ok(n >= TENANTS * DOCS);
});

test('latência das consultas (API completa, papel com RLS)', { skip: !RUN }, async () => {
  const u = users[3]!;
  results.listagem = await measure(30, () => api(u, 'GET', '/tenant/knowledge'));
  results.buscaTextual = await measure(30, (i) => api(u, 'GET', `/tenant/knowledge?q=${['hospital', 'rodovia asfalto', 'professores', 'emenda convenio', 'mor'][i % 5]}`));
  results.buscaPorEtiqueta = await measure(20, () => api(u, 'GET', '/tenant/knowledge?tag=Sint%C3%A9tico'));
  results.documento = await measure(30, (i) => api(u, 'GET', `/tenant/knowledge/${tenants[3]}:${i + 1}`));
  // concurrency: 10 cabinets × 5 simultaneous requests
  const t0 = performance.now();
  const all = await Promise.all(Array.from({ length: 50 }, (_, i) => api(users[i % TENANTS]!, 'GET', `/tenant/knowledge?q=hospital`)));
  results.concorrencia = { requisicoes: 50, simultaneas: 50, segundosTotais: Math.round(performance.now() - t0) / 1000, todasOk: all.every((r) => r.status === 200) };
  assert.ok(all.every((r) => r.status === 200));
  const ex = await env.su.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT k.id FROM knowledge_items k WHERE k.tenant_id = $1 AND k.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM knowledge_chunks c WHERE c.item_id = k.id AND c.tenant_id = k.tenant_id AND c.tsv @@ to_tsquery('portuguese', 'hospital:*'))
       ORDER BY k.updated_at DESC LIMIT 500`,
    [tenants[3]]
  );
  results.planoBuscaTextual = ex.rows.map((r) => r['QUERY PLAN']).filter((l: string) => /Scan|Execution Time|Planning Time/.test(l)).slice(0, 8);
});

test('Mapa Neural: recálculo em segundo plano sem bloquear o event loop', { skip: !RUN }, async () => {
  const { rebuildGraph } = await import('../server/kb/jobs');
  const h2 = monitorEventLoopDelay({ resolution: 10 });
  h2.enable();
  const r = await rebuildGraph(tenants[5]!);
  h2.disable();
  results.mapaNeuralRecalculo = { documentos: r.docs, ligacoes: r.links, ms: r.ms, eventLoopAtrasoMaxMs: Math.round(h2.max / 1e6), eventLoopP99Ms: Math.round(h2.percentile(99) / 1e6) };
  results.mapaNeuralLeitura = await measure(15, () => api(users[5]!, 'GET', '/tenant/knowledge/graph'));
  results.mapaNeuralLeituraFiltrada = await measure(15, () => api(users[5]!, 'GET', '/tenant/knowledge/graph?from=2024-03-01&to=2024-03-31'));
  // the old approach (everything on the request thread) for comparison, on the same 600 most recent docs
  const { buildKnowledgeGraph } = await import('../server/knowledgeGraph');
  const rows = (await env.su.query(`SELECT id, source, source_id, title, summary, content, tags, meta, created_at FROM knowledge_items WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 600`, [tenants[5]])).rows;
  const t0 = performance.now();
  buildKnowledgeGraph(rows.map((x) => ({ id: x.id, source: x.source, sourceId: x.source_id, title: x.title, summary: x.summary, content: x.content, tags: [], meta: {}, createdAt: x.created_at })));
  results.mapaNeuralAbordagemAnterior_600docs_bloqueioMs = Math.round(performance.now() - t0);
});
