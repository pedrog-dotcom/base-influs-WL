/****************************************************************************************
 * Config.gs: parâmetros da Base Influencers WL (Voy BR)
 * ------------------------------------------------------------------------------------
 * Tudo o que muda de regra de negócio fica aqui. Segredos ficam nas Propriedades do script:
 *   SUPABASE_URL          https://eupkvybriepteduevrpr.supabase.co   (projeto IRIS)
 *   SUPABASE_SERVICE_KEY  service_role key do projeto IRIS (lê tabelas com RLS)
 *   NEKT_MCP_TOKEN        token de MCP da Nekt (o mesmo usado em CRM-WL serve)
 * O custo de medicação lê o lake direto no BigQuery (serviço avançado "BigQuery API",
 * projeto CFG.BQ_PROJECT), com a conta que executa o script, como o Base-Final-HL.
 *   ALERT_EMAIL           (opcional) destinatário dos avisos de erro
 ****************************************************************************************/

var CFG = {
  TZ: 'America/Sao_Paulo',

  // Primeiro dia da base. A comissão precisa do histórico desde o início dos contratos,
  // então as vendas são lidas desde VENDAS_DESDE, mas a base só grava a partir de DATA_INICIO.
  DATA_INICIO: '2026-06-01',
  VENDAS_DESDE: '2026-01-01',

  // Recorte WL
  BRAND: 'Voy',
  COUNTRY: 'brazil',
  CATEGORIA_IRIS: 'weight_loss',

  // Vendas de influenciador (lake via Nekt), mesma regra do SQL do pace:
  //   Orders       = pedidos com o cupom, todos os status, na data do checkout
  //   Acquisitions = pedidos confirmados (qualquer order_context), na data de conclusão do pagamento
  PROMO_INFLUENCER: ['voy_br_coupon_15_influencer'],
  // Creators híbridas: entram inteiras em Influencers com qualquer promotion code
  // (hoje vendem pelo VOY_BR_40_OFF_AFFILIATES), igual ao pace.
  CUPONS_HIBRIDOS: ['ISAVOY', 'CARINAVOY', 'CARINA40'],
  // Cupons alternativos somados no cupom principal
  CUPOM_ALIAS: { 'CARINA40': 'CARINAVOY' },

  // Custo de medicação (lake no BigQuery): pedidos com desconto >= MEDICACAO_DESCONTO_MIN
  // (vendas gratuitas) de clientes cuja order de aquisição usou PROMO_MEDICACAO. Custo = gross
  // revenue do pedido, na data de conclusão do pagamento. O CPF do cliente é cruzado com o CPF
  // do creator em manual_silver.creators (Nekt) e o custo vai para o referral_code do creator.
  // CPF sem creator correspondente vai para a linha CUPOM_MEDICACAO_SEM_CREATOR.
  // Os CPFs só são usados em memória: nada de CPF é gravado na planilha.
  BQ_PROJECT: 'manual-data-team',
  PROMO_MEDICACAO: ['voy_br_influvoy_4_99off', 'voy_br_influvoy_99'],
  MEDICACAO_DESCONTO_MIN: 0.9,
  TABELA_CREATORS: 'manual_silver.creators',
  CUPOM_MEDICACAO_SEM_CREATOR: '(MEDICACAO SEM CREATOR)',

  // Custo fixo:
  //   'CONTRATO'  = metodologia do Control Tower (padrão): valor total do contrato dividido
  //                 igualmente por todos os dias do contrato. Total = soma do fixo mensal de
  //                 cada mês que o contrato toca. Sem data de fim: fixo mensal / dias do mês.
  //   'DIARIZADO' = fixo mensal dividido pelos dias de contrato ativos em cada mês
  //   'PECA'      = regra de pagamento da Irís: fixo / peças do ciclo, reconhecido na data
  //                 de publicação de cada peça entregue (hoje quase todas estão 'sem_data')
  // Peças com valor próprio (unit_value_cents) entram sempre na data de publicação.
  FIXO_MODO: 'CONTRATO',
  // Contrato sem ends_on: 'FIM_DO_MES' = termina no último dia do mês de starts_on
  // (contratos duram até um mês; renovação abre nova linha). null = sem fim (rateio mês a mês).
  CONTRATO_SEM_FIM: 'FIM_DO_MES',
  FIXO_STATUS_CONTRATO: ['active', 'ended'],   // paused só entra nos meses com ciclo aberto
  CUPONS_IGNORAR: ['CUPOMTESTE', 'TEESTE'],     // cadastros de teste na Irís

  // Comissão (sale_bands de contract_terms) e campanhas (commission_campaigns ativas ou encerradas):
  //   COMISSAO_JANELA 'IRIS'     = igual ao calcular_pagamento: começa na 1ª peça publicada
  //                                (ou em starts_on se o contrato renova outro)
  //                   'CONTRATO' = começa em starts_on (padrão enquanto a publicação das peças
  //                                não é registrada na Irís)
  //   Vendas elegíveis: pedidos com pagamento concluído (mesmo critério do attributed_sales)
  COMISSAO_JANELA: 'CONTRATO',
  // PROTÓTIPO: antecipa a comissão. As faixas entraram na Irís em 29/10/2026; com a simulação,
  // vendas a partir de 'inicio' usam os termos vigentes em 'termosDe' e vendas antes de 'inicio'
  // não geram comissão nem contam na faixa. Em produção: COMISSAO_SIMULACAO: null.
  COMISSAO_SIMULACAO: { inicio: '2026-10-22', termosDe: '2026-10-29' },

  // Funil (Mixpanel bruto na Nekt). Réplica do board "Voy Saude BR Full funnel":
  // passo 1 Loaded a Page (filtro de topo de funil), passo 2 Questionnaire Started,
  // passo 3 Recommendations Loaded / Checkout Started, janela de 1 sessão,
  // filtro e breakdown pelo last touch do passo 1.
  FUNIL: {
    // 'MIXPANEL' = report do board pela Query API (padrão, sem custo de Nekt); 'NEKT' = SQL no mixpanel_events
    FONTE: 'MIXPANEL',
    TABELA: 'manual_default.mixpanel_events',
    EV_PAGINA: 'Loaded a Page',
    EV_QUEST: 'Questionnaire Started',
    EV_RECS: 'Recommendations Loaded',
    EV_CHECKOUT: 'Checkout Started',
    // Aproximação do filtro "Voy BR top of funnel filter for acquisitions" (definição
    // não acessível pela API): domínio da Voy BR e país BR. Ajustar se o filtro tiver mais regras.
    DOMINIO_SUFIXO: 'voysaude.com.br',
    PAIS: 'BR',
    UTM_SOURCES: ['influencer', 'influencers'],   // comparação em minúsculas
    SESSAO_MIN: 30,                               // timeout de sessão do Mixpanel
    LOOKBACK_HORAS: 24,                           // histórico extra para o last touch e sessões que viram o dia
    JANELA_DIAS: 3,                               // incremental diário: D-1 até D-3
    BACKFILL_DIAS_POR_QUERY: 2                    // ~30 GB lidos por dia de Mixpanel
  },

  // Mixpanel direto (Query API, residência EU). Board "Voy Saude BR Full funnel":
  // https://eu.mixpanel.com/project/2829492/view/3363500/app/boards#id=11539194 (report 92920568)
  MIXPANEL: {
    API_BASE: 'https://eu.mixpanel.com/api/query',
    PROJECT_ID: '2829492',
    WORKSPACE_ID: '3363500',
    FUNIL_REPORT_ID: '92920568',
    CUPOM_OUTROS: '(OUTROS NO MIXPANEL)'   // '$other': cupons além do limite de 200 segmentos do report
  },

  // Abas
  ABA_BASE: 'BASE_INFLUENCERS_WL',
  ABA_FUNIL: '_cache_funil',
  ABA_LOG: '_log',

  // Conteúdos (Irís, content_pieces): peças entregues, na data de publicação.
  // Vão para a aba própria ABA_CONTEUDOS (Data | Cupom | Plataforma | Formato | Quantidade).
  CONTEUDO_STATUS: ['entregue'],
  FORMATOS: {
    reels:          { plataforma: 'Instagram', formato: 'Reels' },
    feed:           { plataforma: 'Instagram', formato: 'Feed' },
    stories:        { plataforma: 'Instagram', formato: 'Stories' },
    ig_transmissao: { plataforma: 'Instagram', formato: 'Transmissão' },
    tiktok:         { plataforma: 'TikTok',    formato: 'Vídeo' },
    youtube:        { plataforma: 'YouTube',   formato: 'Vídeo' },
    shorts:         { plataforma: 'YouTube',   formato: 'Shorts' },
    insert:         { plataforma: 'YouTube',   formato: 'Inserção' },
    live_yt:        { plataforma: 'YouTube',   formato: 'Live' },
    insert_twitch:  { plataforma: 'Twitch',    formato: 'Inserção' },
    whatsapp:       { plataforma: 'WhatsApp',  formato: 'Envio' },
    podcast:        { plataforma: 'Podcast',   formato: 'Episódio' }
  },
  FORMATO_SEM_TIPO: { plataforma: 'Outras', formato: 'Não informado' },

  // Abas e cabeçalhos (ordem fixa, consumida por outros scripts)
  ABA_CONTEUDOS: 'BASE_CONTEUDOS_WL',
  COLUNAS: ['Data', 'Cupom', 'Custo fixo', 'Custo de comissão', 'Custo de campanha de incentivo',
    'Custo de medicação', 'Sessões', 'Quest started', 'Recommendations', 'Checkout started', 'Orders', 'Acquisitions'],
  COLUNAS_CONTEUDOS: ['Data', 'Cupom', 'Plataforma', 'Formato', 'Quantidade'],

  NEKT_MCP_URL: 'https://mcp.nekt.com/mcp',
  NEKT_MAX_PAGINAS: 200
};

function prop_(nome, obrigatoria) {
  var v = PropertiesService.getScriptProperties().getProperty(nome);
  if (!v && obrigatoria !== false) throw new Error('Propriedade do script ausente: ' + nome);
  return v;
}
