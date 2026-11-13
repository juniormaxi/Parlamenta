/**
 * Regras da casa legislativa de cada gabinete (usado no servidor e no cliente).
 *
 * - FEDERAL: Câmara dos Deputados, 513 cadeiras (LC 78/1993; bancadas de 8 a 70 por UF).
 * - ESTADUAL: Assembleia Legislativa da UF. Nº de deputados estaduais = 3 × bancada federal
 *   até 36; acima disso, 36 + (bancada federal − 12) (CF, art. 27). DF: Câmara Legislativa, 24 distritais.
 * - MUNICIPAL: Câmara Municipal. Limite máximo de vereadores por faixa populacional (CF, art. 29, IV,
 *   EC 58/2009), de 9 a 55; o número exato é fixado pela Lei Orgânica do município.
 */
export type Sphere = 'estadual' | 'federal' | 'municipal';

export interface UfInfo {
  uf: string;
  name: string;
  /** Deputados federais da UF (legislatura 2023–2027). */
  federal: number;
  /** Sigla usual da Assembleia Legislativa. */
  assembly: string;
}

export const UFS: UfInfo[] = [
  { uf: 'AC', name: 'Acre', federal: 8, assembly: 'ALEAC' },
  { uf: 'AL', name: 'Alagoas', federal: 9, assembly: 'ALE-AL' },
  { uf: 'AP', name: 'Amapá', federal: 8, assembly: 'ALEAP' },
  { uf: 'AM', name: 'Amazonas', federal: 8, assembly: 'ALEAM' },
  { uf: 'BA', name: 'Bahia', federal: 39, assembly: 'ALBA' },
  { uf: 'CE', name: 'Ceará', federal: 22, assembly: 'ALECE' },
  { uf: 'DF', name: 'Distrito Federal', federal: 8, assembly: 'CLDF' },
  { uf: 'ES', name: 'Espírito Santo', federal: 10, assembly: 'ALES' },
  { uf: 'GO', name: 'Goiás', federal: 17, assembly: 'ALEGO' },
  { uf: 'MA', name: 'Maranhão', federal: 18, assembly: 'ALEMA' },
  { uf: 'MT', name: 'Mato Grosso', federal: 8, assembly: 'ALMT' },
  { uf: 'MS', name: 'Mato Grosso do Sul', federal: 8, assembly: 'ALEMS' },
  { uf: 'MG', name: 'Minas Gerais', federal: 53, assembly: 'ALMG' },
  { uf: 'PA', name: 'Pará', federal: 17, assembly: 'ALEPA' },
  { uf: 'PB', name: 'Paraíba', federal: 12, assembly: 'ALPB' },
  { uf: 'PR', name: 'Paraná', federal: 30, assembly: 'ALEP' },
  { uf: 'PE', name: 'Pernambuco', federal: 25, assembly: 'ALEPE' },
  { uf: 'PI', name: 'Piauí', federal: 10, assembly: 'ALEPI' },
  { uf: 'RJ', name: 'Rio de Janeiro', federal: 46, assembly: 'ALERJ' },
  { uf: 'RN', name: 'Rio Grande do Norte', federal: 8, assembly: 'ALRN' },
  { uf: 'RS', name: 'Rio Grande do Sul', federal: 31, assembly: 'ALRS' },
  { uf: 'RO', name: 'Rondônia', federal: 8, assembly: 'ALERO' },
  { uf: 'RR', name: 'Roraima', federal: 8, assembly: 'ALERR' },
  { uf: 'SC', name: 'Santa Catarina', federal: 16, assembly: 'ALESC' },
  { uf: 'SP', name: 'São Paulo', federal: 70, assembly: 'ALESP' },
  { uf: 'SE', name: 'Sergipe', federal: 8, assembly: 'ALESE' },
  { uf: 'TO', name: 'Tocantins', federal: 8, assembly: 'ALETO' },
];
export const ufInfo = (uf: string) => UFS.find((u) => u.uf === (uf || '').toUpperCase());

export const FEDERAL_SEATS = 513;

/** CF, art. 27: 3× a bancada federal até 36; acima, 36 + (bancada − 12). DF: 24 (art. 32, §3º). */
export function stateAssemblySeats(uf: string): number | null {
  const u = ufInfo(uf);
  if (!u) return null;
  if (u.uf === 'DF') return 24;
  return u.federal <= 12 ? u.federal * 3 : 36 + (u.federal - 12);
}

