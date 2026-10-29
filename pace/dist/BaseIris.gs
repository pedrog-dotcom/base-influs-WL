// GERADO por pace/build.sh a partir do repositório base-influs-WL. Não editar aqui.

// ===== pace/Config.gs =====
/****************************************************************************************
 * Config.gs: parâmetros da Base Influencers WL (Voy BR), VERSÃO DO PACING V3
 *   (WL BR | Influencers - PACING V3). Gera a aba auxiliar H_Iris, lida pela fórmula da aba
 *   'Acquisition: Paid Creators' a partir da data de corte em Config!B14 (01/11/2026).
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
  SUPABASE_URL: 'https://eupkvybriepteduevrpr.supabase.co',   // usado se a propriedade SUPABASE_URL não existir

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
  // https://eu.mixpanel.com/project/2829492/view/3363500/app/boards#id=11539194 (report 93726547, últimos 30 dias)
  MIXPANEL: {
    API_BASE: 'https://eu.mixpanel.com/api/query',
    PROJECT_ID: '2829492',
    WORKSPACE_ID: '3363500',
    FUNIL_REPORT_ID: '93726547',
    CUPOM_OUTROS: '(OUTROS NO MIXPANEL)'   // '$other': cupons além do limite de 200 segmentos do report
  },

  // Abas
  ABA_BASE: 'H_Iris',
  ABA_FUNIL: '_iris_cache_funil',
  ABA_LOG: '_iris_log',

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
  ABA_CONTEUDOS: null,               // no pacing não há aba de conteúdos
  // Aba principal em formato longo (uma linha por Data x Cupom x Métrica, só valores != 0).
  // Spend = custo fixo + comissão + campanha de incentivo + medicação.
  COLUNAS: ['Data', 'Cupom principal', 'Metric', 'Value'],
  BASE_DESDE: '2026-10-21',          // a fórmula só usa a partir de Config!B14; antes disso é para conferência
  CHANNEL_GROUP: null,               // aba auxiliar: Channel Group e Channel vêm da fórmula
  CHANNEL: null,
  FORMATO_DATA_BASE: 'dd/MM/yyyy',
  // De-para da aba Mapeamento do pacing: Cupom (D) -> Cupom principal (E); UTM (J) -> Cupom principal (K)
  MAPEAMENTO: { aba: 'Mapeamento', pares: [[4, 5], [10, 11]] },
  // Métrica -> campo(s) do acumulador
  METRICAS: {
    'Sessions': ['sessoes'],
    'Quest started': ['quest'],
    'Recommendations': ['recs'],
    'Checkout started': ['checkout'],
    'Orders': ['orders'],
    'Payment Completed': ['pagos'],
    'Acquisitions': ['acq'],
    'Spend': ['fixo', 'comissao', 'campanha', 'medicacao']
  },
  COLUNAS_CONTEUDOS: ['Data', 'Cupom', 'Plataforma', 'Formato', 'Quantidade'],

  NEKT_MCP_URL: 'https://mcp.nekt.com/mcp',
  NEKT_MAX_PAGINAS: 200
};

function prop_(nome, obrigatoria) {
  var v = PropertiesService.getScriptProperties().getProperty(nome);
  if (!v && obrigatoria !== false) throw new Error('Propriedade do script ausente: ' + nome);
  return v;
}

// ===== Util.gs =====
/****************************************************************************************
 * Util.gs: datas em ISO (yyyy-mm-dd) e acumuladores. Sem dependência de serviços do Apps Script
 * (exceto hojeISO_/tsParaDiaISO_), para poder testar a lógica fora do editor.
 ****************************************************************************************/

function isoParaUtc_(iso) {
  var p = String(iso).slice(0, 10).split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}

function utcParaIso_(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function somaDias_(iso, n) {
  return utcParaIso_(isoParaUtc_(iso) + n * 86400000);
}

function inicioMes_(iso) { return String(iso).slice(0, 7) + '-01'; }

function fimMes_(iso) {
  var p = String(iso).slice(0, 10).split('-');
  return utcParaIso_(Date.UTC(+p[0], +p[1], 0));
}

function diasNoMes_(iso) { return +fimMes_(iso).slice(8, 10); }

function diasEntre_(aISO, bISO) { // inclusivo
  return Math.round((isoParaUtc_(bISO) - isoParaUtc_(aISO)) / 86400000) + 1;
}

function minIso_(a, b) { return !a ? b : !b ? a : (a < b ? a : b); }
function maxIso_(a, b) { return !a ? b : !b ? a : (a > b ? a : b); }

function hojeISO_() {
  return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
}

function ontemISO_() { return somaDias_(hojeISO_(), -1); }

/** timestamptz (string do Supabase) -> dia em Brasília. tzOffsetMin fixo -180 (Brasil sem horário de verão). */
function tsParaDiaISO_(ts) {
  if (!ts) return null;
  var ms = new Date(ts).getTime();
  if (isNaN(ms)) return null;
  return utcParaIso_(ms - 3 * 3600000);
}

function normCupom_(c) {
  return c == null ? '' : String(c).trim().toUpperCase();
}

/**
 * Acumulador da base: chave data|cupom -> { campo: valor }.
 */
function novoAcc_() { return {}; }

function accAdd_(acc, dataISO, cupom, campo, valor) {
  if (!dataISO || !valor) return;
  var k = dataISO + '|' + cupom;
  var r = acc[k];
  if (!r) r = acc[k] = { data: dataISO, cupom: cupom };
  r[campo] = (r[campo] || 0) + Number(valor);
}

// ===== Clients.gs =====
/****************************************************************************************
 * Clients.gs: acesso ao Supabase (Irís) via PostgREST e à Nekt via MCP (execute_sql)
 ****************************************************************************************/

/* =========================================================================
 * Supabase (Irís)
 * ========================================================================= */

/**
 * Lê uma tabela/view inteira do schema public, paginando de 1000 em 1000.
 * query: string PostgREST sem o select (ex.: 'status=eq.ativa').
 */
function sbSelect_(tabela, colunas, query) {
  var base = String(prop_('SUPABASE_URL', false) || CFG.SUPABASE_URL).replace(/\/+$/, '');
  var key = prop_('SUPABASE_SERVICE_KEY');
  var out = [], passo = 1000;
  for (var offset = 0; offset < 1e6; offset += passo) {
    var url = base + '/rest/v1/' + tabela + '?select=' + encodeURIComponent(colunas || '*') +
      (query ? '&' + query : '') + '&limit=' + passo + '&offset=' + offset;
    var resp = UrlFetchApp.fetch(url, {
      method: 'get', muteHttpExceptions: true,
      headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
    });
    var code = resp.getResponseCode();
    if (code >= 400) throw new Error('Supabase ' + tabela + ' HTTP ' + code + ': ' + resp.getContentText().slice(0, 300));
    var lote = JSON.parse(resp.getContentText());
    out = out.concat(lote);
    if (lote.length < passo) break;
  }
  return out;
}

/* =========================================================================
 * BigQuery (lake). Serviço avançado "BigQuery API" v2, com a conta que executa o script.
 * ========================================================================= */

/** Roda um SQL padrão no BigQuery e devolve lista de objetos {coluna: valor-texto}. */
function bqSql_(sql) {
  if (typeof BigQuery === 'undefined') throw new Error('Ative o serviço avançado "BigQuery API" no projeto do Apps Script.');
  var req = { query: sql, useLegacySql: false, timeoutMs: 60000, maxResults: 10000 };
  var res = BigQuery.Jobs.query(req, CFG.BQ_PROJECT);
  var jobId = res.jobReference.jobId, loc = res.jobReference.location;
  for (var i = 0; !res.jobComplete && i < 60; i++) {
    Utilities.sleep(2000);
    res = BigQuery.Jobs.getQueryResults(CFG.BQ_PROJECT, jobId, { location: loc, timeoutMs: 60000, maxResults: 10000 });
  }
  if (!res.jobComplete) throw new Error('Query do BigQuery não terminou a tempo (job ' + jobId + ').');
  var campos = res.schema.fields.map(function (f) { return f.name; });
  var out = [];
  function add(rows) {
    (rows || []).forEach(function (r) {
      var o = {};
      r.f.forEach(function (c, i) { o[campos[i]] = c.v; });
      out.push(o);
    });
  }
  add(res.rows);
  var token = res.pageToken;
  while (token) {
    var pg = BigQuery.Jobs.getQueryResults(CFG.BQ_PROJECT, jobId, { location: loc, pageToken: token, maxResults: 10000 });
    add(pg.rows);
    token = pg.pageToken;
  }
  return out;
}

/* =========================================================================
 * Nekt (MCP via HTTP, JSON-RPC). Mesmo cliente do CRM-WL.
 * ========================================================================= */

function nektParse_(resp) {
  var txt = String(resp.getContentText()).trim();
  if (txt.charAt(0) !== '{') {
    var datas = txt.split(/\r?\n/).filter(function (l) { return l.indexOf('data:') === 0; });
    if (!datas.length) throw new Error('Resposta inesperada da Nekt (HTTP ' + resp.getResponseCode() + '): ' + txt.slice(0, 300));
    txt = datas[datas.length - 1].slice(5).trim();
  }
  var msg = JSON.parse(txt);
  if (msg.error) throw new Error('Nekt: ' + (msg.error.message || JSON.stringify(msg.error)));
  return msg;
}

function nektPost_(payload, sessionId) {
  var headers = { Authorization: 'Bearer ' + prop_('NEKT_MCP_TOKEN'), Accept: 'application/json, text/event-stream' };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  var resp = UrlFetchApp.fetch(CFG.NEKT_MCP_URL, {
    method: 'post', contentType: 'application/json', headers: headers,
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code === 401 || code === 403) throw new Error('Token da Nekt recusado (HTTP ' + code + '). Atualize NEKT_MCP_TOKEN.');
  if (code >= 400) throw new Error('Erro HTTP ' + code + ' na Nekt: ' + resp.getContentText().slice(0, 300));
  return resp;
}

function nektSession_() {
  var resp = nektPost_({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'base-influencers-wl', version: '1.0' } }
  }, null);
  var h = resp.getAllHeaders(), sid = null;
  Object.keys(h).forEach(function (k) { if (k.toLowerCase() === 'mcp-session-id') sid = h[k]; });
  nektParse_(resp);
  try { nektPost_({ jsonrpc: '2.0', method: 'notifications/initialized' }, sid); } catch (e) { /* sem resposta útil */ }
  return sid;
}

