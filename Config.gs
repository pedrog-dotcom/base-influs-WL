/****************************************************************************************
 * Config.gs: parâmetros da Base Influencers WL (Voy BR)
 * ------------------------------------------------------------------------------------
 * Tudo o que muda de regra de negócio fica aqui. Segredos ficam nas Propriedades do script:
 *   SUPABASE_URL          https://eupkvybriepteduevrpr.supabase.co   (projeto IRIS)
 *   SUPABASE_SERVICE_KEY  service_role key do projeto IRIS (lê tabelas com RLS)
 *   NEKT_MCP_TOKEN        token de MCP da Nekt (o mesmo usado em CRM-WL serve)
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

  // Custo fixo:
  //   'CONTRATO'  = metodologia do Control Tower (padrão): valor total do contrato dividido
  //                 igualmente por todos os dias do contrato. Total = soma do fixo mensal de
  //                 cada mês que o contrato toca. Sem data de fim: fixo mensal / dias do mês.
  //   'DIARIZADO' = fixo mensal dividido pelos dias de contrato ativos em cada mês
  //   'PECA'      = regra de pagamento da Irís: fixo / peças do ciclo, reconhecido na data
  //                 de publicação de cada peça entregue (hoje quase todas estão 'sem_data')
  // Peças com valor próprio (unit_value_cents) entram sempre na data de publicação.
  FIXO_MODO: 'CONTRATO',
  FIXO_STATUS_CONTRATO: ['active', 'ended'],   // paused só entra nos meses com ciclo aberto
  CUPONS_IGNORAR: ['CUPOMTESTE', 'TEESTE'],     // cadastros de teste na Irís

  // Comissão (sale_bands de contract_terms) e campanhas (commission_campaigns):
  //   COMISSAO_JANELA 'IRIS'     = igual ao calcular_pagamento: começa na 1ª peça publicada
  //                                (ou em starts_on se o contrato renova outro)
  //                   'CONTRATO' = começa em starts_on
  //   Vendas elegíveis: pedidos com pagamento concluído (mesmo critério do attributed_sales)
  COMISSAO_JANELA: 'IRIS',

  // Funil (Mixpanel bruto na Nekt). Réplica do board "Voy Saude BR Full funnel":
  // passo 1 Loaded a Page (filtro de topo de funil), passo 2 Questionnaire Started,
  // passo 3 Recommendations Loaded / Checkout Started, janela de 1 sessão,
  // filtro e breakdown pelo last touch do passo 1.
  FUNIL: {
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

  // Abas
  ABA_BASE: 'BASE_INFLUENCERS_WL',
  ABA_FUNIL: '_cache_funil',
  ABA_LOG: '_log',

  // Conteúdos (Irís, content_pieces): peças entregues, na data de publicação.
  // Uma coluna por formato e uma por plataforma, na ordem abaixo.
  CONTEUDO_STATUS: ['entregue'],
  FORMATOS: [
    { id: 'reels',          coluna: 'Reels',               plataforma: 'Instagram' },
    { id: 'feed',           coluna: 'Feed',                plataforma: 'Instagram' },
    { id: 'stories',        coluna: 'Stories',             plataforma: 'Instagram' },
    { id: 'ig_transmissao', coluna: 'Transmissão IG',      plataforma: 'Instagram' },
    { id: 'tiktok',         coluna: 'Vídeo TikTok',        plataforma: 'TikTok' },
    { id: 'youtube',        coluna: 'Vídeo YouTube',       plataforma: 'YouTube' },
    { id: 'shorts',         coluna: 'Shorts',              plataforma: 'YouTube' },
    { id: 'insert',         coluna: 'Inserção YouTube',    plataforma: 'YouTube' },
    { id: 'live_yt',        coluna: 'Live YouTube',        plataforma: 'YouTube' },
    { id: 'insert_twitch',  coluna: 'Inserção Twitch',     plataforma: 'Twitch' },
    { id: 'whatsapp',       coluna: 'Envio WhatsApp',      plataforma: 'WhatsApp' },
    { id: 'podcast',        coluna: 'Episódio podcast',    plataforma: 'Podcast' }
  ],
  FORMATO_SEM_TIPO: { coluna: 'Outros formatos', plataforma: 'Outras' },

  NEKT_MCP_URL: 'https://mcp.nekt.com/mcp',
  NEKT_MAX_PAGINAS: 200
};

/** Cabeçalho da base (ordem fixa, consumida por outros scripts). */
function colunasBase_() {
  var plataformas = [];
  CFG.FORMATOS.concat([CFG.FORMATO_SEM_TIPO]).forEach(function (f) {
    if (plataformas.indexOf(f.plataforma) < 0) plataformas.push(f.plataforma);
  });
  return ['Data', 'Cupom', 'Custo fixo', 'Custo de comissão', 'Custo de campanha de incentivo', 'Custo total',
    'Sessões', 'Quest started', 'Recommendations', 'Checkout started', 'Orders', 'Acquisitions',
    'Total de conteúdos']
    .concat(CFG.FORMATOS.map(function (f) { return f.coluna; }), [CFG.FORMATO_SEM_TIPO.coluna])
    .concat(plataformas.map(function (p) { return 'Plataforma ' + p; }));
}

function prop_(nome, obrigatoria) {
  var v = PropertiesService.getScriptProperties().getProperty(nome);
  if (!v && obrigatoria !== false) throw new Error('Propriedade do script ausente: ' + nome);
  return v;
}
