/**
 * AI processing for the "Discursos" archive (Google Gemini).
 *  - audio / video  -> full transcription ("decupagem") with timestamps
 *  - pdf            -> OCR / native text extraction
 *  - any text       -> summary + theme tags + keywords + occasion/date hints
 * Without GEMINI_API_KEY, text files are still tagged with a keyword heuristic.
 */
import { GoogleGenAI, Type, FileState, createPartFromUri, createUserContent } from '@google/genai';

export const THEMES = [
  'Saúde',
  'Educação',
  'Infraestrutura',
  'Segurança Pública',
  'Agricultura & Agro',
  'Meio Ambiente',
  'Economia & Emprego',
  'Assistência Social',
  'Cultura & Esporte',
  'Transporte & Mobilidade',
  'Habitação',
  'Direitos Humanos & Cidadania',
  'Administração Pública',
  'Orçamento & Emendas',
  'Outros',
] as const;

export const OCCASIONS = [
  'Sessão Plenária',
  'Comissão',
  'Audiência Pública',
  'Entrevista',
  'Evento / Solenidade',
  'Visita Municipal',
  'Rede Social / Live',
  'Pronunciamento Oficial',
  'Reunião',
  'Outro',
];

export const KEYWORDS: Record<(typeof THEMES)[number], string[]> = {
  Saúde: ['saúde', 'hospital', 'leito', 'médic', 'sus', 'upa', 'vacina', 'cirurgia', 'enferm', 'posto de saúde', 'regulação'],
  Educação: ['educação', 'escola', 'professor', 'aluno', 'ensino', 'creche', 'universidade', 'merenda', 'estudante'],
  Infraestrutura: ['infraestrutura', 'obra', 'asfalto', 'pavimenta', 'ponte', 'saneamento', 'energia', 'água', 'esgoto', 'drenagem'],
  'Segurança Pública': ['segurança', 'polícia', 'policial', 'crime', 'violência', 'presídio', 'bombeiro', 'tráfico'],
  'Agricultura & Agro': ['agro', 'agricult', 'produtor', 'safra', 'pecuária', 'rural', 'soja', 'milho', 'gado', 'assentamento'],
  'Meio Ambiente': ['ambiental', 'meio ambiente', 'desmatamento', 'queimada', 'pantanal', 'floresta', 'rio ', 'sustentab'],
  'Economia & Emprego': ['economia', 'emprego', 'renda', 'imposto', 'icms', 'empresa', 'trabalho', 'investimento', 'indústria'],
  'Assistência Social': ['assistência social', 'vulnerab', 'cras', 'fome', 'cesta básica', 'idoso', 'pessoa com deficiência', 'auxílio'],
  'Cultura & Esporte': ['cultura', 'esporte', 'festival', 'artista', 'quadra', 'turismo', 'patrimônio'],
  'Transporte & Mobilidade': ['transporte', 'ônibus', 'rodovia', 'estrada', 'br-', 'mt-', 'trânsito', 'ferrovia', 'mobilidade'],
  Habitação: ['habitação', 'moradia', 'casa própria', 'regularização fundiária', 'conjunto habitacional', 'aluguel'],
  'Direitos Humanos & Cidadania': ['direitos humanos', 'mulher', 'racismo', 'indígena', 'quilombola', 'cidadania', 'igualdade', 'lgbt'],
  'Administração Pública': ['servidor', 'concurso', 'gestão pública', 'transparência', 'prefeitura', 'governo do estado', 'secretaria'],
  'Orçamento & Emendas': ['orçamento', 'emenda', 'loa', 'ldo', 'recurso', 'convênio', 'repasse'],
  Outros: [],
};

/** Keyword-count heuristic used when no AI key is configured. */
export function keywordThemes(text: string, minHits = 2): string[] {
  const t = text.toLowerCase();
  const scored = (Object.keys(KEYWORDS) as (keyof typeof KEYWORDS)[])
    .map((theme) => ({
      theme,
      hits: KEYWORDS[theme].reduce((n, k) => n + (t.split(k).length - 1), 0),
    }))
    .filter((s) => s.hits >= minHits)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 4)
    .map((s) => s.theme);
  return scored.length ? scored : ['Outros'];
}

const apiKey = () => {
  const k = process.env.GEMINI_API_KEY?.trim();
  return k && k !== 'MY_GEMINI_API_KEY' ? k : '';
};
export const aiAvailable = () => !!apiKey();
const model = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const client = () => new GoogleGenAI({ apiKey: apiKey() });

