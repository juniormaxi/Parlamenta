/**
 * Confere (e, com --apply, aplica) a configuração do serviço web na Railway a partir de deploy/railway.json:
 * pré-deploy de migração, healthcheck, política de reinício, réplicas e variáveis não secretas.
 *
 *   npm run railway:config -- --env staging              # só mostra as diferenças (não altera nada)
 *   npm run railway:config -- --env production --apply   # aplica (sem disparar deploy)
 *
 * Variáveis secretas (DATABASE_URL, MIGRATION_DATABASE_URL...) nunca são lidas para exibição nem gravadas
 * por aqui: o script só confere se existem. Sai com código 2 quando há diferenças e --apply não foi pedido.
 */
import { config, target, arg, flag, gql, railway, serviceIds, currentSettings, settingsDiff, variableState, backupScheduleState, applyBackupSchedule, log } from './railway-lib';

const env = arg('env');
if (!env) {
  console.error('Uso: npm run railway:config -- --env <staging|production> [--apply]');
  process.exit(64);
}
const t = target(env);
const apply = flag('apply');
const ids = serviceIds(t);
log(`Ambiente: ${t.name} · projeto ${ids.projectName} · serviço ${config.service}${apply ? '' : ' · (simulação: nada será alterado)'}`);

const diff = settingsDiff(currentSettings(t, ids.serviceId));
const vars = variableState(t);
if (!ids.dbVolumeInstanceId) {
  console.error('✗ Volume do Postgres não encontrado.');
  process.exit(1);
}
const backups = backupScheduleState(ids.dbVolumeInstanceId);

if (!diff.length) log('✓ Configuração do serviço já está como em deploy/railway.json.');
for (const d of diff) log(`  ${apply ? '→' : '≠'} ${d.field}: ${JSON.stringify(d.from)} ⇒ ${JSON.stringify(d.to)}`);
if (vars.managedDiff.length) log(`  ${apply ? '→' : '≠'} variáveis a definir: ${vars.managedDiff.join(', ')}`);
if (vars.missingRequired.length) log(`  ✗ variáveis obrigatórias ausentes (defina à mão, são secretas): ${vars.missingRequired.join(', ')}`);
if (!backups.ok) log(`  ${apply ? '→' : '≠'} backups do Postgres: [${backups.current.join(', ') || 'nenhum'}] ⇒ [${backups.wanted.join(', ')}]`);

if (!apply) process.exit(diff.length || vars.managedDiff.length || vars.missingRequired.length || !backups.ok ? 2 : 0);
if (!backups.ok) applyBackupSchedule(ids.dbVolumeInstanceId);

if (diff.length) {
  const input = Object.fromEntries(diff.map((d) => [d.field, d.to]));
  gql(`mutation($s:String!,$e:String!,$i:ServiceInstanceUpdateInput!){ serviceInstanceUpdate(serviceId:$s, environmentId:$e, input:$i) }`, {
    s: ids.serviceId,
    e: t.environmentId,
    i: input,
  });
}
for (const k of vars.managedDiff) {
  railway(['variable', 'set', '--service', config.service, '--environment', t.environmentId, '--project', t.projectId, '--skip-deploys', '--stdin', k], {
    input: config.variables[k],
  });
}
const after = settingsDiff(currentSettings(t, ids.serviceId));
const afterVars = variableState(t);
const afterBackups = backupScheduleState(ids.dbVolumeInstanceId);
if (after.length || afterVars.managedDiff.length || !afterBackups.ok) {
  console.error(`✗ Ainda há diferenças: ${[...after.map((d) => d.field), ...afterVars.managedDiff, ...(afterBackups.ok ? [] : ['backups'])].join(', ')}`);
  process.exit(1);
}
log('✓ Configuração aplicada (vale a partir do próximo deploy).');
if (afterVars.missingRequired.length) {
  console.error(`✗ Faltam variáveis obrigatórias: ${afterVars.missingRequired.join(', ')}`);
  process.exit(3);
}