/** Roda um SQL na Nekt e devolve uma lista de objetos {coluna: valor-texto}, juntando as páginas. */
function nektSql_(sql) {
  var sid = nektSession_();
  var columns = null, rows = [], token = null, id = 10;
  for (var p = 0; p < CFG.NEKT_MAX_PAGINAS; p++) {
    var args = { sql_query: sql };
    if (token) args.page_token = token;
    var msg = nektParse_(nektPost_({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name: 'execute_sql', arguments: args } }, sid));
    var res = msg.result || {};
    if (res.isError) throw new Error('Nekt execute_sql: ' + ((res.content && res.content[0] && res.content[0].text) || 'erro'));
    var txt = (res.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('');
    var out = res.structuredContent || JSON.parse(txt);
    if (out.status && out.status !== 'succeeded') throw new Error('Query falhou na Nekt: ' + (out.error || JSON.stringify(out).slice(0, 300)));
    if (out.columns && out.columns.length) columns = out.columns;
    (out.data || []).forEach(function (r) { rows.push(r); });
    // A Nekt pode devolver a 1ª página vazia com data_truncated=true: segue o token sempre que vier.
    token = out.next_page_token || null;
    if (!token) break;
  }
  columns = columns || [];
  return rows.map(function (r) {
    var o = {};
    columns.forEach(function (c, i) { o[c] = r[i]; });
    return o;
  });
}

// ===== Sql.gs =====
/****************************************************************************************
 * Sql.gs: consultas na Nekt (BigQuery). Só montagem de texto; a execução fica nos módulos.
 *
 * Tabelas (camada default, alimentadas pelo Nekt-brazil a partir do lake):
 *   manual_default.webhook_v2_orders_lake            1 linha por envio do webhook: deduplicada
 *                                                    pela última _nekt_webhook_received_at
 *   manual_default.webhook_v2_order_discounts_lake   promotion_code / promotion_coupon_code
 *   manual_default.mixpanel_events                   eventos brutos (properties em JSON)
 ****************************************************************************************/

