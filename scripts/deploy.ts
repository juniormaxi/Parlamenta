/**
 * Deploy a partir deste terminal, com as mesmas etapas sempre:
 *
 *   npm run deploy -- --env staging                 # envia o commit atual (git archive HEAD) para staging
 *   npm run deploy -- --env production              # push da main → deploy pelo gatilho do GitHub na Railway
 *   npm run deploy -- --env production --rollback   # volta para o deploy anterior bem-sucedido (código; o banco não volta)
 *
 * Etapas: 1) árvore limpa; em produção, avanço direto da main  2) tipos + testes (--skip-tests pula)  3) configuração do serviço
 * igual a deploy/railway.json (senão para e manda rodar `npm run railway:config`)  4) backup do volume do
 * Postgres (obrigatório em produção; --no-backup só em staging)  5) deploy  6) acompanha até SUCCESS/FAILED
 * e confere /api/health.
 *
 * Na Railway, a migração roda no pré-deploy: se ela falhar, ou se o healthcheck não passar, o deploy fica
 * FAILED e a versão anterior continua no ar.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, config, target, arg, flag, gql, railway, serviceIds, currentSettings, settingsDiff, variableState, log, sleep } from './railway-lib';

const env = arg('env');
if (!env) {
  console.error('Uso: npm run deploy -- --env <staging|production> [--skip-tests] [--no-backup] [--rollback] [--yes]');
  process.exit(64);
}
const t = target(env);
const prod = t.name === 'production';
const git = (...a: string[]) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const step = (n: number, s: string) => log(`\n[${n}] ${s}`);
const fail = (s: string): never => {
  console.error(`\n✗ ${s}`);
  process.exit(1);
};

const ids = serviceIds(t);

function deployments(first = 10) {
  const d = gql<any>(
    `query($i:DeploymentListInput!,$f:Int){ deployments(input:$i, first:$f){ edges{ node{ id status createdAt meta } } } }`,
    { i: { projectId: t.projectId, environmentId: t.environmentId, serviceId: ids.serviceId }, f: first }
  );
  return d.deployments.edges.map((e: any) => e.node) as { id: string; status: string; createdAt: string; meta: any }[];
}

async function health() {
  try {
    const r = await fetch(`${t.url}/api/health`, { signal: AbortSignal.timeout(15_000) });
    return { status: r.status, body: (await r.text()).slice(0, 200) };
  } catch (e) {
    return { status: 0, body: String((e as Error).message) };
  }
}

const FINAL = new Set(['SUCCESS', 'FAILED', 'CRASHED', 'REMOVED', 'SKIPPED']);
async function follow(match: (d: { id: string; meta: any; createdAt: string }) => boolean, timeoutMs = 25 * 60_000) {
  const t0 = Date.now();
  let last = '';
  let dep: { id: string; status: string } | undefined;
  while (Date.now() - t0 < timeoutMs) {
    dep = deployments(10).find(match);
    const s = dep ? dep.status : 'aguardando a Railway criar o deploy';
    if (s !== last) log(`    ${new Date().toISOString().slice(11, 19)} ${s}`);
    last = s;
    if (dep && FINAL.has(dep.status)) return dep;
    await sleep(10_000);
  }
  return fail(`Tempo esgotado acompanhando o deploy${dep ? ` ${dep.id}` : ''}. Veja no painel da Railway.`);
}

// ---------------------------------------------------------------------------
if (flag('rollback')) {
  const list = deployments(20);
  const current = list.find((d) => d.status === 'SUCCESS');
  const previous = list.filter((d) => d.status === 'REMOVED' || d.status === 'SUCCESS').find((d) => d.id !== current?.id);
  if (!previous) fail('Não há deploy anterior para voltar.');
  log(`Rollback em ${t.name}: ${current?.id ?? '—'} → ${previous!.id} (${previous!.createdAt})`);
  log('Atenção: só o código volta. As migrações são aditivas, então a versão anterior roda sobre o esquema novo.');
  if (!flag('yes')) fail('Confirme com --yes.');
  gql(`mutation($id:String!){ deploymentRollback(id:$id) }`, { id: previous!.id });
  const started = Date.now();
  const dep = await follow((d) => Date.parse(d.createdAt) >= started - 5_000);
  log(`    resultado: ${dep.status} · health ${JSON.stringify(await health())}`);
  process.exit(dep.status === 'SUCCESS' ? 0 : 1);
}

// 1) git
step(1, 'Código');
if (git('status', '--porcelain')) fail('Há alterações não commitadas. Faça commit (o deploy envia só o que está commitado).');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const sha = git('rev-parse', 'HEAD');
log(`    ${branch} @ ${sha.slice(0, 7)} — ${git('log', '-1', '--format=%s')}`);
if (t.deployVia === 'github') {
  // Publica o commit atual em origin/<branch> só por avanço direto (fast-forward): nunca reescreve a main.
  execFileSync('git', ['fetch', '-q', 'origin', t.branch!], { cwd: ROOT });
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', `origin/${t.branch}`, sha], { cwd: ROOT });
  } catch {
    fail(`${sha.slice(0, 7)} não é um avanço direto de origin/${t.branch}. Atualize sua branch com a ${t.branch} antes.`);
  }
  const ahead = git('rev-list', '--count', `origin/${t.branch}..${sha}`);
  log(`    ${ahead} commit(s) à frente de origin/${t.branch}`);
}

// 2) checks
step(2, 'Tipos e testes');
if (flag('skip-tests')) log('    pulado (--skip-tests)');
else {
  execFileSync('npm', ['run', 'lint'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('npm', ['test'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  log('    ✓ tipos e testes ok');
}

// 3) Railway config
step(3, `Configuração do serviço (${ids.projectName})`);
const diff = settingsDiff(currentSettings(t, ids.serviceId));
const vars = variableState(t);
if (diff.length || vars.managedDiff.length || vars.missingRequired.length) {
  for (const d of diff) log(`    ≠ ${d.field}: ${JSON.stringify(d.from)} ⇒ ${JSON.stringify(d.to)}`);
  if (vars.managedDiff.length) log(`    ≠ variáveis: ${vars.managedDiff.join(', ')}`);
  if (vars.missingRequired.length) log(`    ✗ variáveis obrigatórias ausentes: ${vars.missingRequired.join(', ')}`);
  fail(`A configuração do serviço difere de deploy/railway.json. Rode: npm run railway:config -- --env ${t.name} --apply`);
}
log('    ✓ pré-deploy de migração, healthcheck, réplicas e variáveis conferidos');

// 4) backup
step(4, 'Backup do banco');
if (!flag('no-backup') || prod) {
  if (!ids.dbVolumeInstanceId) fail('Volume do Postgres não encontrado para backup.');
  const before = new Set(
    (gql<any>(`query($v:String!){ volumeInstanceBackupList(volumeInstanceId:$v){ id } }`, { v: ids.dbVolumeInstanceId }).volumeInstanceBackupList as any[]).map((b) => b.id)
  );
  const name = `pre-deploy ${sha.slice(0, 7)} ${new Date().toISOString().slice(0, 16)}`;
  gql(`mutation($v:String!,$n:String){ volumeInstanceBackupCreate(volumeInstanceId:$v, name:$n){ workflowId } }`, { v: ids.dbVolumeInstanceId, n: name });
  let backup: any;
  for (let i = 0; i < 60 && !backup; i++) {
    await sleep(5_000);
    backup = (gql<any>(`query($v:String!){ volumeInstanceBackupList(volumeInstanceId:$v){ id name createdAt usedMB } }`, { v: ids.dbVolumeInstanceId })
      .volumeInstanceBackupList as any[]).find((b) => !before.has(b.id));
  }
  if (!backup) fail('O backup não apareceu em 5 minutos; deploy cancelado.');
  log(`    ✓ backup "${backup.name}" (${backup.id}, ${backup.usedMB ?? '?'} MB)`);
} else log('    pulado (--no-backup)');

// 5) deploy
step(5, `Deploy em ${t.name}`);
const before = await health();
log(`    health antes: ${before.status}`);
let match: (d: { meta: any; createdAt: string }) => boolean;
if (t.deployVia === 'github') {
  if (!flag('yes')) fail(`Isto publica ${sha.slice(0, 7)} em PRODUÇÃO (push de ${t.branch} → gatilho da Railway). Confirme com --yes.`);
  execFileSync('git', ['push', 'origin', `HEAD:${t.branch}`], { cwd: ROOT, stdio: 'inherit' });
  match = (d) => d.meta?.commitHash === sha;
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parlamenta-deploy-'));
  execFileSync('sh', ['-c', `git archive ${sha} | tar -x -C "${dir}"`], { cwd: ROOT });
  const started = Date.now();
  railway(['up', dir, '--path-as-root', '--detach', '--project', t.projectId, '--environment', t.environmentId, '--service', config.service, '--message', `${sha.slice(0, 7)} ${git('log', '-1', '--format=%s')}`.slice(0, 120)], { cwd: dir });
  fs.rmSync(dir, { recursive: true, force: true });
  match = (d) => Date.parse(d.createdAt) >= started - 5_000;
}

// 6) follow
step(6, 'Acompanhando (build → migração no pré-deploy → healthcheck)');
const t0 = Date.now();
const dep = await follow(match);
const h = await health();
log(`\n${dep.status === 'SUCCESS' ? '✓' : '✗'} ${t.name}: ${dep.status} em ${Math.round((Date.now() - t0) / 1000)} s · deploy ${dep.id} · health ${h.status}`);
if (dep.status !== 'SUCCESS') {
  log('  A versão anterior continua no ar (a Railway só troca quando migração e healthcheck passam).');
  log(`  Logs: railway logs --deployment ${dep.id}`);
  process.exit(1);
}
if (h.status !== 200) fail(`Deploy concluído, mas /api/health respondeu ${h.status}. Avalie: npm run deploy -- --env ${t.name} --rollback --yes`);