const TRANSCRIBE_PROMPT = `Você é um decupador profissional de um gabinete parlamentar brasileiro.
Faça a DECUPAGEM deste arquivo: transcreva integralmente e de forma fiel tudo o que é falado, em português do Brasil.
Regras:
- Não resuma, não omita trechos, não corrija o conteúdo do que foi dito (apenas pontuação).
- Comece cada parágrafo com a marcação de tempo no formato [hh:mm:ss].
- Quando houver mais de uma pessoa falando, identifique como [Parlamentar], [Entrevistador], [Orador 2] etc.
- Trechos inaudíveis: [inaudível]. Sons relevantes: [aplausos], [risos].
Responda apenas com a transcrição, sem comentários.`;

const OCR_PROMPT = `Extraia o TEXTO INTEGRAL deste documento PDF, em português, preservando parágrafos e títulos.
Se as páginas forem imagens digitalizadas, faça OCR. Não resuma, não comente, não traduza.
Responda apenas com o texto extraído.`;

async function uploadAndWait(ai: GoogleGenAI, path: string, mimeType: string, displayName: string) {
  let file = await ai.files.upload({ file: path, config: { mimeType, displayName } });
  const deadline = Date.now() + 15 * 60_000;
  while (file.state === FileState.PROCESSING) {
    if (Date.now() > deadline) throw new Error('Tempo esgotado aguardando o processamento do arquivo pela IA.');
    await new Promise((r) => setTimeout(r, 4000));
    file = await ai.files.get({ name: file.name! });
  }
  if (file.state === FileState.FAILED) throw new Error('A IA não conseguiu processar o arquivo enviado.');
  return file;
}

/** Transcribe audio/video or OCR a PDF. Returns plain text. */
export async function extractTextWithAI(path: string, mimeType: string, kind: 'audio' | 'video' | 'pdf'): Promise<string> {
  const ai = client();
  const file = await uploadAndWait(ai, path, mimeType, `parlamentta-${kind}`);
  try {
    const res = await ai.models.generateContent({
      model: model(),
      contents: createUserContent([createPartFromUri(file.uri!, file.mimeType!), kind === 'pdf' ? OCR_PROMPT : TRANSCRIBE_PROMPT]),
      config: { temperature: 0, maxOutputTokens: 65536 },
    });
    const text = (res.text ?? '').trim();
    if (!text) throw new Error('A IA retornou uma transcrição vazia.');
    return text;
  } finally {
    // Never leave the parliamentarian's material on the provider longer than needed.
    await ai.files.delete({ name: file.name! }).catch(() => undefined);
  }
}

export interface Classification {
  summary: string;
  themes: string[];
  keywords: string[];
  occasionSuggestion: string;
  dateSuggestion: string;
}

/** Summary + theme tags + keywords for a text. */
export async function classifyWithAI(text: string, ctx: { title: string; occasion: string; date: string }): Promise<Classification> {
  const ai = client();
  const sample = text.length > 120_000 ? text.slice(0, 120_000) + '\n[...texto truncado...]' : text;
  const res = await ai.models.generateContent({
    model: model(),
    contents: `Você organiza o acervo de discursos de um parlamentar brasileiro.
Título informado: "${ctx.title}". Ocasião informada: "${ctx.occasion}". Data informada: ${ctx.date}.
Analise o texto abaixo e devolva:
- summary: resumo objetivo em até 5 frases, em português.
- themes: 1 a 4 temas, escolhidos SOMENTE desta lista: ${THEMES.join('; ')}.
- keywords: 3 a 10 etiquetas curtas (municípios citados, obras, programas, pessoas públicas, siglas).
- occasionSuggestion: a ocasião que o próprio texto indica (ex.: "Sessão Plenária"), ou "" se não houver indício.
- dateSuggestion: a data que o texto indica, no formato AAAA-MM-DD, ou "" se não houver.

TEXTO:
"""
${sample}
"""`,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          themes: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...THEMES] } },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          occasionSuggestion: { type: Type.STRING },
          dateSuggestion: { type: Type.STRING },
        },
        required: ['summary', 'themes', 'keywords', 'occasionSuggestion', 'dateSuggestion'],
      },
    },
  });
  const parsed = JSON.parse(res.text ?? '{}');
  return {
    summary: String(parsed.summary ?? ''),
    themes: (Array.isArray(parsed.themes) ? parsed.themes : []).filter((t: string) => (THEMES as readonly string[]).includes(t)).slice(0, 4),
    keywords: (Array.isArray(parsed.keywords) ? parsed.keywords : []).map((k: unknown) => String(k).slice(0, 60)).slice(0, 12),
    occasionSuggestion: String(parsed.occasionSuggestion ?? ''),
    dateSuggestion: /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateSuggestion ?? '') ? parsed.dateSuggestion : '',
  };
}