function sqlList_(arr) {
  return arr.map(function (s) { return "'" + String(s).replace(/'/g, "\\'") + "'"; }).join(', ');
}

function sqlOrdersCte_() {
  return "orders AS (\n" +
    "  SELECT * FROM `manual_default`.`webhook_v2_orders_lake`\n" +
    "  WHERE brand_at_checkout = " + sqlList_([CFG.BRAND]) + " AND LOWER(country) = " + sqlList_([CFG.COUNTRY]) + "\n" +
    "  QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY _nekt_webhook_received_at DESC) = 1\n" +
    ")";
}

/**
 * Pedidos com o cupom de influenciador, 1 linha por pedido. Mesma regra do SQL do pace:
 * Voy, Brazil, promotion_code voy_br_coupon_15_influencer, confirmados ou não. Creators
 * híbridas (CUPONS_HIBRIDOS) entram com qualquer promotion code.
 * data     = checkout em Brasília (Orders)
 * data_pag = conclusão do pagamento em Brasília (Acquisitions, quando confirmado)
 * Lê pedidos com checkout OU pagamento a partir de desdeISO.
 */
function sqlVendasInfluencer_(desdeISO) {
  return "WITH " + sqlOrdersCte_() + ",\n" +
    "disc AS (\n" +
    "  SELECT order_id, UPPER(TRIM(ANY_VALUE(promotion_coupon_code))) AS cupom\n" +
    "  FROM `manual_default`.`webhook_v2_order_discounts_lake`\n" +
    "  WHERE promotion_code IN (" + sqlList_(CFG.PROMO_INFLUENCER) + ")\n" +
    "     OR UPPER(TRIM(promotion_coupon_code)) IN (" + sqlList_(CFG.CUPONS_HIBRIDOS.map(normCupom_)) + ")\n" +
    "  GROUP BY order_id\n" +
    ")\n" +
    "SELECT o.order_id, o.order_number, d.cupom,\n" +
    "  FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP(o.system_checkout_at), 'America/Sao_Paulo')) AS data,\n" +
    "  IF(NULLIF(o.payment_completed_at, '') IS NULL, NULL,\n" +
    "     FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP(o.payment_completed_at), 'America/Sao_Paulo'))) AS data_pag,\n" +
    "  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S', TIMESTAMP(o.system_checkout_at)) AS checkout_utc,\n" +
    "  CAST(o.is_confirmed AS STRING) AS is_confirmed\n" +
    "FROM disc d JOIN orders o USING (order_id)\n" +
    "WHERE NULLIF(o.system_checkout_at, '') IS NOT NULL\n" +
    "  AND (DATE(TIMESTAMP(o.system_checkout_at), 'America/Sao_Paulo') >= DATE '" + desdeISO + "'\n" +
    "       OR (NULLIF(o.payment_completed_at, '') IS NOT NULL\n" +
    "           AND DATE(TIMESTAMP(o.payment_completed_at), 'America/Sao_Paulo') >= DATE '" + desdeISO + "'))\n" +
    "ORDER BY o.system_checkout_at, o.order_number";
}

/**
 * Custo de medicação, direto no lake (BigQuery, manual-data-team.prod). Adaptação do SQL de
 * medicação: pedidos Voy/Brazil com desconto >= MEDICACAO_DESCONTO_MIN, de clientes cuja order
 * de aquisição (mesmo parent_customer_id) usou PROMO_MEDICACAO. Uma linha por pedido (o SQL
 * original repete o gross quando o pedido tem mais de um desconto). Só pedidos com pagamento
 * concluído, que é a data do custo.
 */
function sqlMedicacaoLake_(desdeISO) {
  var p = '`' + CFG.BQ_PROJECT + '.prod.';
  return "SELECT\n" +
    "  o.order_id,\n" +
    "  FORMAT_DATE('%Y-%m-%d', DATE(o.payment_completed_at, 'Brazil/East')) AS data,\n" +
    "  LPAD(REGEXP_REPLACE(IFNULL(c.cpf_number, ''), r'\\D', ''), 11, '0') AS cpf,\n" +
    "  o.gross_revenue_local AS gross,\n" +
    "  o.is_confirmed\n" +
    "FROM " + p + "fct_orders` AS o\n" +
    "LEFT JOIN " + p + "dim_customer` AS c ON o.customer_id = c.customer_id\n" +
    "WHERE IF(o.brand_at_checkout = 'Manual', 'MANUAL', o.brand_at_checkout) = " + sqlList_([CFG.BRAND]) + "\n" +
    "  AND INITCAP(REPLACE(o.country, '_', ' ')) = 'Brazil'\n" +
    "  AND SAFE_DIVIDE(o.discount_local, o.gross_revenue_local) >= " + Number(CFG.MEDICACAO_DESCONTO_MIN) + "\n" +
    "  AND o.payment_completed_at IS NOT NULL\n" +
    "  AND DATE(o.payment_completed_at, 'Brazil/East') >= DATE '" + desdeISO + "'\n" +
    "  AND EXISTS (\n" +
    "    SELECT 1 FROM " + p + "fct_orders` AS a\n" +
    "    JOIN " + p + "dim_order_item_discounts` AS d ON d.order_id = a.order_id\n" +
    "    WHERE a.parent_customer_id = o.parent_customer_id AND a.is_acquisition_order\n" +
    "      AND d.promotion_code IN (" + sqlList_(CFG.PROMO_MEDICACAO) + "))";
}

/** CPF e cupom (referral_code) dos creators, na base de creators da Nekt. */
function sqlCreatorsCpf_() {
  return "SELECT UPPER(TRIM(referral_code)) AS cupom,\n" +
    "  LPAD(REGEXP_REPLACE(cpf, r'\\D', ''), 11, '0') AS cpf\n" +
    "FROM `" + CFG.TABELA_CREATORS.replace('.', '`.`') + "`\n" +
    "WHERE NULLIF(TRIM(cpf), '') IS NOT NULL AND NULLIF(TRIM(referral_code), '') IS NOT NULL";
}

/**
 * Funil por dia e cupom (utm_campaign do last touch no 1º passo), contado em sessões.
 * Sessão: eventos do mesmo distinct_id com intervalo <= SESSAO_MIN.
 * Last touch: último utm_source (com o utm_campaign do mesmo evento) visto até o evento.
 * Lê de (início - LOOKBACK_HORAS) até o fim do dia final, mas só devolve sessões cujo
 * 1º passo cai entre iniISO e fimISO (datas de Brasília, inclusive).
 */
function sqlFunil_(iniISO, fimISO) {
  var F = CFG.FUNIL;
  var t = '`' + F.TABELA.replace('.', '`.`') + '`';
  var iniTs = "TIMESTAMP_SUB(TIMESTAMP('" + iniISO + " 00:00:00', 'America/Sao_Paulo'), INTERVAL " + F.LOOKBACK_HORAS + " HOUR)";
  var fimTs = "TIMESTAMP_ADD(TIMESTAMP('" + fimISO + " 00:00:00', 'America/Sao_Paulo'), INTERVAL 1 DAY)";
  var srcs = sqlList_(F.UTM_SOURCES.map(function (s) { return String(s).toLowerCase(); }));
  return "WITH ev AS (\n" +
    "  SELECT distinct_id, event, event_time,\n" +
    "    LOWER(JSON_VALUE(properties, '$.current_domain')) AS dom,\n" +
    "    JSON_VALUE(properties, '$.mp_country_code') AS cc,\n" +
    "    NULLIF(LOWER(TRIM(JSON_VALUE(properties, '$.utm_source'))), '') AS src,\n" +
    "    NULLIF(UPPER(TRIM(JSON_VALUE(properties, '$.utm_campaign'))), '') AS camp\n" +
    "  FROM " + t + "\n" +
    "  WHERE event_time >= " + iniTs + " AND event_time < " + fimTs + "\n" +
    "    AND event IN (" + sqlList_([F.EV_PAGINA, F.EV_QUEST, F.EV_RECS, F.EV_CHECKOUT]) + ")\n" +
    "), t AS (\n" +
    "  SELECT *,\n" +
    "    LAST_VALUE(IF(src IS NULL, NULL, CONCAT(src, '|', IFNULL(camp, ''))) IGNORE NULLS) OVER w AS touch,\n" +
    "    IF(LAG(event_time) OVER (PARTITION BY distinct_id ORDER BY event_time) IS NULL\n" +
    "       OR TIMESTAMP_DIFF(event_time, LAG(event_time) OVER (PARTITION BY distinct_id ORDER BY event_time), SECOND) > " + (F.SESSAO_MIN * 60) + ", 1, 0) AS novo\n" +
    "  FROM ev\n" +
    "  WINDOW w AS (PARTITION BY distinct_id ORDER BY event_time ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)\n" +
    "), s AS (\n" +
    "  SELECT *, SUM(novo) OVER (PARTITION BY distinct_id ORDER BY event_time ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS sid\n" +
    "  FROM t\n" +
    "), sess AS (\n" +
    "  SELECT distinct_id, sid,\n" +
    "    ARRAY_AGG(IF(event = " + sqlList_([F.EV_PAGINA]) + " AND ENDS_WITH(IFNULL(dom, ''), " + sqlList_([F.DOMINIO_SUFIXO]) + ") AND cc = " + sqlList_([F.PAIS]) + ",\n" +
    "      STRUCT(event_time AS ts, touch AS touch), NULL) IGNORE NULLS ORDER BY event_time LIMIT 1)[SAFE_OFFSET(0)] AS p1,\n" +
    "    ARRAY_AGG(STRUCT(event, event_time)) AS evs\n" +
    "  FROM s GROUP BY 1, 2\n" +
    "), f AS (\n" +
    "  SELECT DATE(p1.ts, 'America/Sao_Paulo') AS dia,\n" +
    "    SPLIT(p1.touch, '|')[SAFE_OFFSET(0)] AS src,\n" +
    "    NULLIF(SPLIT(p1.touch, '|')[SAFE_OFFSET(1)], '') AS camp,\n" +
    "    (SELECT MIN(e.event_time) FROM UNNEST(evs) e WHERE e.event = " + sqlList_([F.EV_QUEST]) + " AND e.event_time >= p1.ts) AS q_ts,\n" +
    "    evs\n" +
    "  FROM sess WHERE p1.ts IS NOT NULL\n" +
    ")\n" +
    "SELECT FORMAT_DATE('%Y-%m-%d', dia) AS data, IFNULL(camp, '(SEM UTM_CAMPAIGN)') AS cupom,\n" +
    "  COUNT(*) AS sessoes,\n" +
    "  COUNTIF(q_ts IS NOT NULL) AS quest,\n" +
    "  COUNTIF(EXISTS(SELECT 1 FROM UNNEST(evs) e WHERE e.event = " + sqlList_([F.EV_RECS]) + " AND e.event_time >= q_ts)) AS recs,\n" +
    "  COUNTIF(EXISTS(SELECT 1 FROM UNNEST(evs) e WHERE e.event = " + sqlList_([F.EV_CHECKOUT]) + " AND e.event_time >= q_ts)) AS checkout\n" +
    "FROM f\n" +
    "WHERE src IN (" + srcs + ") AND dia BETWEEN DATE '" + iniISO + "' AND DATE '" + fimISO + "'\n" +
    "GROUP BY 1, 2 ORDER BY 1, 2";
}

// ===== Iris.gs =====
/****************************************************************************************
 * Iris.gs: carrega do Supabase (projeto IRIS) o que a base precisa, já filtrado para WL.
 *
 * Tabelas: categories, influencers, contracts, contract_terms_ranges (view: só termos
 * 'ativa', com valid_until), content_cycles, content_pieces, commission_campaigns,
 * commission_campaign_contracts.
 *
 * Plug-and-play: sale_bands (contract_terms) e commission_campaigns estão vazias hoje;
 * assim que forem preenchidas na Irís, a próxima execução já calcula comissão e campanha.
 ****************************************************************************************/

function carregarIris_() {
  var cat = sbSelect_('categories', 'id,slug', 'slug=eq.' + CFG.CATEGORIA_IRIS);
  if (!cat.length) throw new Error('Categoria ' + CFG.CATEGORIA_IRIS + ' não encontrada na Irís.');
  var catId = cat[0].id;

  var influencers = sbSelect_('influencers', 'id,name,referral_code,archived_at');
  var contratos = sbSelect_('contracts',
    'id,influencer_id,category_id,monthly_fixed_cents,pieces_per_cycle,starts_on,ends_on,status,previous_contract_id,commission_extended_until',
    'category_id=eq.' + catId);
  var idsContrato = {};
  contratos.forEach(function (c) {
    idsContrato[c.id] = true;
    // Regra de negócio: contrato dura no máximo um mês (renovação abre nova linha).
    // Sem ends_on, o contrato termina no último dia do mês de starts_on.
    if (!c.ends_on && c.starts_on && CFG.CONTRATO_SEM_FIM === 'FIM_DO_MES') {
      c.ends_on = fimMes_(String(c.starts_on).slice(0, 10));
      c.fimImplicito = true;
    }
  });

  var termos = {};
  sbSelect_('contract_terms_ranges', 'id,contract_id,valid_from,valid_until,fixed_monthly_cents,sale_bands,tier_counter_scope,agency_share_bps')
    .forEach(function (t) {
      if (!idsContrato[t.contract_id]) return;
      (termos[t.contract_id] = termos[t.contract_id] || []).push(t);
    });
  Object.keys(termos).forEach(function (k) {
    termos[k].sort(function (a, b) { return a.valid_from < b.valid_from ? -1 : 1; });
  });

  var ciclos = sbSelect_('content_cycles', 'id,contract_id,reference_month,contract_monthly_fixed_cents_snapshot,contract_pieces_per_cycle_snapshot')
    .filter(function (cy) { return idsContrato[cy.contract_id]; });
  var idsCiclo = {};
  ciclos.forEach(function (cy) { idsCiclo[cy.id] = true; });

  var pecas = sbSelect_('content_pieces', 'id,cycle_id,status,is_cancelled,format,published_at,delivered_at,unit_value_cents')
    .filter(function (p) { return idsCiclo[p.cycle_id]; });

  var campanhas = sbSelect_('commission_campaigns', 'id,name,kind,starts_on,ends_on,per_sale_cents,goal_sales,bonus_cents,switch_bands,status',
    'status=in.(ativa,encerrada)&category_id=eq.' + catId);   // encerrada: custo do período em que valeu
  var campanhaContratos = {};
  sbSelect_('commission_campaign_contracts', 'campaign_id,contract_id').forEach(function (r) {
    (campanhaContratos[r.campaign_id] = campanhaContratos[r.campaign_id] || []).push(r.contract_id);
  });

  // Cupom = referral_code da influenciadora (em maiúsculas, igual ao promotion_coupon_code do lake).
  var comContratoWL = {};
  contratos.forEach(function (c) { comContratoWL[c.influencer_id] = true; });
  var refPorInfluencer = {}, influencerPorRef = {}, nomePorRef = {};
  influencers.forEach(function (i) {
    var ref = normCupom_(i.referral_code);
    if (!ref || !comContratoWL[i.id]) return;
    refPorInfluencer[i.id] = ref;
    influencerPorRef[ref] = i.id;
    nomePorRef[ref] = i.name;
  });

  return {
    categoriaId: catId,
    refPorInfluencer: refPorInfluencer, influencerPorRef: influencerPorRef, nomePorRef: nomePorRef,
    contratos: contratos, termos: termos, ciclos: ciclos, pecas: pecas,
    campanhas: campanhas, campanhaContratos: campanhaContratos
  };
}

// ===== Custos.gs =====
/****************************************************************************************
 * Custos.gs: custo fixo, comissão e campanha de incentivo, em R$ por dia e cupom.
 *
 * Entrada "iris" (montada em Iris.gs a partir do Supabase):
 *   { refPorInfluencer: {influencer_id: CUPOM}, influencerPorRef: {CUPOM: influencer_id},
 *     contratos: [contracts WL], termos: {contract_id: [contract_terms_ranges ordenados]},
 *     ciclos: [content_cycles WL], pecas: [content_pieces WL],
 *     campanhas: [commission_campaigns ativas WL], campanhaContratos: {campaign_id: [contract_id]} }
 *
 * Valores do Supabase vêm em centavos; aqui tudo vira reais com precisão cheia.
 ****************************************************************************************/

/* ---------------- termos vigentes ---------------- */

function termosNaData_(iris, contractId, dataISO) {
  var lista = iris.termos[contractId] || [];
  for (var i = 0; i < lista.length; i++) {
    var t = lista[i];
    if (t.valid_from <= dataISO && (!t.valid_until || t.valid_until > dataISO)) return t;
  }
  return null;
}

function precoFaixa_(bandas, ordinal) {
  if (!bandas || !bandas.length) return 0;
  var melhor = null;
  bandas.forEach(function (b) {
    var de = Number(b.from);
    if (de <= ordinal && (melhor === null || de > Number(melhor.from))) melhor = b;
  });
  return melhor ? Number(melhor.cents) || 0 : 0;
}

/* ---------------- custo fixo ---------------- */

function custoFixo_(iris, acc, iniISO, fimISO) {
  var ciclosPorContrato = {};
  iris.ciclos.forEach(function (cy) {
    (ciclosPorContrato[cy.contract_id] = ciclosPorContrato[cy.contract_id] || {})[String(cy.reference_month).slice(0, 10)] = cy;
  });

  function mensalNoMes(c, m, ciclo) {
    var a = maxIso_(m, c.starts_on);
    var t = termosNaData_(iris, c.id, a) || termosNaData_(iris, c.id, minIso_(fimMes_(m), c.ends_on || fimMes_(m)));
    return t ? Number(t.fixed_monthly_cents)
      : (ciclo && ciclo.contract_monthly_fixed_cents_snapshot != null ? Number(ciclo.contract_monthly_fixed_cents_snapshot)
      : Number(c.monthly_fixed_cents || 0));
  }

  if (CFG.FIXO_MODO === 'CONTRATO') {
    // Metodologia do Control Tower: valor total do contrato dividido igualmente por todos os
    // dias do contrato (início e fim inclusivos). Valor total = soma do fixo mensal de cada mês
    // que o contrato toca (mês iniciado conta inteiro, como o ciclo da Irís).
    // Contrato sem data de fim não tem total: usa fixo mensal / dias do mês calendário
    // (diário constante dentro do mês, sem concentrar o mês nos dias decorridos).
    iris.contratos.forEach(function (c) {
      var cupom = iris.refPorInfluencer[c.influencer_id];
      if (!cupom || !c.starts_on || CFG.CUPONS_IGNORAR.indexOf(cupom) >= 0) return;
      var ciclos = ciclosPorContrato[c.id] || {};
      var statusOk = CFG.FIXO_STATUS_CONTRATO.indexOf(c.status) >= 0;
      var m, d;
      if (c.ends_on) {
        // Fim implícito (fim do mês): mantém a regra antiga de aceitar status fora da lista se houver ciclo.
        if (!statusOk && !(c.fimImplicito && ciclos[inicioMes_(c.starts_on)])) return;
        var total = 0;
        for (m = inicioMes_(c.starts_on); m <= inicioMes_(c.ends_on); m = somaDias_(fimMes_(m), 1)) {
          total += mensalNoMes(c, m, ciclos[m]);
        }
        if (!total) return;
        var diario = total / 100 / diasEntre_(c.starts_on, c.ends_on);
        for (d = maxIso_(c.starts_on, iniISO); d <= minIso_(c.ends_on, fimISO); d = somaDias_(d, 1)) {
          accAdd_(acc, d, cupom, 'fixo', diario);
        }
      } else {
        for (m = inicioMes_(c.starts_on); m <= inicioMes_(fimISO); m = somaDias_(fimMes_(m), 1)) {
          if (!statusOk && !ciclos[m]) continue;
          var cent = mensalNoMes(c, m, ciclos[m]);
          if (!cent) continue;
          var dia = cent / 100 / diasNoMes_(m);
          for (d = maxIso_(maxIso_(m, c.starts_on), iniISO); d <= minIso_(fimMes_(m), fimISO); d = somaDias_(d, 1)) {
            accAdd_(acc, d, cupom, 'fixo', dia);
          }
        }
      }
    });
  }

  if (CFG.FIXO_MODO === 'DIARIZADO') {
    iris.contratos.forEach(function (c) {
      var cupom = iris.refPorInfluencer[c.influencer_id];
      if (!cupom || !c.starts_on || CFG.CUPONS_IGNORAR.indexOf(cupom) >= 0) return;
      var ciclos = ciclosPorContrato[c.id] || {};
      var statusOk = CFG.FIXO_STATUS_CONTRATO.indexOf(c.status) >= 0;
      // Contrato sem fim: o mês corrente vai até o último dia do mês (não até ontem),
      // senão o fixo mensal inteiro cairia nos dias já decorridos.
      var fimContrato = c.ends_on || '9999-12-31';
      for (var m = inicioMes_(c.starts_on); m <= inicioMes_(minIso_(fimContrato, fimISO)); m = somaDias_(fimMes_(m), 1)) {
        var ciclo = ciclos[m];
        if (!statusOk && !ciclo) continue;
        var a = maxIso_(m, c.starts_on), b = minIso_(fimMes_(m), fimContrato);
        if (a > b) continue;
        var t = termosNaData_(iris, c.id, a) || termosNaData_(iris, c.id, b);
        var centavos = t ? Number(t.fixed_monthly_cents)
          : (ciclo && ciclo.contract_monthly_fixed_cents_snapshot != null ? Number(ciclo.contract_monthly_fixed_cents_snapshot)
          : Number(c.monthly_fixed_cents || 0));
        if (!centavos) continue;
        var diario = centavos / 100 / diasEntre_(a, b);
        for (var d = maxIso_(a, iniISO); d <= minIso_(b, fimISO); d = somaDias_(d, 1)) {
          accAdd_(acc, d, cupom, 'fixo', diario);
        }
      }
    });
  }

  // Peças: valor próprio (sempre) e rateio por peça (modo PECA), na data de publicação.
  var cicloPorId = {}, contratoPorId = {};
  iris.ciclos.forEach(function (cy) { cicloPorId[cy.id] = cy; });
  iris.contratos.forEach(function (c) { contratoPorId[c.id] = c; });
  var posicoes = {};
  iris.pecas.forEach(function (p) {
    if (p.status !== 'postergada' && p.unit_value_cents == null) posicoes[p.cycle_id] = (posicoes[p.cycle_id] || 0) + 1;
  });
  iris.pecas.forEach(function (p) {
    if (p.status !== 'entregue' || p.is_cancelled) return;
    var cy = cicloPorId[p.cycle_id]; if (!cy) return;
    var c = contratoPorId[cy.contract_id]; if (!c) return;
    var cupom = iris.refPorInfluencer[c.influencer_id]; if (!cupom) return;
    var dia = tsParaDiaISO_(p.published_at || p.delivered_at);
    if (!dia || dia < iniISO || dia > fimISO) return;
    if (p.unit_value_cents != null) {
      accAdd_(acc, dia, cupom, 'fixo', Number(p.unit_value_cents) / 100);
    } else if (CFG.FIXO_MODO === 'PECA') {
      var mes = String(cy.reference_month).slice(0, 10);
      var t = termosNaData_(iris, c.id, mes) || termosNaData_(iris, c.id, maxIso_(mes, c.starts_on));
      var centavos = t ? Number(t.fixed_monthly_cents) : Number(cy.contract_monthly_fixed_cents_snapshot || c.monthly_fixed_cents || 0);
      if (centavos && posicoes[p.cycle_id]) accAdd_(acc, dia, cupom, 'fixo', centavos / 100 / posicoes[p.cycle_id]);
    }
  });
}

/* ---------------- comissão e campanhas ---------------- */

/**
 * Replica a parte de vendas do calcular_pagamento da Irís, usando as vendas da Nekt:
 *  - venda elegível: pedido com o cupom da influenciadora e pagamento concluído
 *  - contrato da venda: o de starts_on mais recente cuja janela contém a data do checkout
 *  - ordinal por contrato e mês (tier_counter_scope 'month') ou por contrato ('contract')
 *  - preço da unidade: faixa de sale_bands com maior "from" <= ordinal
 * Campanhas ativas ligadas ao contrato (custo de campanha):
 *  - bonus_por_venda: per_sale_cents por venda no período
 *  - bonus_meta: bonus_cents no dia em que as vendas do período batem goal_sales
 *  - troca_faixa: depois da meta, a diferença entre a faixa da campanha e a faixa padrão
 *    (a comissão fica com o preço padrão, a diferença vai para campanha)
 */
function comissaoECampanha_(iris, vendas, acc, iniISO, fimISO) {
  var sim = CFG.COMISSAO_SIMULACAO || null;
  // Data usada para achar os termos (faixas) da venda; na simulação, antecipa os termos de sim.termosDe.
  function dataTermos(d) { return (sim && d >= sim.inicio && d < sim.termosDe) ? sim.termosDe : d; }
  var primeiraPublicacao = {}, cicloContrato = {};
  iris.ciclos.forEach(function (cy) { cicloContrato[cy.id] = cy.contract_id; });
  iris.pecas.forEach(function (p) {
    var cid = cicloContrato[p.cycle_id];
    var d = tsParaDiaISO_(p.published_at);
    if (cid && d && (!primeiraPublicacao[cid] || d < primeiraPublicacao[cid])) primeiraPublicacao[cid] = d;
  });

  var contratosPorInfluencer = {};
  iris.contratos.forEach(function (c) {
    var ini = (c.previous_contract_id || CFG.COMISSAO_JANELA === 'CONTRATO') ? c.starts_on : primeiraPublicacao[c.id];
    if (!ini) return;
    if (sim) ini = maxIso_(ini, sim.inicio);
    (contratosPorInfluencer[c.influencer_id] = contratosPorInfluencer[c.influencer_id] || []).push({
      c: c, ini: ini, fim: c.commission_extended_until || c.ends_on || null
    });
  });

  var campanhasPorContrato = {};
  iris.campanhas.forEach(function (k) {
    (iris.campanhaContratos[k.id] || []).forEach(function (cid) {
      (campanhasPorContrato[cid] = campanhasPorContrato[cid] || []).push(k);
    });
  });

  var ordinal = {}, ordCampanha = {}, metaPaga = {};
  var ordenadas = vendas.filter(function (v) { return v.pago; }).slice().sort(function (a, b) {
    return a.checkout_utc < b.checkout_utc ? -1 : a.checkout_utc > b.checkout_utc ? 1 : String(a.order_number) < String(b.order_number) ? -1 : 1;
  });

  ordenadas.forEach(function (v) {
    var infl = iris.influencerPorRef[v.cupom];
    if (!infl) return;
    var cand = (contratosPorInfluencer[infl] || []).filter(function (j) {
      return v.data >= j.ini && (!j.fim || v.data <= j.fim);
    });
    if (!cand.length) return;
    cand.sort(function (a, b) { return a.c.starts_on < b.c.starts_on ? 1 : -1; });
    var c = cand[0].c;

    var dt = dataTermos(v.data);
    var tMes = termosNaData_(iris, c.id, maxIso_(inicioMes_(v.data), dt)) || termosNaData_(iris, c.id, dt);
    var escopo = (tMes && tMes.tier_counter_scope) || 'month';
    var part = escopo === 'contract' ? c.id : c.id + ':' + inicioMes_(v.data);
    var ord = ordinal[part] = (ordinal[part] || 0) + 1;

    var t = termosNaData_(iris, c.id, dt);
    var padrao = precoFaixa_(t && t.sale_bands, ord);
    var grava = v.data >= iniISO && v.data <= fimISO;
    if (grava) accAdd_(acc, v.data, v.cupom, 'comissao', padrao / 100);

    (campanhasPorContrato[c.id] || []).forEach(function (k) {
      if (v.data < String(k.starts_on).slice(0, 10) || v.data > String(k.ends_on).slice(0, 10)) return;
      var kk = k.id + ':' + c.id;
      var n = ordCampanha[kk] = (ordCampanha[kk] || 0) + 1;
      var extra = 0;
      if (k.kind === 'bonus_por_venda') {
        extra = Number(k.per_sale_cents || 0);
      } else if (k.kind === 'bonus_meta') {
        if (!metaPaga[kk] && k.goal_sales != null && n >= Number(k.goal_sales)) { metaPaga[kk] = true; extra = Number(k.bonus_cents || 0); }
      } else if (k.kind === 'troca_faixa') {
        if (k.goal_sales != null && n > Number(k.goal_sales)) extra = precoFaixa_(k.switch_bands, n) - padrao;
      }
      if (grava && extra) accAdd_(acc, v.data, v.cupom, 'campanha', extra / 100);
    });
  });
}

// ===== Medicacao.gs =====
/****************************************************************************************
 * Medicacao.gs: custo de medicação por creator (cruzamento por CPF)
 *
 * pedidos:     [{data, cpf, gross}] do lake (sqlMedicacaoLake_), um por pedido gratuito
 * cpfParaCupom {cpf: CUPOM} da base de creators (sqlCreatorsCpf_)
 * O custo (gross revenue) vai para o cupom do creator dono do CPF, na data de conclusão do
 * pagamento. Sem correspondência, vai para CFG.CUPOM_MEDICACAO_SEM_CREATOR.
 ****************************************************************************************/

function custoMedicacao_(pedidos, cpfParaCupom, acc, iniISO, fimISO) {
  var resumo = { pedidos: 0, casados: 0, valor: 0, valorCasado: 0 };
  pedidos.forEach(function (p) {
    if (!p.data || p.data < iniISO || p.data > fimISO) return;
    var v = Number(p.gross) || 0;
    var cupom = cpfParaCupom[p.cpf];
    if (cupom) cupom = CFG.CUPOM_ALIAS[cupom] || cupom;
    accAdd_(acc, p.data, cupom || CFG.CUPOM_MEDICACAO_SEM_CREATOR, 'medicacao', v);
    resumo.pedidos++; resumo.valor += v;
    if (cupom) { resumo.casados++; resumo.valorCasado += v; }
  });
  return resumo;
}

/** Mapa CPF (11 dígitos) -> cupom, a partir das linhas de sqlCreatorsCpf_. */
function mapaCpfCreators_(linhas) {
  var m = {};
  linhas.forEach(function (r) {
    var cpf = String(r.cpf || '').replace(/\D/g, '');
    if (cpf.length === 11 && !/^0+$/.test(cpf)) m[cpf] = normCupom_(r.cupom);
  });
  return m;
}

// ===== Conteudos.gs =====
/****************************************************************************************
 * Conteudos.gs: base de conteúdos postados (Irís, content_pieces), aba ABA_CONTEUDOS
 *
 * Uma linha por Data | Cupom | Plataforma | Formato com a Quantidade de peças.
 * Conta peças com status em CFG.CONTEUDO_STATUS ('entregue') e não canceladas, na data de
 * publicação (published_at; sem ela, delivered_at), em Brasília. Formato fora de
 * CFG.FORMATOS (ou vazio) vai para Outras / Não informado.
 ****************************************************************************************/

function linhasConteudos_(iris, iniISO, fimISO) {
  var cicloContrato = {}, contratoPorId = {}, acc = {};
  iris.ciclos.forEach(function (cy) { cicloContrato[cy.id] = cy.contract_id; });
  iris.contratos.forEach(function (c) { contratoPorId[c.id] = c; });

  iris.pecas.forEach(function (p) {
    if (CFG.CONTEUDO_STATUS.indexOf(p.status) < 0 || p.is_cancelled) return;
    var c = contratoPorId[cicloContrato[p.cycle_id]];
    if (!c) return;
    var cupom = iris.refPorInfluencer[c.influencer_id];
    if (!cupom || CFG.CUPONS_IGNORAR.indexOf(cupom) >= 0) return;
    var dia = tsParaDiaISO_(p.published_at || p.delivered_at);
    if (!dia || dia < iniISO || dia > fimISO) return;
    var f = CFG.FORMATOS[String(p.format || '').toLowerCase()] || CFG.FORMATO_SEM_TIPO;
    var k = [dia, cupom, f.plataforma, f.formato].join('|');
    acc[k] = (acc[k] || 0) + 1;
  });

  return Object.keys(acc).sort().map(function (k) {
    return k.split('|').concat([acc[k]]);
  });
}

// ===== Mixpanel.gs =====
/****************************************************************************************
 * Mixpanel.gs: Query API do Mixpanel (residência EU) com service account.
 *
 * Propriedades do script:
 *   MIXPANEL_SA_USER     username da service account
 *   MIXPANEL_SA_SECRET   secret da service account
 *   MIXPANEL_PROJECT_ID  (opcional) padrão CFG.MIXPANEL.PROJECT_ID
 * Limite do Mixpanel: 60 consultas/hora e 5 simultâneas por projeto.
 ****************************************************************************************/

function mpGet_(caminho, params) {
  var M = CFG.MIXPANEL;
  var user = prop_('MIXPANEL_SA_USER'), secret = prop_('MIXPANEL_SA_SECRET');
  var p = Object.assign({ project_id: prop_('MIXPANEL_PROJECT_ID', false) || M.PROJECT_ID }, params || {});
  if (M.WORKSPACE_ID && p.workspace_id == null) p.workspace_id = M.WORKSPACE_ID;
  var qs = Object.keys(p).filter(function (k) { return p[k] != null; }).map(function (k) {
    var v = typeof p[k] === 'object' ? JSON.stringify(p[k]) : String(p[k]);
    return encodeURIComponent(k) + '=' + encodeURIComponent(v);
  }).join('&');
  var url = M.API_BASE + caminho + '?' + qs;
  for (var tentativa = 0; tentativa < 3; tentativa++) {
    var resp = UrlFetchApp.fetch(url, {
      method: 'get', muteHttpExceptions: true,
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(user + ':' + secret), Accept: 'application/json' }
    });
    var code = resp.getResponseCode();
    if (code === 429) { Utilities.sleep(20000 * (tentativa + 1)); continue; }
    if (code === 401 || code === 403) throw new Error('Mixpanel recusou a service account (HTTP ' + code + '): ' + resp.getContentText().slice(0, 300));
    if (code >= 400) throw new Error('Mixpanel ' + caminho + ' HTTP ' + code + ': ' + resp.getContentText().slice(0, 500));
    return JSON.parse(resp.getContentText());
  }
  throw new Error('Mixpanel: limite de consultas (HTTP 429) estourado em ' + caminho);
}

var MP_CACHE_ = null;

/** Lê o report do board (Insights API) uma vez por execução. */
function mpReportFunil_() {
  if (!MP_CACHE_) MP_CACHE_ = mpGet_('/insights', { bookmark_id: CFG.MIXPANEL.FUNIL_REPORT_ID });
  return MP_CACHE_;
}

/**
 * Funil do board "Voy Saude BR Full funnel" por dia e cupom (Last touch UTM campaign name).
 * Dias no fuso do projeto do Mixpanel (o mesmo que o board mostra).
 * '$other' (cupons além do limite de 200 segmentos do report) vai para CFG.MIXPANEL.CUPOM_OUTROS.
 */
function funilMixpanel_(iniISO, fimISO) {
  var r = mpReportFunil_(), M = CFG.MIXPANEL;
  var campo = {};
  Object.keys(r.series).forEach(function (met) {
    var k = met.toLowerCase();
    var c = k.indexOf('session') >= 0 ? 'sessoes' : k.indexOf('quest') >= 0 ? 'quest'
      : k.indexOf('checkout') >= 0 ? 'checkout' : k.indexOf('recommend') >= 0 ? 'recs' : null;
    if (c) campo[met] = c;
  });
  ['sessoes', 'quest', 'recs', 'checkout'].forEach(function (c) {
    if (!Object.keys(campo).some(function (m) { return campo[m] === c; }))
      throw new Error('Report do Mixpanel sem a métrica ' + c + '. Métricas: ' + Object.keys(r.series).join(', '));
  });
  var linhas = {};
  Object.keys(campo).forEach(function (met) {
    var seg = r.series[met];
    Object.keys(seg).forEach(function (s) {
      if (s === '$overall' || typeof seg[s] !== 'object') return;
      var cupom = s === '$other' ? M.CUPOM_OUTROS
        : (s === 'undefined' || s === '' || s === 'null') ? '(SEM UTM_CAMPAIGN)' : normCupom_(s);
      Object.keys(seg[s]).forEach(function (ts) {
        var d = ts.slice(0, 10), v = Number(seg[s][ts]) || 0;
        if (d < iniISO || d > fimISO || !v) return;
        var k = d + '|' + cupom;
        var o = linhas[k] = linhas[k] || { data: d, cupom: cupom, sessoes: 0, quest: 0, recs: 0, checkout: 0 };
        o[campo[met]] += v;
      });
    });
  });
  return Object.keys(linhas).map(function (k) { return linhas[k]; });
}

/** Período coberto pelo report salvo no board ({ini, fim} em ISO). Só esses dias são regravados no cache. */
function mpJanelaReport_() {
  var dr = mpReportFunil_().date_range || {};
  return { ini: String(dr.from_date || '').slice(0, 10) || null, fim: String(dr.to_date || '').slice(0, 10) || null };
}

/** Total de sessões do dia no report (todas as campanhas). */
function mpSessoesDia_(dataISO) {
  var r = mpReportFunil_();
  var met = Object.keys(r.series).filter(function (m) { return m.toLowerCase().indexOf('session') >= 0; })[0];
  var o = (met && r.series[met].$overall) || {};
  var tot = 0;
  Object.keys(o).forEach(function (ts) { if (ts.slice(0, 10) === dataISO) tot += Number(o[ts]) || 0; });
  return tot;
}

/** Diagnóstico: totais do funil do Mixpanel nos últimos 7 dias e peso do '$other'. */
function debugMixpanel() {
  var fim = ontemISO_(), ini = somaDias_(fim, -6);
  var linhas = funilMixpanel_(ini, fim), tot = 0, outros = 0, cupons = {};
  linhas.forEach(function (l) { tot += l.sessoes; cupons[l.cupom] = 1; if (l.cupom === CFG.MIXPANEL.CUPOM_OUTROS) outros += l.sessoes; });
  var jan = mpJanelaReport_();
  var msg = 'Report ' + CFG.MIXPANEL.FUNIL_REPORT_ID + ' cobre ' + jan.ini + ' a ' + jan.fim + '. Mixpanel ' + ini + ' a ' + fim + ': ' + tot + ' sessões em ' + Object.keys(cupons).length + ' cupons; ' +
    CFG.MIXPANEL.CUPOM_OUTROS + ' = ' + outros + ' (' + (tot ? (100 * outros / tot).toFixed(1) : 0) + '%).';
  logar_('DEBUG', 'ok', linhas.length, msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

// ===== Base.gs =====
/****************************************************************************************
 * Base.gs: monta a aba BASE_INFLUENCERS_WL (formato longo: Data x Cupom x Métrica) e cuida do cache do funil.
 *
 * ENTRYPOINTS (menu "Base Influencers" ou botão Executar):
 *   executarDiario()             funil incremental (D-1..D-3) + reconstrução da base. Gatilho diário.
 *   atualizarBase()              reconstrói a base inteira (custos e vendas são baratos; o funil vem do cache)
 *   atualizarFunilIncremental()  só o funil, janela CFG.FUNIL.JANELA_DIAS
 *   backfillFunil()              recarrega o funil de DATA_INICIO até D-1 em blocos, continuando por gatilho
 *   instalarGatilhoDiario()      cria o gatilho diário (≈ 7h40)
 *
 * Granularidade: 1 linha por dia e cupom com qualquer valor diferente de zero.
 * Custos: fixo, comissão e campanha de incentivo (Irís). Vendas: lake via Nekt.
 * Funil: Mixpanel via Nekt (cache). Conteúdos ficam na aba à parte ABA_CONTEUDOS.
 ****************************************************************************************/

function executarDiario() {
  comLock_(function () {
    try { atualizarFunilIncremental_(); } catch (e) { logar_('FUNIL', 'erro', 0, e); avisar_('Funil', e); }
    try { atualizarBase_(); } catch (e) { logar_('BASE', 'erro', 0, e); avisar_('Base', e); throw e; }
  });
}

function atualizarBase() {
  comLock_(function () {
    try { atualizarFunilIncremental_(); } catch (e) { logar_('FUNIL', 'erro', 0, e); }
    try { atualizarBase_(); } catch (e) { logar_('BASE', 'erro', 0, e); throw e; }
  });
}
function atualizarFunilIncremental() { comLock_(atualizarFunilIncremental_); }

/* =========================================================================
 * Base
 * ========================================================================= */

function atualizarBase_() {
  var t0 = Date.now();
  var ini = CFG.DATA_INICIO, fim = ontemISO_();
  var acc = novoAcc_();

  var iris = carregarIris_();

  var vendas = nektSql_(sqlVendasInfluencer_(minIso_(CFG.VENDAS_DESDE, ini))).map(function (r) {
    var cupom = normCupom_(r.cupom);
    cupom = CFG.CUPOM_ALIAS[cupom] || cupom;
    return {
      order_id: r.order_id, order_number: r.order_number, cupom: cupom, data: r.data,
      data_pag: r.data_pag || null, checkout_utc: r.checkout_utc,
      confirmado: String(r.is_confirmed) === 'true', pago: !!r.data_pag
    };
  });
  vendas.forEach(function (v) {
    // Orders: todos os pedidos, na data do checkout
    if (v.data >= ini && v.data <= fim) accAdd_(acc, v.data, v.cupom, 'orders', 1);
    // Acquisitions: pedidos confirmados, na data de conclusão do pagamento
    if (v.confirmado && v.data_pag && v.data_pag >= ini && v.data_pag <= fim) accAdd_(acc, v.data_pag, v.cupom, 'acq', 1);
    // Payment Completed: pedidos do dia (data do checkout) que tiveram o pagamento concluído
    if (v.pago && v.data >= ini && v.data <= fim) accAdd_(acc, v.data, v.cupom, 'pagos', 1);
  });

  custoFixo_(iris, acc, ini, fim);
  comissaoECampanha_(iris, vendas, acc, ini, fim);

  var med = custoMedicacao_(bqSql_(sqlMedicacaoLake_(ini)), mapaCpfCreators_(nektSql_(sqlCreatorsCpf_())), acc, ini, fim);

  lerCacheFunil_().forEach(function (r) {
    if (r.data < ini || r.data > fim) return;
    accAdd_(acc, r.data, r.cupom, 'sessoes', r.sessoes);
    accAdd_(acc, r.data, r.cupom, 'quest', r.quest);
    accAdd_(acc, r.data, r.cupom, 'recs', r.recs);
    accAdd_(acc, r.data, r.cupom, 'checkout', r.checkout);
  });

  var linhas = linhasDaBase_(acc);
  escreverBase_(linhas);
  var conteudos = CFG.ABA_CONTEUDOS ? linhasConteudos_(iris, ini, fim) : [];
  if (CFG.ABA_CONTEUDOS) escreverConteudos_(conteudos);
  logar_('BASE', 'ok', linhas.length, 'Base ' + (CFG.BASE_DESDE || ini) + ' a ' + fim + ' (' + conteudos.length + ' linhas de conteúdo; medicação: ' +
    med.casados + '/' + med.pedidos + ' pedidos casados por CPF) em ' + Math.round((Date.now() - t0) / 1000) + 's');
  return linhas.length;
}

/**
 * Formato longo a partir de BASE_DESDE, só valores != 0:
 *   com CHANNEL_GROUP: Data | Channel Group | Channel | Subchannel (cupom) | Metrica | Valor
 *   sem CHANNEL_GROUP: Data | Cupom | Metrica | Valor   (aba auxiliar lida por fórmula)
 * Com CFG.MAPEAMENTO, o cupom passa pelo de-para da aba de mapeamento antes de agregar.
 */
function linhasDaBase_(acc) {
  var desde = CFG.BASE_DESDE || CFG.DATA_INICIO;
  var nomes = Object.keys(CFG.METRICAS);
  var mapear = mapeadorCupom_();
  var agg = {};
  Object.keys(acc).forEach(function (k) {
    var r = acc[k];
    if (r.data < desde) return;
    var cupom = mapear(r.cupom);
    nomes.forEach(function (m) {
      var v = 0;
      CFG.METRICAS[m].forEach(function (c) { v += r[c] || 0; });
      if (!v) return;
      var kk = r.data + '|' + cupom + '|' + m;
      agg[kk] = agg[kk] || { data: r.data, cupom: cupom, m: m, v: 0 };
      agg[kk].v += v;
    });
  });
  var out = Object.keys(agg).map(function (k) { return agg[k]; })
    .filter(function (o) { return Math.abs(o.v) > 1e-9; })
    .sort(function (a, b) {
      return a.data !== b.data ? (a.data < b.data ? -1 : 1) : a.cupom !== b.cupom ? (a.cupom < b.cupom ? -1 : 1)
        : (a.m.toLowerCase() < b.m.toLowerCase() ? -1 : 1);
    });
  return out.map(function (o) {
    return CFG.CHANNEL_GROUP ? [o.data, CFG.CHANNEL_GROUP, CFG.CHANNEL, o.cupom, o.m, o.v] : [o.data, o.cupom, o.m, o.v];
  });
}

/**
 * De-para de cupom (opcional). CFG.MAPEAMENTO = { aba, pares: [[colOrigem, colDestino], ...] } em
 * números de coluna (1 = A). A primeira tabela que tiver o cupom (comparação em maiúsculas) vence.
 */
function mapeadorCupom_() {
  var M = CFG.MAPEAMENTO;
  if (!M) return function (c) { return c; };
  var sh = SpreadsheetApp.getActive().getSheetByName(M.aba);
  if (!sh || sh.getLastRow() < 2) return function (c) { return c; };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues();
  var tabelas = M.pares.map(function (p) {
    var t = {};
    vals.forEach(function (r) {
      var o = String(r[p[0] - 1] || '').trim().toUpperCase(), d = String(r[p[1] - 1] || '').trim().toUpperCase();
      if (o && d && !t[o]) t[o] = d;
    });
    return t;
  });
  return function (c) {
    var k = String(c || '').toUpperCase();
    for (var i = 0; i < tabelas.length; i++) if (tabelas[i][k]) return tabelas[i][k];
    return c;
  };
}

function escreverBase_(linhas) {
  escreverAba_(CFG.ABA_BASE, CFG.COLUNAS, linhas, null, CFG.FORMATO_DATA_BASE);
}

function escreverConteudos_(linhas) {
  escreverAba_(CFG.ABA_CONTEUDOS, CFG.COLUNAS_CONTEUDOS, linhas, function (sh, n) {
    sh.getRange(2, 5, n, 1).setNumberFormat('#,##0');
  });
}

var ESCRITA_LOTE = 2000;   // linhas por setValues

/** Data ISO (yyyy-mm-dd) -> número de série do Sheets (dias desde 30/12/1899), sem objeto Date. */
function serialSheets_(iso) {
  var p = String(iso).slice(0, 10).split('-');
  var ms = Date.UTC(+p[0], +p[1] - 1, +p[2]);
  if (isNaN(ms)) throw new Error('Data inválida na base: "' + iso + '"');
  return (ms - Date.UTC(1899, 11, 30)) / 86400000;
}

/**
 * Substitui o conteúdo de uma aba (cabeçalho fixo + linhas com data ISO na 1ª coluna).
 * A data vai como número de série com formato dd/MM/yyyy (não como objeto Date), a área de
 * dados é limpa com valores e formatos, a escrita é em lotes e, no fim, confere se nenhuma
 * linha ficou sem data.
 */
function escreverAba_(nome, cols, linhas, formatar, formatoData) {
  var sh = aba_(nome, cols);
  var n = cols.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  var largura = Math.max(n, sh.getLastColumn());
  if (sh.getMaxRows() > 1) sh.getRange(2, 1, sh.getMaxRows() - 1, largura).clear();   // valores e formatos
  if (sh.getLastColumn() > n) sh.getRange(1, n + 1, 1, sh.getLastColumn() - n).clearContent();
  if (linhas.length) {
    var valores = linhas.map(function (l) {
      var out = l.slice();
      out[0] = serialSheets_(l[0]);
      return out;
    });
    if (sh.getMaxRows() < valores.length + 1) sh.insertRowsAfter(sh.getMaxRows(), valores.length + 1 - sh.getMaxRows());
    for (var i = 0; i < valores.length; i += ESCRITA_LOTE) {
      var lote = valores.slice(i, i + ESCRITA_LOTE);
      sh.getRange(2 + i, 1, lote.length, n).setValues(lote);
      SpreadsheetApp.flush();
    }
    sh.getRange(2, 1, valores.length, 1).setNumberFormat(formatoData || 'dd/MM/yyyy');
    if (formatar) formatar(sh, valores.length);
    SpreadsheetApp.flush();

    var semData = sh.getRange(2, 1, valores.length, 1).getValues()
      .filter(function (r) { return r[0] === '' || r[0] === null; }).length;
    if (semData) throw new Error(nome + ': ' + semData + ' de ' + valores.length + ' linhas ficaram sem data após a escrita.');
  }
  sh.setFrozenRows(1);
}

/* =========================================================================
 * Funil (cache em _cache_funil, porque cada dia de Mixpanel lê ~30 GB)
 * ========================================================================= */

/**
 * Funil incremental: recarrega D-1..D-(JANELA_DIAS) e também qualquer buraco desde o último dia
 * em cache (ex.: dias sem execução). Avisa no _log se o Mixpanel da Nekt não tem dados de D-1.
 */
function atualizarFunilIncremental_() {
  var fim = ontemISO_();
  if (CFG.FUNIL.FONTE === 'MIXPANEL') {
    // Regrava só os dias que o report do board cobre (ex.: últimos 30 dias). Dias mais antigos
    // ficam como estão no cache, então o histórico não se perde quando sai da janela do report.
    var jan = mpJanelaReport_();
    var ini0 = maxIso_(CFG.DATA_INICIO, jan.ini || CFG.DATA_INICIO);
    var n0 = carregarFunil_(ini0, fim);
    checarFrescorMixpanel_(fim);
    return n0;
  }
  var janela = maxIso_(somaDias_(fim, -(CFG.FUNIL.JANELA_DIAS - 1)), CFG.DATA_INICIO);
  var noCache = {};
  lerCacheFunil_().forEach(function (r) { noCache[r.data] = true; });
  // Dias a carregar: a janela D-1..D-N sempre, e qualquer dia sem linha no cache nos últimos 30 dias.
  var dias = [];
  for (var d = maxIso_(somaDias_(fim, -29), CFG.DATA_INICIO); d <= fim; d = somaDias_(d, 1)) {
    if (d >= janela || !noCache[d]) dias.push(d);
  }
  // Agrupa em blocos contíguos de até BACKFILL_DIAS_POR_QUERY dias.
  var n = 0, i = 0, passo = CFG.FUNIL.BACKFILL_DIAS_POR_QUERY;
  while (i < dias.length) {
    var a = dias[i], b = a, k = 1;
    while (i + k < dias.length && k < passo && dias[i + k] === somaDias_(b, 1)) { b = dias[i + k]; k++; }
    n += carregarFunil_(a, b);
    i += k;
  }
  checarFrescorMixpanel_(fim);
  return n;
}

/** Último dia com eventos do Mixpanel na Nekt; loga aviso se for anterior a fimISO. */
function checarFrescorMixpanel_(fimISO) {
  if (CFG.FUNIL.FONTE === 'MIXPANEL') {
    if (!mpSessoesDia_(fimISO)) logar_('FUNIL', 'aviso', 0, 'Report do Mixpanel sem sessões em ' + fimISO + '. Confira o board.');
    return;
  }
  var t = '`' + CFG.FUNIL.TABELA.replace('.', '`.`') + '`';
  var r = nektSql_("SELECT FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', MAX(event_time), 'America/Sao_Paulo') AS ultimo FROM " + t +
    " WHERE event_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) AND event = " + sqlList_([CFG.FUNIL.EV_PAGINA]));
  var ultimo = r.length ? r[0].ultimo : null;
  if (!ultimo || ultimo.slice(0, 10) < fimISO || ultimo.slice(11) < '23:00' && ultimo.slice(0, 10) === fimISO) {
    logar_('FUNIL', 'aviso', 0, 'Mixpanel na Nekt (fonte mixpanel-gSWB) só tem eventos até ' + (ultimo || 'sem dados nos últimos 7 dias') +
      '. O funil dos dias seguintes fica incompleto até a fonte voltar a carregar.');
  }
}

/** Roda o funil de iniISO a fimISO e substitui essas datas no cache. */
function carregarFunil_(iniISO, fimISO) {
  var t0 = Date.now();
  var brutos = CFG.FUNIL.FONTE === 'MIXPANEL' ? funilMixpanel_(iniISO, fimISO) : nektSql_(sqlFunil_(iniISO, fimISO));
  var novos = brutos.map(function (r) {
    return { data: r.data, cupom: normCupom_(r.cupom), sessoes: +r.sessoes || 0, quest: +r.quest || 0, recs: +r.recs || 0, checkout: +r.checkout || 0 };
  });
  var mantidos = lerCacheFunil_().filter(function (r) { return r.data < iniISO || r.data > fimISO; });
  var todos = mantidos.concat(novos).sort(function (a, b) {
    return a.data === b.data ? (a.cupom < b.cupom ? -1 : 1) : (a.data < b.data ? -1 : 1);
  });
  var sh = aba_(CFG.ABA_FUNIL, ['Data', 'Cupom', 'Sessões', 'Quest started', 'Recommendations', 'Checkout started', 'Atualizado em']);
  if (sh.getMaxRows() > 1) sh.getRange(2, 1, sh.getMaxRows() - 1, 7).clearContent();
  var agora = new Date();
  if (todos.length) {
    sh.getRange(2, 1, todos.length, 2).setNumberFormat('@');   // data ISO e cupom como texto
    sh.getRange(2, 7, todos.length, 1).setNumberFormat('@');
    sh.getRange(2, 3, todos.length, 4).setNumberFormat('0');
    sh.getRange(2, 1, todos.length, 7).setValues(todos.map(function (r) {
      return [r.data, r.cupom, r.sessoes, r.quest, r.recs, r.checkout, r.atualizado || Utilities.formatDate(agora, CFG.TZ, 'dd/MM/yyyy HH:mm')];
    }));
  }
  logar_('FUNIL', 'ok', novos.length, 'Funil ' + iniISO + ' a ' + fimISO + ' em ' + Math.round((Date.now() - t0) / 1000) + 's');
  return novos.length;
}

function lerCacheFunil_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.ABA_FUNIL);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getDisplayValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return { data: r[0], cupom: r[1], sessoes: +r[2] || 0, quest: +r[3] || 0, recs: +r[4] || 0, checkout: +r[5] || 0, atualizado: r[6] };
    });
}

