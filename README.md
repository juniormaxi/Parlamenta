# Parlamenta — Gestão inteligente. Gabinete conectado.

Plataforma SaaS multi-gabinete para deputados estaduais e federais com foco em gestão de atendimento omnichannel, protocolos de demandas sociais, workflow parlamentar (Parlamenta Flow), inteligência territorial (Mato Grosso) e governança legislativa com conformidade LGPD.

---

## 🏛️ 1. Visão Geral do Produto

O **Parlamenta** é uma solução completa para mandatos parlamentares modernos, concebida para aproximar cidadãos e parlamentares com rapidez, transparência e rigor administrativo:
- **Identidade Institucional Contemporânea**: Paleta neutra e sóbria (#102C45, #176B80, #36B7A5, #E9F1F4), sem partidarismos, com design system acessível (WCAG AA) e tipografia geométrica moderna (`Plus Jakarta Sans` e `JetBrains Mono` tabular).
- **Multi-Gabinete / Multi-Tenant**: Isolamento lógico de gabinetes (piloto Estadual ALMT e Gabinete Federal na Câmara dos Deputados).
- **Importação de Identidade Visual**: Área dedicada para upload e visualização do brasão do Estado ou logotipo do mandato diretamente nos documentos oficiais timbrados.
- **Transparência de Protótipo**: Dados demonstrativos claramente sinalizados em toda a interface, sem simulações falsas de APIs externas ao vivo.

---

## 🗺️ 2. Módulos Implementados

1. **Visão Geral (Dashboard Executivo)**:
   - KPIs de protocolos abertos, em alerta 48h, atrasados e resolvidos no mês.
   - Gráfico de barras semanal do fluxo de entrada e resolução.
   - Distribuição de demandas por canal de entrada e por tema.
   - Tarefas prioritárias do dia e próximos compromissos da agenda oficial.
2. **Central de Atendimento (Omnichannel)**:
   - Inbox unificada para WhatsApp, Instagram Direct, Messenger, E-mail e registros manuais (Presencial no Gabinete e Telefone).
   - Chat interativo com histórico de mensagens.
   - **Gerar Protocolo Sugerido** com confirmação humana obrigatória.
   - Aviso de ambiente sandbox demonstrativo.
3. **Protocolos & Demandas**:
   - Visualização alternável em **Tabela Pesquisável** e **Kanban**.
   - Filtros por canal, tema, município (MT), prioridade, status, responsável e SLA.
   - Detalhe em gaveta com histórico de movimentações (timeline imutável), documentos anexos e campo de **Devolutiva ao Cidadão** com rastreabilidade.
4. **Parlamenta Flow (Workflow & Gestão de Filas)**:
   - **Fila de Triagem (Coordenador)**: despacho com prazo e prioridade.
   - **Minha Fila (Assessor)**: cronômetros duplos de tempo total e tempo com o responsável atual.
   - Alertas SLA (Normal, Alerta 48h, Atrasado).
   - Encerramento condicionado à autorização expressa da chefia com registro de envio de devolutiva ou formalização de falha de contato.
   - Reabertura de demandas com justificativa auditável.
5. **Agenda & Tarefas**:
   - Calendário nos modos Mês, Semana, Dia e Lista (sessões plenárias, comissões, audiências e visitas municipais).
   - Tarefas da equipe com vínculo direto ao número do protocolo.
6. **Gestão da Equipe**:
   - Carga de trabalho por assessor com barras de capacidade.
   - Processos vencendo e atrasados por colaborador.
   - **Redistribuição em Lote** com justificativa gravada em log.
7. **Inteligência Territorial (REQUISITO MVP)**:
   - Duas abas independentes: **Demandas** e **Eleições**.
   - Mapa vetorial interativo de Mato Grosso com polos e municípios clicáveis (Cuiabá, Várzea Grande, Rondonópolis, Sinop, Sorriso, Juína, etc.).
   - **Aba Eleições**: dados de votação nominal e percentual (2022 e 2018), ranking de votação e simulação de importação do TSE.
   - **Princípio LGPD**: garantia de que dados de cidadãos demandantes **jamais são cruzados com votos** nem usados para inferência política.
8. **Documentos & Proposições**:
   - Modelos de Ofício, Requerimento, Projeto de Lei, Emenda e Indicação.
   - Prévia timbrada com cabeçalho oficial do gabinete, assinatura digital ICP-Brasil simulada e controle de versões.
9. **Seção Comunicação**:
   - **Newsletter (Menu 1)**:
     - Recepção e catálogo de inscrições provenientes do site oficial do mandato.
     - Listagem de cadastros com dados de contato, município, data de opt-in e **tags por temas de interesse** (Saúde, Infraestrutura, Educação, Agro Familiar, etc.).
     - Disparo de campanhas para **toda a base** ou segmentado por **categorias/tags e municípios específicos**.
     - Métricas de desempenho por edição (taxa de abertura, cliques e descadastramentos).
     - Simulador interativo do widget de inscrição do site e especificações de conformidade com os artigos 7º e 18 da LGPD.
   - **Conhecimento & Imprensa (Menu 2)**:
     - Clipping de fontes oficiais e diários de Mato Grosso.
     - Editor de releases com **Assistente de IA** para adequação ao tom institucional e regimental.
     - Fluxo de aprovação: Rascunho -> Revisão Chefia -> Aprovado -> Distribuído.
   - **Site & Publicações (Menu 3 - CMS)**:
     - Gestão de notícias e prestação de contas de emendas parlamentares.
     - Configuração de Webhooks para sincronização externa com portal do mandato.
11. **Gestão Legislativa**:
    - Acompanhamento da tramitação regimental de Projetos de Lei e Comissões na ALMT.
12. **Canais & Integrações**:
    - Status técnico de cada conector (WhatsApp Business, Instagram, E-mail, TSE, SIGA/ALMT).
13. **Relatórios & Métricas**:
    - Exportação executiva em PDF/CSV para prestação de contas.
14. **Administração & LGPD**:
    - Usuários e matriz RBAC (Deputado, Chefe de Gabinete, Coordenador, Assessor, Comunicação).
    - Regras de SLA configuráveis por tema.
    - Políticas de MFA e expiração de sessão.
    - Trilha imutável de **Logs de Auditoria**.

---

## 🔄 3. Fluxo Demonstrativo Obrigatório (Passo a Passo)

A plataforma conta com um simulador interativo ponta a ponta (botão **"Fluxo Demonstrativo"** na barra superior):
1. **Entrada da Demanda**: Cidadã Maria Eunice de Rondonópolis envia mensagem via WhatsApp relatando superlotação e falta de leitos de UTI Pediátrica no Hospital Regional.
2. **Triagem Inicial & Criação de Protocolo**: Coordenadora Letícia Prado recebe na Central de Atendimento, valida a sugestão de tema/prioridade e cria o protocolo oficial `PRT-2026-0042`.
3. **Parlamenta Flow & Atribuição**: Coordenadora despacha a demanda para o Assessor Temático Lucas Mendes com prazo regulamentar de 48h.
4. **Notificação e Minha Fila**: Lucas Mendes assume a demanda e o cronômetro passa a registrar o tempo em posse do responsável.
5. **Criação de Tarefa & Agenda**: Assessor agenda audiência técnica com o Secretário de Estado de Saúde (SES-MT) na pauta oficial da Deputada.
6. **Registro de Execução**: Assessor elabora o Ofício nº 142/2026, anexa ao protocolo e registra a confirmação de abertura de 4 novos leitos pela secretaria.
7. **Revisão, Encerramento e Devolutiva Auditável**: A chefia confere o resultado, autoriza o encerramento do protocolo e o sistema envia a devolutiva formal ao WhatsApp da cidadã com log de auditoria LGPD.

---

## 📊 4. Matriz de Componentes: Mock vs. Produção (Backend / APIs)

| Módulo | Implementado no Protótipo (Mock Demonstrativo) | Requisitos para Ambiente de Produção (Backend / APIs) |
| :--- | :--- | :--- |
| **Central de Atendimento** | Caixa de entrada unificada com estado local reativo, mensagens de teste e formulário de resposta rápida. | Meta Cloud API (WhatsApp Business API), Instagram Graph API, servidor SMTP/IMAP para e-mails do gabinete. |
| **Parlamenta Flow** | Cronometragem no cliente, cálculo de SLA e transição de estados com guarda de governança. | Motor de Workflow / State Machine (ex: Temporal, BullMQ ou Temporal.io) com filas Redis e Webhooks de eventos. |
| **Inteligência Territorial** | Dados agregados de votação em MT (2018 e 2022) e mapa vetorial interativo de demandas. | API de Dados Abertos do TSE (DivulgaCandContas / Repositório de Votação Nominal por Seção). |
| **Documentos Timbrados** | Prévia formatada com cabeçalho do gabinete, upload local de imagem e simulação de exportação. | Serviço headless de compilação PDF/ODF, assinatura com certificado digital A1/A3 ICP-Brasil e API do SIGA/ALMT. |
| **Autenticação & Multi-Tenant** | Comutador de perfis RBAC no cabeçalho e seletor de gabinetes em memória. | OAuth 2.0 / OIDC, MFA (TOTP / WebAuthn) e banco relacional PostgreSQL com Row Level Security (RLS) isolando cada `cabinet_id`. |
| **IA Assistiva de Redação** | Aprimoramento assistido de tom formal, citações e conformidade regimental. | Endpoint server-side proxy para Google Gemini 2.5 Flash / Pro (`@google/genai`). |

---

## 🚀 5. Instruções de Execução

### Pré-requisitos
- Node.js 18+ ou 20+
- npm ou bun

### Instalação e Execução
```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento (Porta 3000)
npm run dev

# Validação estática de tipagem TypeScript
npm run lint

# Compilar para produção
npm run build
```
O servidor estará acessível em `http://localhost:3000`.
