/** Testes puros (sem banco): fragmentação, máscara de dados pessoais, consulta textual e Mapa Neural. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://unused@127.0.0.1:1/unused'; // modules import db.ts; no query is made here
const { chunkText, pageAt } = await import('../server/kb/chunk');
const { redactPersonalData } = await import('../server/kb/sources');
const { prefixQuery } = await import('../server/knowledge');
const { buildKnowledgeGraph, computeSimilarLinks } = await import('../server/knowledgeGraph');

test('fragmentação cobre o texto inteiro para tamanhos e estruturas variados', () => {
  const rnd = (n: number) => Array.from({ length: n }, (_, i) => (i % 97 === 0 ? '\n\n' : i % 13 === 0 ? '. ' : 'palavra ')).join('');
  for (const len of [0, 10, 500, 3199, 3201, 50_000]) {
    const text = rnd(len).slice(0, len);
    const ch = chunkText(text);
    const covered = new Array(text.length).fill(false);
    for (const c of ch) {
      assert.equal(text.slice(c.charStart, c.charEnd), c.text);
      for (let i = c.charStart; i < c.charEnd; i++) covered[i] = true;
    }
    for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i]!)) assert.ok(covered[i], `posição ${i} de ${len} sem fragmento`);
    ch.forEach((c, i) => assert.equal(c.ord, i));
  }
  // a single huge "word" is still split (no infinite loop)
  const blob = 'x'.repeat(20_000);
  assert.ok(chunkText(blob).length >= 6);
});

test('seções e páginas', () => {
  const text = 'CAPÍTULO I\nDisposições gerais\n\n' + 'texto '.repeat(800) + '\n\nArt. 5 Das obrigações\n' + 'mais texto '.repeat(600);
  const ch = chunkText(text, { pages: [0, 2000, 4000] });
  assert.equal(ch[0].section, 'CAPÍTULO I');
  assert.ok(ch.some((c) => c.section.startsWith('Art. 5')));
  assert.equal(pageAt([0, 100, 200], 150), 2);
  assert.equal(pageAt([], 5), null);
});

test('máscara de dados pessoais', () => {
  const s = redactPersonalData('João Carlos da Silva, CPF 123.456.789-09, fone (65) 99999-1234, joao@x.com, CEP 78000-000. O Silva pediu a reforma da praça.', ['João Carlos da Silva']);
  for (const leak of ['João', 'Carlos', 'Silva', '123.456', '99999', 'joao@x.com', '78000']) assert.ok(!s.includes(leak), leak);
  assert.match(s, /\[cidadão\].*\[CPF\].*\[telefone\].*\[e-mail\].*\[CEP\]/);
  assert.ok(s.includes('reforma da praça'), 'partículas não são mascaradas isoladamente');
});

test('consulta textual por prefixo é segura', () => {
  assert.equal(prefixQuery("hospi saúde"), 'hospi:* & saúde:*');
  assert.equal(prefixQuery("'; DROP TABLE x; --"), 'DROP:* & TABLE:*');
  assert.equal(prefixQuery('!!! & | :*'), '');
});

test('Mapa Neural: formato preservado e candidatos (>800 docs) equivalentes ao cálculo completo', () => {
  const mk = (i: number) => ({
    id: `d${String(i).padStart(4, '0')}`,
    source: 'oficio',
    sourceId: `s${i}`,
    title: `Ofício ${i} sobre ${['hospital regional', 'escola estadual', 'rodovia estadual', 'segurança pública'][i % 4]}`,
    summary: '',
    content: `Pedido número ${i}. ${['leitos uti médicos plantão hospital', 'professores merenda escola alunos', 'asfalto pavimentação rodovia ponte', 'policiamento viaturas delegacia'][i % 4]} município${i % 37} bairro${i % 11}`,
    tags: ['Ofícios'],
    meta: { cityTarget: `Cidade ${i % 5}` },
    createdAt: '2026-01-01 00:00:00',
  });
  const small = Array.from({ length: 40 }, (_, i) => mk(i));
  const g = buildKnowledgeGraph(small);
  assert.deepEqual(Object.keys(g).sort(), ['links', 'nodes', 'stats']);
  assert.deepEqual(Object.keys(g.stats).sort(), ['documents', 'similar', 'synapses', 'themes', 'topTheme']);
  const doc = g.nodes.find((n: any) => n.kind === 'doc') as any;
  for (const k of ['id', 'label', 'summary', 'source', 'sourceId', 'tags', 'date', 'themes', 'neighbors']) assert.ok(k in doc, k);

  const big = Array.from({ length: 1200 }, (_, i) => mk(i));
  const t0 = performance.now();
  const links = computeSimilarLinks(big);
  const ms = performance.now() - t0;
  // every link connects documents of the same topic family (i % 4)
  const fam = (id: string) => Number(id.slice(1)) % 4;
  assert.ok(links.length > 1200);
  assert.ok(links.every((l) => fam(l.source) === fam(l.target)));
  console.log(`computeSimilarLinks: 1200 docs → ${links.length} ligações em ${Math.round(ms)} ms`);
});