/**
 * Backfill do funil em blocos de BACKFILL_DIAS_POR_QUERY dias, do fim para o início.
 * Para antes do limite de 6 min e agenda a continuação em 1 min. Cursor na propriedade FUNIL_CURSOR.
 */
function backfillFunil() {
  var props = PropertiesService.getScriptProperties();
  var cursor = props.getProperty('FUNIL_CURSOR') || ontemISO_();
  var t0 = Date.now();
  apagarGatilhos_('backfillFunil');
  comLock_(function () {
    while (cursor >= CFG.DATA_INICIO && Date.now() - t0 < 4 * 60 * 1000) {
      var ini = maxIso_(somaDias_(cursor, -(CFG.FUNIL.BACKFILL_DIAS_POR_QUERY - 1)), CFG.DATA_INICIO);
      carregarFunil_(ini, cursor);
      cursor = somaDias_(ini, -1);
      props.setProperty('FUNIL_CURSOR', cursor);
    }
  });
  if (cursor >= CFG.DATA_INICIO) {
    ScriptApp.newTrigger('backfillFunil').timeBased().after(60 * 1000).create();
    logar_('FUNIL_BACKFILL', 'parcial', 0, 'Continua a partir de ' + cursor);
  } else {
    props.deleteProperty('FUNIL_CURSOR');
    logar_('FUNIL_BACKFILL', 'ok', 0, 'Backfill concluído. Rode atualizarBase().');
  }
}