// ---------------------------------------------------------------------------
// Clipping: batch sentiment + themes for news headlines
// ---------------------------------------------------------------------------
export type Sentiment = 'bom' | 'neutro' | 'ruim';
export interface ClipClassification {
  index: number;
  sentiment: Sentiment;
  reason: string;
  themes: string[];
}

export async function classifyClippingWithAI(
  items: { title: string; summary: string; topics: string[] }[],
  ctx: { cabinet: string; parliamentarian: string }
): Promise<ClipClassification[]> {
  const ai = client();
  const list = items
    .map((it, i) => `#${i} [temas: ${it.topics.join(', ') || '—'}] ${it.title}${it.summary ? ` — ${it.summary.slice(0, 300)}` : ''}`)
    .join('\n');
  const res = await ai.models.generateContent({
    model: model(),
    contents: `Você faz o clipping de imprensa do ${ctx.cabinet}${ctx.parliamentarian ? ` (${ctx.parliamentarian})` : ''}, um mandato parlamentar no Brasil.
Para cada notícia abaixo, classifique o impacto para o mandato e para os temas monitorados:
- "bom": notícia favorável (conquistas, entregas, investimentos, reconhecimento, avanço de pautas defendidas).
- "ruim": notícia desfavorável (críticas, denúncias, crises, problemas não resolvidos, ataques ao mandato).
- "neutro": factual, sem impacto claro.
Informe também 0 a 3 temas, escolhidos SOMENTE desta lista: ${THEMES.join('; ')}.
"reason": justificativa curta (até 15 palavras), em português.

NOTÍCIAS:
${list}`,
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.INTEGER },
            sentiment: { type: Type.STRING, enum: ['bom', 'neutro', 'ruim'] },
            reason: { type: Type.STRING },
            themes: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...THEMES] } },
          },
          required: ['index', 'sentiment', 'reason', 'themes'],
        },
      },
    },
  });
  const parsed = JSON.parse(res.text ?? '[]');
  return (Array.isArray(parsed) ? parsed : [])
    .filter((p: any) => Number.isInteger(p.index) && p.index >= 0 && p.index < items.length && ['bom', 'neutro', 'ruim'].includes(p.sentiment))
    .map((p: any) => ({
      index: p.index,
      sentiment: p.sentiment,
      reason: String(p.reason ?? '').slice(0, 160),
      themes: (Array.isArray(p.themes) ? p.themes : []).filter((t: string) => (THEMES as readonly string[]).includes(t)).slice(0, 3),
    }));
}

const POSITIVE = ['aprova', 'aprovad', 'conquist', 'investiment', 'inaugur', 'entreg', 'benefici', 'melhori', 'avanç', 'recorde', 'homenage', 'parceria', 'garant', 'amplia', 'sucesso', 'comemor', 'reconhec', 'liber', 'destina', 'anuncia', 'reforç', 'premi', 'reduz fila', 'acordo', 'vitória', 'celebr', 'moderniz', 'regulariz'];
const NEGATIVE = ['denúnci', 'investigaç', 'escândal', 'crise', 'morte', 'mort', 'violênci', 'falta de', 'atras', 'crític', 'irregular', 'corrupç', 'polêmic', 'protest', 'precári', 'superlot', 'prejuíz', 'acident', 'fraude', 'cassaç', 'conden', 'desvio', 'suspeit', 'abandon', 'colaps', 'ameaç', 'agress', 'tragédia', 'caos', 'demiss', 'rejeita', 'prisão', 'preso', 'operação policial', 'ilegal'];

/** Lexicon fallback used when no AI key is configured (or the AI call fails). */
export function lexiconSentiment(text: string): { sentiment: Sentiment; reason: string } {
  const t = text.toLowerCase();
  const pos = POSITIVE.filter((w) => t.includes(w));
  const neg = NEGATIVE.filter((w) => t.includes(w));
  if (neg.length > pos.length) return { sentiment: 'ruim', reason: `Termos negativos: ${neg.slice(0, 3).join(', ')}` };
  if (pos.length > neg.length) return { sentiment: 'bom', reason: `Termos positivos: ${pos.slice(0, 3).join(', ')}` };
  return { sentiment: 'neutro', reason: pos.length ? 'Termos positivos e negativos equilibrados' : 'Sem termos de impacto' };
}
