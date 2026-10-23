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

  // Vendas de influenciador (lake via Nekt)
  PROMO_INFLUENCER: ['voy_br_coupon_15_influencer'],

  // Custo de medicação: gross revenue de todas as orders confirmadas de clientes cuja
  // order de aquisição usou um destes promotion codes. Os cupons INFLUVOY são aleatórios
  // e não apontam para a influenciadora, então o custo vai para uma linha própria.
  PROMO_MEDICACAO: ['voy_br_influvoy_4_99off', 'voy_br_influvoy_99'],
  CUPOM_MEDICACAO: '(MEDICACAO INFLUVOY)',

  // Linha de custos sem cupom (plataformas sem cupom informado)
  CUPOM_GERAL: '(GERAL)',

  // Custo fixo:
  //   'DIARIZADO' = fixo mensal do contrato dividido pelos dias de contrato ativos no mês
  //   'PECA'      = regra de pagamento da Irís: fixo / peças do ciclo, reconhecido na data
  //                 de publicação de cada peça entregue (hoje quase todas estão 'sem_data')
  // Peças com valor próprio (unit_value_cents) entram sempre na data de publicação.
  FIXO_MODO: 'DIARIZADO',
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
  ABA_PLATAFORMAS: 'INPUT_PLATAFORMAS',
  ABA_LOG: '_log',

  // Cabeçalho da base (ordem fixa, consumida por outros scripts)
  COLUNAS: ['Data', 'Cupom', 'Custo fixo', 'Custo de comissão', 'Custo de plataformas',
    'Custo de medicação', 'Custo de campanha', 'Custo total', 'Sessões', 'Quest started',
    'Recommendations', 'Checkout started', 'Orders', 'Acquisitions'],

  NEKT_MCP_URL: 'https://mcp.nekt.com/mcp',
  NEKT_MAX_PAGINAS: 200
};

function prop_(nome, obrigatoria) {
  var v = PropertiesService.getScriptProperties().getProperty(nome);
  if (!v && obrigatoria !== false) throw new Error('Propriedade do script ausente: ' + nome);
  return v;
}