/* =========================================================================
 * Infra
 * ========================================================================= */

function aba_(nome, cabecalho) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
  if (cabecalho) {
    var atual = sh.getRange(1, 1, 1, cabecalho.length).getDisplayValues()[0];
    if (atual.join('|') !== cabecalho.join('|')) {
      sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]).setFontWeight('bold');
    }
  }
  return sh;
}

function comLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Outra execução em andamento.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function logar_(etapa, status, linhas, msg) {
  try {
    var sh = aba_(CFG.ABA_LOG, ['Quando', 'Etapa', 'Status', 'Linhas', 'Mensagem']);
    sh.insertRowAfter(1);
    sh.getRange(2, 1, 1, 5).setValues([[new Date(), etapa, status, linhas, String(msg && msg.message ? msg.message : msg).slice(0, 500)]]);
    if (sh.getLastRow() > 501) sh.deleteRows(502, sh.getLastRow() - 501);
  } catch (e) { console.error(e); }
}

function avisar_(etapa, e) {
  var para = prop_('ALERT_EMAIL', false) || Session.getEffectiveUser().getEmail();
  if (!para) return;
  MailApp.sendEmail(para, '[Base Influencers WL] erro em ' + etapa,
    String(e && e.stack ? e.stack : e) + '\n\nPlanilha: ' + SpreadsheetApp.getActive().getUrl());
}

