/**
 * Utilitários compartilhados pelos scripts de operação na Railway (railway-config.ts e deploy.ts).
 * Usam a CLI `railway` já autenticada nesta máquina (`railway login`); nenhum token fica no repositório.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface Target {
  projectId: string;
  environmentId: string;
  url: string;
  deployVia: 'github' | 'upload';
  branch?: string;
}
export interface DeployConfig {
  service: string;
  databaseService: string;
  targets: Record<string, Target>;
  settings: Record<string, unknown>;
  variables: Record<string, string>;
  requiredVariables: string[];
  /** Backups automáticos do volume do Postgres (DAILY, WEEKLY, MONTHLY). */
  databaseBackups: string[];
}

export const ROOT = path.resolve(import.meta.dirname, '..');
export const config: DeployConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy/railway.json'), 'utf8'));

export function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}
export const flag = (name: string) => process.argv.includes(`--${name}`);

export function target(name: string): Target & { name: string } {
  const t = config.targets[name];
  if (!t) throw new Error(`Ambiente desconhecido: ${name}. Use um de: ${Object.keys(config.targets).join(', ')}`);
  return { name, ...t };
}

/** Runs the Railway CLI. Never echoes variable values. */
export function railway(args: string[], opts: { input?: string; cwd?: string } = {}): string {
  return execFileSync('railway', args, {
    cwd: opts.cwd ?? ROOT,
    input: opts.input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

/** GraphQL call through `railway api` (uses the CLI session). */
export function gql<T = any>(query: string, variables: Record<string, unknown> = {}): T {
  const out = railway(['api', query, '--variables', JSON.stringify(variables)]);
  const start = out.indexOf('{');
  const j = JSON.parse(out.slice(start));
  if (j.errors?.length) throw new Error(`Railway API: ${j.errors.map((e: any) => e.message).join('; ')}`);
  return j.data as T;
}

export function serviceIds(t: Target) {
  const d = gql<any>(
    `query($p:String!){ project(id:$p){ name services{ edges{ node{ id name } } } volumes{ edges{ node{ id name volumeInstances{ edges{ node{ id serviceId environmentId mountPath } } } } } } } }`,
    { p: t.projectId }
  );
  const services = d.project.services.edges.map((e: any) => e.node) as { id: string; name: string }[];
  const svc = services.find((s) => s.name === config.service);
  const dbSvc = services.find((s) => s.name === config.databaseService);
  if (!svc) throw new Error(`Serviço "${config.service}" não encontrado no projeto ${d.project.name}.`);
  const volumes = d.project.volumes.edges.flatMap((v: any) => v.node.volumeInstances.edges.map((i: any) => ({ volume: v.node.name, ...i.node })));
  const dbVolume = volumes.find((v: any) => v.serviceId === dbSvc?.id && v.environmentId === t.environmentId);
  return { projectName: d.project.name as string, serviceId: svc.id, dbServiceId: dbSvc?.id, dbVolumeInstanceId: dbVolume?.id as string | undefined };
}

export const SETTINGS_FIELDS = Object.keys(config.settings);

export function currentSettings(t: Target, serviceId: string) {
  const d = gql<any>(
    `query($s:String!,$e:String!){ serviceInstance(serviceId:$s, environmentId:$e){ ${SETTINGS_FIELDS.join(' ')} railwayConfigFile } }`,
    { s: serviceId, e: t.environmentId }
  );
  return d.serviceInstance as Record<string, unknown>;
}

const norm = (v: unknown) => JSON.stringify(v ?? null);
export function settingsDiff(current: Record<string, unknown>) {
  return SETTINGS_FIELDS.filter((k) => norm(current[k]) !== norm(config.settings[k])).map((k) => ({
    field: k,
    from: current[k] ?? null,
    to: config.settings[k],
  }));
}

/** Variable names (and, for the managed non-secret ones, whether the value matches). Values are never printed. */
export function variableState(t: Target) {
  const kv = railway(['variable', 'list', '--service', config.service, '--environment', t.environmentId, '--project', t.projectId, '--kv'])
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l));
  const map = new Map(kv.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  return {
    missingRequired: config.requiredVariables.filter((k) => !map.get(k)),
    managedDiff: Object.entries(config.variables)
      .filter(([k, v]) => map.get(k) !== v)
      .map(([k]) => k),
  };
}

export const log = (s = '') => console.log(s);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Backup schedule of the database volume: what is configured vs. deploy/railway.json. */
export function backupScheduleState(volumeInstanceId: string) {
  const d = gql<any>(`query($v:String!){ volumeInstanceBackupScheduleList(volumeInstanceId:$v){ kind } }`, { v: volumeInstanceId });
  const current = (d.volumeInstanceBackupScheduleList as { kind: string }[]).map((s) => s.kind).sort();
  const wanted = [...config.databaseBackups].sort();
  return { current, wanted, ok: JSON.stringify(current) === JSON.stringify(wanted) };
}
export function applyBackupSchedule(volumeInstanceId: string) {
  gql(`mutation($v:String!,$k:[VolumeInstanceBackupScheduleKind!]!){ volumeInstanceBackupScheduleUpdate(volumeInstanceId:$v, kinds:$k) }`, {
    v: volumeInstanceId,
    k: config.databaseBackups,
  });
}