/** CF, art. 29, IV (EC 58/2009): limite máximo de vereadores por faixa populacional. */
export const MUNICIPAL_BRACKETS: { upTo: number | null; label: string; seats: number }[] = [
  { upTo: 15_000, label: 'até 15 mil habitantes', seats: 9 },
  { upTo: 30_000, label: '15 mil a 30 mil', seats: 11 },
  { upTo: 50_000, label: '30 mil a 50 mil', seats: 13 },
  { upTo: 80_000, label: '50 mil a 80 mil', seats: 15 },
  { upTo: 120_000, label: '80 mil a 120 mil', seats: 17 },
  { upTo: 160_000, label: '120 mil a 160 mil', seats: 19 },
  { upTo: 300_000, label: '160 mil a 300 mil', seats: 21 },
  { upTo: 450_000, label: '300 mil a 450 mil', seats: 23 },
  { upTo: 600_000, label: '450 mil a 600 mil', seats: 25 },
  { upTo: 750_000, label: '600 mil a 750 mil', seats: 27 },
  { upTo: 900_000, label: '750 mil a 900 mil', seats: 29 },
  { upTo: 1_050_000, label: '900 mil a 1,05 milhão', seats: 31 },
  { upTo: 1_200_000, label: '1,05 a 1,2 milhão', seats: 33 },
  { upTo: 1_350_000, label: '1,2 a 1,35 milhão', seats: 35 },
  { upTo: 1_500_000, label: '1,35 a 1,5 milhão', seats: 37 },
  { upTo: 1_800_000, label: '1,5 a 1,8 milhão', seats: 39 },
  { upTo: 2_400_000, label: '1,8 a 2,4 milhões', seats: 41 },
  { upTo: 3_000_000, label: '2,4 a 3 milhões', seats: 43 },
  { upTo: 4_000_000, label: '3 a 4 milhões', seats: 45 },
  { upTo: 5_000_000, label: '4 a 5 milhões', seats: 47 },
  { upTo: 6_000_000, label: '5 a 6 milhões', seats: 49 },
  { upTo: 7_000_000, label: '6 a 7 milhões', seats: 51 },
  { upTo: 8_000_000, label: '7 a 8 milhões', seats: 53 },
  { upTo: null, label: 'mais de 8 milhões', seats: 55 },
];
export const MUNICIPAL_MIN_SEATS = 9;
export const MUNICIPAL_MAX_SEATS = 55;

/** Nº de cadeiras padrão da esfera (municipal: o mínimo constitucional até ser informado). */
export function defaultSeats(sphere: Sphere, uf: string): number {
  if (sphere === 'federal') return FEDERAL_SEATS;
  if (sphere === 'estadual') return stateAssemblySeats(uf) ?? 24;
  return MUNICIPAL_MIN_SEATS;
}

/** Limites aceitos para o nº de cadeiras de cada esfera. */
export function seatLimits(sphere: Sphere, uf: string): { min: number; max: number } {
  if (sphere === 'federal') return { min: 1, max: 600 };
  if (sphere === 'estadual') return { min: 1, max: 120 };
  return { min: 5, max: MUNICIPAL_MAX_SEATS };
}

export function defaultHouse(sphere: Sphere, uf: string, city: string): string {
  if (sphere === 'federal') return 'Câmara dos Deputados';
  if (sphere === 'municipal') return city ? `Câmara Municipal de ${city}` : 'Câmara Municipal';
  if ((uf || '').toUpperCase() === 'DF') return 'Câmara Legislativa do Distrito Federal';
  const u = ufInfo(uf);
  return u ? `Assembleia Legislativa do Estado de ${u.name}` : 'Assembleia Legislativa';
}

export interface ChamberConfig {
  sphere: Sphere;
  uf: string;
  city: string;
  /** Nome completo da casa. */
  house: string;
  /** Sigla curta para títulos (ALMT, Câmara dos Deputados, CM Cuiabá). */
  houseShort: string;
  seats: number;
  /** "Deputado(a) Estadual", "Deputado(a) Federal", "Vereador(a)". */
  memberTitle: string;
  memberPlural: string;
  /** Rótulo da base eleitoral do membro (federal: UF de origem). */
  electoralBaseLabel: string;
  /** Quóruns sobre o total de cadeiras. */
  quorum: { absoluta: number; doisTercos: number; tresQuintos: number };
  /** Câmara dos Deputados agrupa membros por bancada estadual (UF). */
  groupsByUf: boolean;
}

export function chamberConfig(t: { sphere: Sphere; state: string; city?: string; house?: string; seats?: number }): ChamberConfig {
  const sphere = t.sphere;
  const uf = (t.state || '').toUpperCase();
  const city = t.city ?? '';
  const seats = t.seats && t.seats > 0 ? t.seats : defaultSeats(sphere, uf);
  const house = t.house?.trim() || defaultHouse(sphere, uf, city);
  const houseShort =
    sphere === 'federal'
      ? 'Câmara dos Deputados'
      : sphere === 'municipal'
        ? city
          ? `Câmara Municipal de ${city}`
          : 'Câmara Municipal'
        : (ufInfo(uf)?.assembly ?? house);
  const distrital = sphere === 'estadual' && uf === 'DF';
  return {
    sphere,
    uf,
    city,
    house,
    houseShort,
    seats,
    memberTitle: sphere === 'federal' ? 'Deputado(a) Federal' : sphere === 'municipal' ? 'Vereador(a)' : distrital ? 'Deputado(a) Distrital' : 'Deputado(a) Estadual',
    memberPlural: sphere === 'federal' ? 'deputados federais' : sphere === 'municipal' ? 'vereadores' : distrital ? 'deputados distritais' : 'deputados estaduais',
    electoralBaseLabel: sphere === 'federal' ? 'Base eleitoral (cidades/regiões)' : sphere === 'municipal' ? 'Bairros / regiões de atuação' : 'Base eleitoral (municípios)',
    quorum: {
      absoluta: Math.floor(seats / 2) + 1,
      doisTercos: Math.ceil((2 * seats) / 3),
      tresQuintos: Math.ceil((3 * seats) / 5),
    },
    groupsByUf: sphere === 'federal',
  };
}