function apagarGatilhos_(funcao) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === funcao) ScriptApp.deleteTrigger(t);
  });
}

function instalarGatilhoDiario() {
  apagarGatilhos_('executarDiario');
  ScriptApp.newTrigger('executarDiario').timeBased().everyDays(1).atHour(7).nearMinute(40).inTimezone(CFG.TZ).create();
  logar_('GATILHO', 'ok', 0, 'executarDiario diário às ~7h40');
}

// ===== Menu.gs =====
/****************************************************************************************
 * Menu.gs: menu na planilha e diagnósticos rápidos
 ****************************************************************************************/

function onOpen() {
  var menu = SpreadsheetApp.getUi().createMenu('Base Influencers')
    .addItem('Atualizar tudo (funil + base)', 'executarDiario')
    .addItem('Reconstruir só a base', 'atualizarBase')
    .addItem('Atualizar só o funil', 'atualizarFunilIncremental')
    .addSeparator()
    .addItem('Backfill do funil desde DATA_INICIO', 'backfillFunil')
    .addItem('Instalar gatilho diário', 'instalarGatilhoDiario')
    .addSeparator()
    .addItem('Testar conexões', 'debugConexoes')
    .addItem('Diagnóstico da Irís (comissão/campanha)', 'debugIris')
    .addItem('Diagnóstico da medicação (CPF)', 'debugMedicacao')
    .addItem('Diagnóstico do Mixpanel (funil)', 'debugMixpanel');
  if (typeof configurarPace === 'function') {
    menu.addSeparator()
      .addItem('PACING: aplicar fórmula com corte (Config!B14)', 'configurarPace')
      .addItem('PACING: voltar fórmula anterior', 'desfazerPace');
  }
  menu.addToUi();
}

