import React, { useState } from 'react';
import {
  MapPin,
  Vote,
  FileSpreadsheet,
  Download,
  UploadCloud,
  ShieldAlert,
  Info,
  CheckCircle2,
  TrendingUp,
  Search,
  Filter,
  BarChart2,
  Building,
  Users,
} from 'lucide-react';
import { MunicipalityData } from '../../types';
import { DemoNoticeBanner } from '../common/DemoNoticeBanner';
import { KpiCard } from '../common/KpiCard';
import { OpenStreetDemandHeatMap } from './territorial/OpenStreetDemandHeatMap';

interface InteligenciaTerritorialModuleProps {
  municipalities: MunicipalityData[];
}

export const InteligenciaTerritorialModule: React.FC<InteligenciaTerritorialModuleProps> = ({
  municipalities,
}) => {
  const [activeTab, setActiveTab] = useState<'eleicoes' | 'demandas'>('demandas');
  const [selectedMunicipality, setSelectedMunicipality] = useState<MunicipalityData>(
    municipalities[2] || municipalities[0] // Rondonópolis default or Cuiabá
  );
  const [mapEngine, setMapEngine] = useState<'osm' | 'svg'>('osm');
  const [electionYear, setElectionYear] = useState<'2022' | '2018'>('2022');
  const [searchFilter, setSearchFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('todos');
  const [themeFilter, setThemeFilter] = useState<string>('todos');
  const [syncingTse, setSyncingTse] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  // Filtered list
  const filteredMunicipalities = municipalities.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesRegion = regionFilter === 'todos' || m.region === regionFilter;
    return matchesSearch && matchesRegion;
  });

  // Calculate aggregated stats
  const totalVotes2022 = municipalities.reduce(
    (acc, m) => acc + m.election2022.votesCandidate,
    0
  );
  const totalDemands = municipalities.reduce((acc, m) => acc + m.demandsCount, 0);
  const totalDemandsResolved = municipalities.reduce(
    (acc, m) => acc + m.demandsResolved,
    0
  );
  const avgResolutionRate = Math.round(
    (totalDemandsResolved / totalDemands) * 100
  );

  const handleSyncTSE = () => {
    setSyncingTse(true);
    setSyncSuccess(false);
    setTimeout(() => {
      setSyncingTse(false);
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 4000);
    }, 1200);
  };

  // Coordinates helper for the Mato Grosso stylized map
  const municipalityPositions: Record<string, { x: number; y: number }> = {
    cuiaba: { x: 380, y: 390 },
    varzea_grande: { x: 360, y: 380 },
    rondonopolis: { x: 440, y: 440 },
    sinop: { x: 370, y: 200 },
    sorriso: { x: 375, y: 240 },
    tangara_da_serra: { x: 290, y: 360 },
    primavera_do_leste: { x: 430, y: 390 },
    barra_do_garcas: { x: 520, y: 380 },
    caceres: { x: 260, y: 420 },
    lucas_do_rio_verde: { x: 360, y: 270 },
    juina: { x: 210, y: 190 },
  };

  return (
    <div className="space-y-4">
      <DemoNoticeBanner
        moduleName="Inteligência Territorial (Mato Grosso)"
        contextText="Dados de votação e demandas mapeados por município. Simulação estritamente agregada: proibido cruzamento com dados pessoais de cidadãos (LGPD)."
      />

      {/* Top Header & Independent Tabs (Requisito MVP) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#176B80]" />
            Inteligência Territorial · Mato Grosso
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Mapeamento geoespacial de demandas sociais e desempenho eleitoral oficial agregado
          </p>
        </div>

        {/* The Two Independent Tabs: Eleições vs. Demandas */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setActiveTab('demandas')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 ${
              activeTab === 'demandas'
                ? 'bg-white text-[#102C45] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-[#176B80]" />
            <span>Mapa de Demandas</span>
          </button>

          <button
            onClick={() => setActiveTab('eleicoes')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 ${
              activeTab === 'eleicoes'
                ? 'bg-white text-[#102C45] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Vote className="w-4 h-4 text-[#176B80]" />
            <span>Histórico Eleitoral (TSE)</span>
          </button>
        </div>
      </div>

      {/* Explicit Legal & Anti-Crossing Notice */}
      <div className="bg-[#E9F1F4]/70 border border-[#176B80]/30 rounded-xl p-3.5 flex items-start gap-3 text-xs text-[#102C45]">
        <ShieldAlert className="w-4 h-4 text-[#176B80] shrink-0 mt-0.5" />
        <div className="space-y-0.5 leading-relaxed">
          <span className="font-bold uppercase tracking-wider text-[10px] text-[#176B80]">
            Princípio de Impessoalidade & Não-Cruzamento de Dados (LGPD Art. 11)
          </span>
          <p className="text-slate-700">
            A atividade eleitoral e a comunicação institucional do mandato são <strong>rigorosamente segregadas</strong>. Os dados da aba de Eleições originam-se de dados abertos agregados do TSE. Em hipótese alguma os contatos, solicitações ou protocolos individuais de cidadãos são correlacionados com registros eleitorais ou preferências político-partidárias.
          </p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* ABA 1: DEMANDAS DA POPULAÇÃO */}
      {/* ======================================================== */}
      {activeTab === 'demandas' && (
        <div className="space-y-4">
          {/* Top KPIs for Demandas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Demandas Mapeadas"
              value={totalDemands}
              subtext="Distribuídas nos 141 municípios"
              icon={MapPin}
            />
            <KpiCard
              label="Taxa de Resolução Estadual"
              value={`${avgResolutionRate}%`}
              subtext="Média de devolutivas entregues"
              variant="success"
              trend={{ value: '+4%', isPositive: true, label: 'vs. trimestre ant.' }}
            />
            <KpiCard
              label="Polo com Maior Demanda"
              value="Rondonópolis (61)"
              subtext="Pauta: Saúde & Leitos UTI"
              variant="warning"
            />
            <KpiCard
              label="Tempo Médio de Atendimento"
              value="3,2 dias"
              subtext="Meta cumprida em 88% das cidades"
            />
          </div>

          {/* Map + Regional Inspector Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 spans: OpenStreetMap Interactive Heat Map */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#176B80]" />
                    Mapa de Calor das Demandas em Mato Grosso
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                      OpenStreetMap Integrado
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Visualização geoespacial com OpenStreetMap, anéis de calor térmico e pinos dinâmicos por município
                  </p>
                </div>

                {/* Region selector & Map Engine switcher */}
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Região:</span>
                    <select
                      value={regionFilter}
                      onChange={(e) => setRegionFilter(e.target.value)}
                      className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="todos">Todo o Estado</option>
                      <option value="Baixada Cuiabana">Baixada Cuiabana</option>
                      <option value="Norte">Norte</option>
                      <option value="Médio-Norte">Médio-Norte</option>
                      <option value="Sul">Sul</option>
                      <option value="Araguaia">Araguaia</option>
                      <option value="Oeste">Oeste</option>
                    </select>
                  </div>

                  <div className="bg-slate-100 p-0.5 rounded-lg flex items-center border border-slate-200">
                    <button
                      onClick={() => setMapEngine('osm')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                        mapEngine === 'osm'
                          ? 'bg-white text-[#102C45] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      OpenStreetMap
                    </button>
                    <button
                      onClick={() => setMapEngine('svg')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                        mapEngine === 'svg'
                          ? 'bg-white text-[#102C45] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Mapa Vetorial
                    </button>
                  </div>
                </div>
              </div>

              {/* Map Rendering: OSM Map or SVG fallback */}
              {mapEngine === 'osm' ? (
                <OpenStreetDemandHeatMap
                  municipalities={filteredMunicipalities}
                  selectedMunicipality={selectedMunicipality}
                  onSelectMunicipality={setSelectedMunicipality}
                  regionFilter={regionFilter}
                />
              ) : (
                <div className="relative w-full h-[480px] bg-[#F8FAFC] border border-slate-100 rounded-xl overflow-hidden flex items-center justify-center p-2">
                  <svg
                    viewBox="100 80 500 450"
                    className="w-full h-full max-h-[460px]"
                  >
                    {/* Mato Grosso State Stylized Outline */}
                    <path
                      d="M 180 120 L 290 90 L 450 110 L 530 180 L 590 280 L 570 380 L 520 460 L 430 490 L 320 490 L 230 440 L 170 350 L 150 250 Z"
                      fill="#E9F1F4"
                      stroke="#176B80"
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                      className="opacity-70"
                    />

                    {/* Sub-regions light guides */}
                    <text x="170" y="150" fill="#94a3b8" fontSize="12" fontFamily="monospace">Norte</text>
                    <text x="340" y="160" fill="#94a3b8" fontSize="12" fontFamily="monospace">Médio-Norte</text>
                    <text x="470" y="320" fill="#94a3b8" fontSize="12" fontFamily="monospace">Vale do Araguaia</text>
                    <text x="350" y="440" fill="#94a3b8" fontSize="12" fontFamily="monospace">Baixada Cuiabana</text>
                    <text x="460" y="460" fill="#94a3b8" fontSize="12" fontFamily="monospace">Região Sul</text>
                    <text x="180" y="380" fill="#94a3b8" fontSize="12" fontFamily="monospace">Oeste Pantaneiro</text>

                    {/* Interactive Municipality Pins */}
                    {filteredMunicipalities.map((m) => {
                      const pos = municipalityPositions[m.id] || { x: 300, y: 300 };
                      const isSelected = selectedMunicipality.id === m.id;
                      const radius = Math.min(18, Math.max(9, m.demandsCount / 4));

                      return (
                        <g
                          key={m.id}
                          onClick={() => setSelectedMunicipality(m)}
                          className="cursor-pointer group"
                        >
                          {isSelected && (
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={radius + 8}
                              fill="#36B7A5"
                              opacity="0.3"
                              className="animate-pulse"
                            />
                          )}

                          <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={radius}
                            fill={isSelected ? '#102C45' : '#176B80'}
                            stroke="#ffffff"
                            strokeWidth="2"
                            className="transition-all group-hover:scale-110"
                          />

                          <text
                            x={pos.x}
                            y={pos.y + 3.5}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="9"
                            fontWeight="bold"
                            fontFamily="monospace"
                          >
                            {m.demandsCount}
                          </text>

                          <text
                            x={pos.x}
                            y={pos.y + radius + 11}
                            textAnchor="middle"
                            fill={isSelected ? '#102C45' : '#475569'}
                            fontSize="10"
                            fontWeight={isSelected ? 'bold' : '500'}
                            className="transition-colors group-hover:fill-[#102C45]"
                          >
                            {m.name}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-lg p-2.5 text-[10px] space-y-1 shadow-xs">
                    <span className="font-semibold text-slate-800 block">Legenda de Demandas</span>
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="w-3 h-3 rounded-full bg-[#176B80]" />
                      <span>Tamanho = Volume de demandas</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right 1 span: Detailed Municipal Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#176B80] font-mono">
                  Detalhamento Municipal · {selectedMunicipality.region}
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                  {selectedMunicipality.name}
                </h3>
                <p className="text-xs text-slate-500">
                  População: <strong className="font-mono text-slate-700">{selectedMunicipality.population.toLocaleString('pt-BR')}</strong> hab.
                </p>
              </div>

              {/* Demand Status in City */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Demandas Totais
                  </span>
                  <span className="text-xl font-bold font-mono text-[#102C45]">
                    {selectedMunicipality.demandsCount}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <span className="text-[10px] text-emerald-700 uppercase font-semibold block">
                    Resolvidas
                  </span>
                  <span className="text-xl font-bold font-mono text-emerald-700">
                    {selectedMunicipality.demandsResolved}
                  </span>
                </div>
              </div>

              {/* Top Demands Topics in this City */}
              <div>
                <h4 className="font-semibold text-xs text-slate-900 mb-2">
                  Temas Mais Reivindicados
                </h4>
                <div className="space-y-2 text-xs">
                  {selectedMunicipality.demandsTopThemes.map((t) => (
                    <div key={t.theme} className="space-y-1">
                      <div className="flex justify-between text-slate-700">
                        <span className="font-medium truncate pr-2">{t.theme}</span>
                        <span className="font-mono font-semibold text-slate-500 tabular-nums">
                          {t.count}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#176B80] h-full rounded-full"
                          style={{
                            width: `${(t.count / selectedMunicipality.demandsCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lead Assessor */}
              <div className="p-3 rounded-lg bg-[#E9F1F4] text-xs text-slate-700 space-y-1">
                <span className="font-semibold text-[#102C45] block">
                  Articulador de Gabinete Designado:
                </span>
                <p className="font-medium">{selectedMunicipality.leadAssessor}</p>
                <p className="text-[11px] text-slate-500">
                  Responsável pelo acompanhamento com prefeitura, câmara de vereadores e lideranças comunitárias.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ABA 2: HISTÓRICO ELEITORAL (TSE) */}
      {/* ======================================================== */}
      {activeTab === 'eleicoes' && (
        <div className="space-y-4">
          {/* Controls: Year & Sync TSE */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">
                Eleição Oficial (TSE):
              </span>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  onClick={() => setElectionYear('2022')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    electionYear === '2022'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Geral 2022
                </button>
                <button
                  onClick={() => setElectionYear('2018')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    electionYear === '2018'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Geral 2018
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncTSE}
                disabled={syncingTse}
                className="px-3.5 py-1.5 text-xs font-semibold text-[#102C45] bg-[#E9F1F4] hover:bg-[#d6e5eb] rounded-lg transition-colors flex items-center gap-1.5 border border-[#176B80]/20"
              >
                <UploadCloud className="w-3.5 h-3.5 text-[#176B80]" />
                <span>
                  {syncingTse
                    ? 'Sincronizando Dados Abertos TSE...'
                    : 'Importar / Atualizar Base TSE'}
                </span>
              </button>
            </div>
          </div>

          {syncSuccess && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                Base eleitoral oficial do TSE sincronizada com sucesso. 141 zonas eleitorais de Mato Grosso auditadas.
              </span>
            </div>
          )}

          {/* Electoral KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label={`Votação Total (${electionYear})`}
              value={
                electionYear === '2022'
                  ? totalVotes2022.toLocaleString('pt-BR')
                  : '46.860'
              }
              subtext="Votos nominais em MT"
              icon={Vote}
              trend={{
                value: electionYear === '2022' ? '+68.4%' : '',
                isPositive: true,
                label: 'Crescimento 2018-2022',
              }}
            />
            <KpiCard
              label="Maior Base Eleitoral"
              value="Cuiabá (19.450)"
              subtext="5,68% dos votos válidos na Capital"
            />
            <KpiCard
              label="Maior Penetração Percentual"
              value="Juína (13,92%)"
              subtext="1º lugar no município em 2022"
              variant="success"
            />
            <KpiCard
              label="Colégios Eleitorais com >10%"
              value="5 municípios"
              subtext="Rondonópolis, Sorriso, Primavera, Barra, Juína"
            />
          </div>

          {/* Electoral Ranking Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Desempenho Eleitoral por Município ({electionYear})
                </h3>
                <p className="text-xs text-slate-500">
                  Dados demonstrativos agregados com base no repositório de votação nominal do TSE
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[11px] font-semibold">
                    <th className="py-3 px-4">Município</th>
                    <th className="py-3 px-4">Região</th>
                    <th className="py-3 px-4 text-right">Votos Nominais</th>
                    <th className="py-3 px-4 text-right">% Votos Válidos</th>
                    <th className="py-3 px-4 text-center">Posição Local</th>
                    <th className="py-3 px-4 text-right">Eleitorado Apto</th>
                    <th className="py-3 px-4 text-center">Evolução 2018-2022</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {municipalities.map((m) => {
                    const data = electionYear === '2022' ? m.election2022 : m.election2018;
                    const growth = Math.round(
                      ((m.election2022.votesCandidate - m.election2018.votesCandidate) /
                        m.election2018.votesCandidate) *
                        100
                    );

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{m.name}</td>
                        <td className="py-3 px-4 text-slate-600">{m.region}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-[#102C45] tabular-nums">
                          {data.votesCandidate.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700 tabular-nums">
                          {data.percentage}%
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              data.ranking === 1
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {data.ranking}º lugar
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500 tabular-nums">
                          {m.election2022.electorate.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold text-emerald-600 tabular-nums">
                          +{growth}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
