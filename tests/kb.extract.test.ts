/**
 * Extração de conteúdo e pipeline de Discursos (fila persistente → texto → Base de Conhecimento):
 * TXT, DOCX, PDF com texto (local, sem IA), PDF digitalizado (aguarda IA), arquivos inválidos.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestEnv, type TestEnv } from './helpers/env';
import { makePdf, makeDocx } from './helpers/files';

let env: TestEnv;
let h: typeof import('./helpers/app');
let extract: typeof import('../server/kb/extract');
let base = '';
let api: ReturnType<typeof import('./helpers/app').client>;
let close: () => Promise<void>;
let T = '';
let U: import('./helpers/app').User;
let dir = '';

before(async () => {
  env = await startTestEnv();
  h = await import('./helpers/app');
  extract = await import('../server/kb/extract');
  const s = await h.setupApp();
  base = s.base;
  api = h.client(s.base);
  close = s.close;
  T = await h.createTenant(env.su, 'gab-extract');
  U = await h.createUser(env.su, T, 'deputado');
  dir = path.join(env.dataDir, 'files');
  fs.mkdirSync(dir, { recursive: true });
  h.startWorker(2);
});
after(async () => {
  await h?.stopWorker();
  await close?.();
  await h?.pool.end().catch(() => undefined);
  await env?.stop();
});

const write = (name: string, data: Buffer | string) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, data);
  return p;
};

test('PDF com texto: extração local página a página, sem IA', async () => {
  const p = write('a.pdf', makePdf(['Excelentissimo Senhor Secretario', 'Solicitamos a reforma da escola estadual.\nSegunda linha da pagina dois.']));
  const r = await extract.extractFile(p, 'application/pdf', 'pdf');
  assert.equal(r.method, 'pdf-text');
  assert.equal(r.pages.length, 2);
  assert.equal(r.pages[0], 0);
  assert.ok(r.text.slice(r.pages[1]).startsWith('Solicitamos a reforma'));
  assert.equal(r.truncated, false);
});

test('PDF digitalizado sem chave de IA: aguarda IA (não falha, não envia nada)', async () => {
  const p = write('scan.pdf', makePdf(['', '']));
  await assert.rejects(extract.extractFile(p, 'application/pdf', 'pdf'), extract.NeedsAiError);
});

test('arquivos inválidos geram falha permanente', async () => {
  const { PermanentJobError } = await import('../server/jobs');
  await assert.rejects(extract.extractFile(write('bad.pdf', 'isto não é um pdf'), 'application/pdf', 'pdf'), PermanentJobError);
  await assert.rejects(extract.extractFile(write('bad.docx', 'zip quebrado'), 'x', 'docx'), PermanentJobError);
  await assert.rejects(extract.extractFile(write('bin.txt', Buffer.from([0, 1, 2, 3])), 'text/plain', 'text'), PermanentJobError);
  await assert.rejects(extract.extractFile(path.join(dir, 'nao-existe.txt'), 'text/plain', 'text'), PermanentJobError);
});

test('DOCX e TXT (UTF-8 e Latin-1)', async () => {
  const d = await extract.extractFile(write('a.docx', await makeDocx(['Primeiro parágrafo.', 'Segundo parágrafo com acentuação.'])), 'x', 'docx');
  assert.match(d.text, /Segundo parágrafo com acentuação/);
  const u = await extract.extractFile(write('u.txt', 'Saúde pública'), 'text/plain', 'text');
  assert.equal(u.text, 'Saúde pública');
  const l = await extract.extractFile(write('l.txt', Buffer.from('Educação', 'latin1')), 'text/plain', 'text');
  assert.equal(l.method, 'latin1');
  assert.equal(l.text, 'Educação');
});

async function upload(name: string, data: Buffer) {
  const c = await api(U, 'POST', '/tenant/db/speeches', { title: `Discurso ${name}`, occasion: 'Sessão Plenária', speechDate: '2026-10-01' });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const r = await fetch(`${base}/tenant/db/speeches/${c.body.id}/file`, {
    method: 'PUT',
    headers: { cookie: U.cookie, 'x-parlamentta-request': '1', 'x-file-name': encodeURIComponent(name), 'content-length': String(data.length) },
    body: new Uint8Array(data),
  });
  assert.equal(r.status, 200, await r.text());
  return c.body.id as string;
}
const speech = async (id: string) => (await env.su.query(`SELECT status, status_detail, text, text_pages FROM speeches WHERE id = $1`, [id])).rows[0];
const kb = async (id: string) => (await env.su.query(`SELECT * FROM knowledge_items WHERE source = 'discurso' AND source_id = $1`, [id])).rows[0];

test('Discurso em PDF: processado pela fila e publicado na base com páginas', async () => {
  const id = await upload('fala.pdf', makePdf(['Senhor Presidente, senhoras e senhores deputados,\nfalo hoje sobre a saude publica do nosso estado.', 'O hospital regional de Sinop precisa de novos leitos\nde UTI e de medicos plantonistas para atender a regiao.']));
  await h.waitIdle(env.su);
  const s = await speech(id);
  assert.equal(s.status, 'done', s.status_detail);
  assert.deepEqual(JSON.parse(s.text_pages).length, 2);
  const k = await kb(id);
  assert.ok(k, 'publicado na Base de Conhecimento');
  assert.equal(k.file_ref, `speech:${id}`, 'referência ao arquivo original, sem cópia');
  await h.waitIdle(env.su);
  const ch = (await env.su.query(`SELECT page_from, page_to FROM knowledge_chunks WHERE item_id = $1`, [k.id])).rows;
  assert.ok(ch.length >= 1);
  assert.equal(ch[0].page_from, 1);
  // editing the speech republishes; deleting removes it
  await api(U, 'PATCH', `/tenant/db/speeches/${id}`, { text: 'Texto revisado do discurso sobre educação.' });
  const k2 = await kb(id);
  assert.equal(k2.version, 2);
  assert.equal(k2.pages, '', 'offsets de página descartados após edição manual do texto');
  await api(U, 'DELETE', `/tenant/db/speeches/${id}`);
  const k3 = await kb(id);
  assert.ok(!k3 || k3.deleted_at);
});

test('Discurso com PDF inválido: erro permanente visível, sem retentativas inúteis, fora da base', async () => {
  const id = await upload('quebrado.pdf', Buffer.from('%PDF-1.4 lixo'));
  await h.waitIdle(env.su);
  const s = await speech(id);
  assert.equal(s.status, 'error');
  assert.match(s.status_detail, /inválido|corrompido|Nenhum texto/i);
  const j = (await env.su.query(`SELECT status, attempts FROM jobs WHERE dedupe_key = $1`, [`speech:${id}`])).rows[0];
  assert.equal(j.status, 'dead');
  assert.equal(j.attempts, 1);
  assert.equal(await kb(id), undefined);
});

test('Discurso em PDF digitalizado sem IA: fica "aguardando IA", nada é enviado', async () => {
  const id = await upload('scan.pdf', makePdf(['', '', '']));
  await h.waitIdle(env.su);
  const s = await speech(id);
  assert.equal(s.status, 'needs_ai');
  assert.equal(await kb(id), undefined);
});

test('Discurso em DOCX', async () => {
  const id = await upload('fala.docx', await makeDocx(['Discurso sobre agricultura familiar.', 'Os produtores rurais precisam de crédito.']));
  await h.waitIdle(env.su);
  assert.equal((await speech(id)).status, 'done');
  assert.ok(await kb(id));
});