/** Confere Supabase e Nekt com consultas pequenas. */
function debugConexoes() {
  var cat = sbSelect_('categories', 'slug');
  var contratos = sbSelect_('contracts', 'id');
  var n = nektSql_("SELECT COUNT(*) AS n FROM `manual_default`.`webhook_v2_order_discounts_lake` WHERE promotion_code IN (" + sqlList_(CFG.PROMO_INFLUENCER) + ")");
  var sbOk = cat.length > 0 && contratos.length > 0;
  var msg = (sbOk ? 'Supabase OK' : 'Supabase SEM DADOS: a chave em SUPABASE_SERVICE_KEY não lê as tabelas (RLS). Use a service_role / sb_secret_, não a anon / sb_publishable_') +
    ' (' + cat.length + ' categorias, ' + contratos.length + ' contratos). Nekt OK (' + n[0].n + ' linhas de desconto de influenciador).';
  logar_('DEBUG', sbOk ? 'ok' : 'erro', 0, msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

/** Mostra o que da Irís está pronto para a comissão: termos com faixas e campanhas ativas. */
function debugIris() {
  var iris = carregarIris_();
  var comFaixa = 0, totalTermos = 0;
  Object.keys(iris.termos).forEach(function (k) {
    iris.termos[k].forEach(function (t) { totalTermos++; if (t.sale_bands && t.sale_bands.length) comFaixa++; });
  });
  var publicados = iris.pecas.filter(function (p) { return p.published_at; }).length;
  var msg = 'Contratos WL: ' + iris.contratos.length + ' | cupons mapeados: ' + Object.keys(iris.influencerPorRef).length +
    ' | termos ativos: ' + totalTermos + ' (com sale_bands: ' + comFaixa + ')' +
    ' | campanhas ativas: ' + iris.campanhas.length + ' | peças publicadas: ' + publicados +
    ' | janela de comissão: ' + CFG.COMISSAO_JANELA;
  logar_('DEBUG', 'ok', 0, msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

/** Funil de um dia, só no log (não grava no cache). Útil para comparar com o board do Mixpanel. */
function debugFunilDia() {
  var dia = ontemISO_();
  var linhas = nektSql_(sqlFunil_(dia, dia));
  console.log(JSON.stringify(linhas.slice(0, 30), null, 1));
}

/** Quantos pedidos de medicação casam com o CPF de um creator, mês corrente e anterior. */
function debugMedicacao() {
  var ini = inicioMes_(somaDias_(inicioMes_(hojeISO_()), -1)), fim = ontemISO_();
  var acc = novoAcc_();
  var pedidos = bqSql_(sqlMedicacaoLake_(ini));
  var mapa = mapaCpfCreators_(nektSql_(sqlCreatorsCpf_()));
  var r = custoMedicacao_(pedidos, mapa, acc, ini, fim);
  var porCupom = {};
  Object.keys(acc).forEach(function (k) { porCupom[acc[k].cupom] = (porCupom[acc[k].cupom] || 0) + acc[k].medicacao; });
  var msg = 'Medicação ' + ini + ' a ' + fim + ': ' + r.pedidos + ' pedidos (R$ ' + r.valor.toFixed(2) + '), ' +
    r.casados + ' casados com creator (R$ ' + r.valorCasado.toFixed(2) + '). Creators com CPF: ' + Object.keys(mapa).length +
    '. Por cupom: ' + Object.keys(porCupom).sort().map(function (c) { return c + ' ' + porCupom[c].toFixed(2); }).join(', ');
  logar_('DEBUG', 'ok', r.pedidos, msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

// ===== pace/Pace.gs =====
/****************************************************************************************
 * Pace.gs: integração com a planilha "WL BR | Influencers - PACING V3".
 *
 * A aba 'Acquisition: Paid Creators' é uma fórmula. Até a véspera da data de corte
 * (Config!B14, 01/11/2026) ela segue exatamente como antes (H_Spend, H_Mixpanel, H_Checkouts).
 * A partir do corte, lê a aba auxiliar H_Iris, gerada por este script com a mesma lógica da
 * base de teste (Irís + lake + Mixpanel direto + medicação por CPF).
 *
 * configurarPace(): grava o corte em Config!A14:B14 (se vazio), troca a fórmula de
 * 'Acquisition: Paid Creators'!A2, guarda a fórmula anterior em Config!A16:B16 e esconde as
 * abas auxiliares. Rodar uma vez. desfazerPace() volta a fórmula anterior.
 ****************************************************************************************/

var PACE = {
  ABA_SAIDA: 'Acquisition: Paid Creators',
  CELULA_CORTE: 'B14',
  CORTE_PADRAO: '2026-11-01',
  CELULA_BACKUP: 'B16'
};

function formulaPace_() {
  return [
    '=ARRAYFORMULA(LET(',
    '  ini, Config!$B$2,',
    '  fim, Config!$B$3,',
    '  corte, Config!$B$14,',
    '  fimV, MIN(fim, corte - 1),',
    '  base, FILTER(H_Spend!A2:D, H_Spend!A2:A<>"", H_Spend!D2:D<>0, H_Spend!A2:A<corte),',
    '  sp, QUERY(base, "select Col1, Col2, sum(Col4) group by Col1, Col2 label sum(Col4) \'\'", 0),',
    '  comp, IF(UPPER(TRIM(Config!$B$6))="SIM", base, HSTACK(ini, "", "", 0)),',
    '  mx, QUERY(FILTER(H_Mixpanel!A2:D, H_Mixpanel!B2:B<>"", H_Mixpanel!A2:A>=ini, H_Mixpanel!A2:A<=fimV), "select Col1, Col2, Col3, sum(Col4) group by Col1, Col2, Col3 label sum(Col4) \'\'", 0),',
    '  ord, QUERY(FILTER(H_Checkouts!A2:E, H_Checkouts!D2:D<>"", H_Checkouts!A2:A>=ini, H_Checkouts!A2:A<=fimV), "select Col1, Col4, sum(Col5) group by Col1, Col4 label sum(Col5) \'\'", 0),',
    '  pay, QUERY(FILTER(H_Checkouts!A2:E, H_Checkouts!D2:D<>"", H_Checkouts!C2:C="Yes", H_Checkouts!A2:A>=ini, H_Checkouts!A2:A<=fimV), "select Col1, Col4, sum(Col5) group by Col1, Col4 label sum(Col5) \'\'", 0),',
    '  acq, QUERY(FILTER(H_Checkouts!A2:E, H_Checkouts!D2:D<>"", H_Checkouts!C2:C="Yes", ISNUMBER(H_Checkouts!B2:B), H_Checkouts!B2:B>=ini, H_Checkouts!B2:B<=fimV), "select Col2, Col4, sum(Col5) group by Col2, Col4 label sum(Col5) \'\'", 0),',
    '  iris, IFERROR(FILTER(H_Iris!A2:D, ISNUMBER(H_Iris!A2:A), H_Iris!A2:A>=corte, H_Iris!A2:A>=ini, H_Iris!A2:A<=fim), HSTACK(ini, "", "", 0)),',
    '  todos, VSTACK(',
    '    HSTACK(CHOOSECOLS(sp, 1), CHOOSECOLS(sp, 2), IF(SEQUENCE(ROWS(sp))>0, "Spend"), CHOOSECOLS(sp, 3)),',
    '    comp,',
    '    mx,',
    '    HSTACK(CHOOSECOLS(ord, 1), CHOOSECOLS(ord, 2), IF(SEQUENCE(ROWS(ord))>0, "Orders"), CHOOSECOLS(ord, 3)),',
    '    HSTACK(CHOOSECOLS(pay, 1), CHOOSECOLS(pay, 2), IF(SEQUENCE(ROWS(pay))>0, "Payment Completed"), CHOOSECOLS(pay, 3)),',
    '    HSTACK(CHOOSECOLS(acq, 1), CHOOSECOLS(acq, 2), IF(SEQUENCE(ROWS(acq))>0, "Acquisitions"), CHOOSECOLS(acq, 3)),',
    '    iris),',
    '  srt, SORT(FILTER(todos, CHOOSECOLS(todos, 4)<>0), 1, TRUE, 2, TRUE, 3, TRUE),',
    '  HSTACK(CHOOSECOLS(srt, 1), IF(SEQUENCE(ROWS(srt))>0, "Influence"), IF(SEQUENCE(ROWS(srt))>0, "Influencers"), CHOOSECOLS(srt, 2), CHOOSECOLS(srt, 3), ROUND(CHOOSECOLS(srt, 4), 2))',
    '))'
  ].join('\n');
}

function configurarPace() {
  var ss = SpreadsheetApp.getActive();
  var cfg = ss.getSheetByName('Config');
  var saida = ss.getSheetByName(PACE.ABA_SAIDA);
  if (!cfg || !saida) throw new Error('Abas Config ou ' + PACE.ABA_SAIDA + ' não encontradas.');

  var corte = cfg.getRange(PACE.CELULA_CORTE);
  if (!corte.getValue()) {
    cfg.getRange('A14').setValue('Base Irís a partir de');
    var p = PACE.CORTE_PADRAO.split('-');
    corte.setValue(new Date(+p[0], +p[1] - 1, +p[2])).setNumberFormat('dd/MM/yyyy');
  }

  var atual = saida.getRange('A2').getFormula();
  var nova = formulaPace_();
  if (atual && atual !== nova && atual.indexOf('H_Iris') < 0) {
    cfg.getRange('A16').setValue('Fórmula anterior de ' + PACE.ABA_SAIDA + '!A2 (backup)');
    cfg.getRange(PACE.CELULA_BACKUP).setValue("'" + atual);
  }
  saida.getRange('A2').setFormula(nova);

  [CFG.ABA_BASE, CFG.ABA_FUNIL, CFG.ABA_LOG].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && !sh.isSheetHidden()) sh.hideSheet();
  });
  logar_('PACE', 'ok', 0, 'Fórmula de ' + PACE.ABA_SAIDA + ' com corte em Config!' + PACE.CELULA_CORTE);
}

/** Volta a fórmula anterior (backup em Config!B16). */
function desfazerPace() {
  var ss = SpreadsheetApp.getActive();
  var backup = String(ss.getSheetByName('Config').getRange(PACE.CELULA_BACKUP).getValue() || '');
  if (backup.charAt(0) !== '=') throw new Error('Sem backup da fórmula em Config!' + PACE.CELULA_BACKUP);
  ss.getSheetByName(PACE.ABA_SAIDA).getRange('A2').setFormula(backup);
  logar_('PACE', 'ok', 0, 'Fórmula anterior restaurada');
}
