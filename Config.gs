/****************************************************************************************
 * Config.gs: parâmetros da Base Influencers WL (Voy BR)
 * ------------------------------------------------------------------------------------
 * Tudo o que muda de regra de negócio fica aqui. Segredos ficam nas Propriedades do script:
 *   SUPABASE_URL          https://eupkvybriepteduevrpr.supabase.co   (projeto IRIS)
 *   SUPABASE_SERVICE_KEY  service_role key do projeto IRIS (lê tabelas com RLS)
 *   MIXPANEL_SA_USER      service account do Mixpanel (funil)
 *   MIXPANEL_SA_SECRET    secret da service account do Mixpanel
 * Vendas e custo de medicação vêm do lake no BigQuery (serviço avançado "BigQuery API",
 * projeto CFG.BQ_PROJECT), com a conta que executa o script. Não usa a Nekt.
 *   ALERT_EMAIL           (opcional) destinatário dos avisos de erro
 ****************************************************************************************/

var CFG = {
  TZ: 'America/Sao_Paulo',
  SUPABASE_URL: 'https://eupkvybriepteduevrpr.supabase.co',   // usado se a propriedade SUPABASE_URL não existir

  // Primeiro dia da base. A comissão precisa do histórico desde o início dos contratos,
  // então as vendas são lidas desde VENDAS_DESDE, mas a base só grava a partir de DATA_INICIO.
  DATA_INICIO: '2026-06-01',
  VENDAS_DESDE: '2026-01-01',

  // Recorte WL
  BRAND: 'Voy',
  COUNTRY: 'brazil',
  CATEGORIA_IRIS: 'weight_loss',
  CATEGORIA_LAKE: 'weight_loss',    // order_taxonomy_business_category das métricas "Category"
  // Orders / Payment Completed / Acquisitions só contam order_context de aquisição ('acquisition' ou
  // 'unconfirmed-acquisition'). As métricas "Category" são o ADICIONAL: pedidos de outro contexto
  // (reactivation, incremental, ...) que são o 1º pedido do cliente na categoria. A comissão usa
  // Acquisitions + Acquisitions Category.
  CONTEXTO_AQUISICAO: 'acquisition',
  MEDICACAO: true,                  // custo de medicação por CPF (false desliga no perfil)

  // Vendas de influenciador (BigQuery, prod.fct_orders + prod.dim_order_item_discounts):
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
  // da influenciadora na Irís (influencer_personal_data) e o custo vai para o cupom dela.
  // CPF sem creator correspondente vai para a linha CUPOM_MEDICACAO_SEM_CREATOR.
  // Os CPFs só são usados em memória: nada de CPF é gravado na planilha.
  BQ_PROJECT: 'manual-data-team',
  PROMO_MEDICACAO: ['voy_br_influvoy_4_99off', 'voy_br_influvoy_99'],
  MEDICACAO_DESCONTO_MIN: 0.9,
  CUPOM_MEDICACAO_SEM_CREATOR: '(MEDICACAO SEM CREATOR)',

  // Custo fixo (valor do contrato é MENSAL):
  //   'DIARIZADO' = (padrão) em cada mês em que o contrato está ativo, o fixo mensal é dividido
  //                 igualmente pelos dias de contrato naquele mês: de max(1º dia do mês, starts_on)
  //                 até min(último dia do mês, ends_on). Contrato sem ends_on segue mês a mês,
  //                 com o fixo mensal inteiro espalhado pelos dias de contrato de cada mês.
  //   'CONTRATO'  = metodologia antiga do Control Tower: total do contrato / todos os dias do contrato
  //   'PECA'      = regra de pagamento da Irís: fixo / peças do ciclo, na data de publicação
  // Peças com valor próprio (unit_value_cents) entram sempre na data de publicação.
  FIXO_MODO: 'DIARIZADO',
  // Contrato sem ends_on: null = segue em aberto mês a mês (padrão). 'FIM_DO_MES' = termina
  // no último dia do mês de starts_on.
  CONTRATO_SEM_FIM: null,
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

  // Mixpanel direto (Query API, residência EU). Board "Voy Saude BR Full funnel":
  // https://eu.mixpanel.com/project/2829492/view/3363500/app/boards#id=11539194 (report 93726547, últimos 30 dias)
  MIXPANEL: {
    API_BASE: 'https://eu.mixpanel.com/api/query',
    PROJECT_ID: '2829492',
    WORKSPACE_ID: '3363500',
    FUNIL_REPORT_ID: '93726547',
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
  // Aba principal em formato longo (uma linha por Data x Cupom x Métrica, só valores != 0).
  // Spend = custo fixo + comissão + campanha de incentivo + medicação.
  COLUNAS: ['Data', 'Channel Group', 'Channel', 'Subchannel', 'Metrica', 'Valor'],
  BASE_DESDE: '2026-10-21',          // primeiro dia gravado (os cálculos usam o histórico todo)
  CHANNEL_GROUP: 'Influence',
  CHANNEL: 'Influencers',
  FORMATO_DATA_BASE: 'yyyy-mm-dd',
  MAPEAMENTO: null,                  // de-para de cupom (ver mapeadorCupom_)
  // Métrica -> campo(s) do acumulador
  METRICAS: {
    'Sessions': ['sessoes'],
    'Quest started': ['quest'],
    'Recommendations': ['recs'],
    'Checkout started': ['checkout'],
    'Orders': ['orders'],
    'Payment Completed': ['pagos'],
    'Acquisitions': ['acq'],
    'Orders Category': ['orders_cat'],
    'Payment Completed Category': ['pagos_cat'],
    'Acquisitions Category': ['acq_cat'],
    'Spend': ['fixo', 'comissao', 'campanha', 'medicacao']
  },
  COLUNAS_CONTEUDOS: ['Data', 'Cupom', 'Plataforma', 'Formato', 'Quantidade']
};

/**
 * Perfis (uma aba de base por categoria). Cada perfil sobrescreve chaves do CFG durante a sua
 * execução (ver comPerfil_). WL usa o CFG como está; HL troca marca, categoria, promo, report do
 * Mixpanel, promo de medicação e abas.
 */
var PERFIS = {
  WL: {},
  HL: {
    BRAND: 'MANUAL',
    CATEGORIA_IRIS: 'hair_loss',
    CATEGORIA_LAKE: 'hair_loss',
    PROMO_INFLUENCER: ['BR_INFLUENCERS_40_OFF_FIRST_ORDER'],
    CUPONS_HIBRIDOS: [],
    CUPOM_ALIAS: {},
    // Medicação da Manual: pedidos com desconto >= 90% de clientes cuja aquisição usou HL_BR_AFFILIATES_100OFF
    PROMO_MEDICACAO: ['HL_BR_AFFILIATES_100OFF'],
    // https://eu.mixpanel.com/project/2829492/view/3363500/app/boards#id=11478100 (report 93748474)
    MIXPANEL: {
      API_BASE: 'https://eu.mixpanel.com/api/query', PROJECT_ID: '2829492', WORKSPACE_ID: '3363500',
      FUNIL_REPORT_ID: '93748474', CUPOM_OUTROS: '(OUTROS NO MIXPANEL)'
    },
    ABA_BASE: 'BASE_INFLUENCERS_HL',
    ABA_FUNIL: '_cache_funil_hl',
    ABA_CONTEUDOS: null
  }
};

function prop_(nome, obrigatoria) {
  var v = PropertiesService.getScriptProperties().getProperty(nome);
  if (!v && obrigatoria !== false) throw new Error('Propriedade do script ausente: ' + nome);
  return v;
}
