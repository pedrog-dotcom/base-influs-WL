/* BASE_INFLUENCERS_WL.gs: gerado por build.sh a partir de github.com/pedrog-dotcom/base-influs-WL. Não edite aqui; edite os .gs do repositório. */

/* ===== Config.gs ===== */
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
  ABA_FUNIL: '_cache_funil_wl',     // oculta
  ABA_LOG: '_log_wl',               // oculta

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

/** Um só perfil: WL usa o CFG como está. HL tem repositório próprio (base-influs-HL), com o mesmo motor. */
var PERFIS = { WL: {} };

function prop_(nome, obrigatoria) {
  var v = PropertiesService.getScriptProperties().getProperty(nome);
  if (!v && obrigatoria !== false) throw new Error('Propriedade do script ausente: ' + nome);
  return v;
}

/* ===== Util.gs ===== */
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

/* ===== Planilha.gs ===== */
/****************************************************************************************
 * Planilha.gs: leitura e escrita das abas pela API do Google Sheets (serviço avançado "Sheets").
 *
 * As planilhas de pacing são pesadas (muitas fórmulas). Pelo SpreadsheetApp cada getRange /
 * setValues espera o recálculo e o script estoura o tempo. Pela API a escrita vai direto para o
 * servidor e o recálculo acontece depois, sem segurar a execução.
 *
 * Só estas funções tocam a planilha; o resto do motor trabalha com listas em memória.
 ****************************************************************************************/

var PLANILHA_ID_ = null, ABAS_ = null;

/** ID da planilha vinculada (ou da propriedade PLANILHA_ID, se existir). */
function planilhaId_() {
  if (!PLANILHA_ID_) PLANILHA_ID_ = prop_('PLANILHA_ID', false) || SpreadsheetApp.getActive().getId();
  return PLANILHA_ID_;
}

function urlPlanilha_() { return 'https://docs.google.com/spreadsheets/d/' + planilhaId_() + '/edit'; }

/** Propriedades das abas por título (sheetId, gridProperties), lidas uma vez por execução. */
function abas_() {
  if (!ABAS_) {
    ABAS_ = {};
    (Sheets.Spreadsheets.get(planilhaId_(), { fields: 'sheets.properties(sheetId,title,index,hidden,gridProperties)' }).sheets || [])
      .forEach(function (s) { ABAS_[s.properties.title] = s.properties; });
  }
  return ABAS_;
}

function faixa_(nome, a1) { return "'" + String(nome).replace(/'/g, "''") + "'!" + a1; }

function colLetra_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function lote_(requests) {
  if (requests.length) return Sheets.Spreadsheets.batchUpdate({ requests: requests }, planilhaId_());
}

/**
 * Garante a aba (cria no fim da lista; nomes iniciados por '_' ficam ocultos), com pelo menos
 * `linhas` x `colunas` de grade. Devolve as propriedades da aba.
 */
function garantirAba_(nome, linhas, colunas) {
  var abas = abas_(), p = abas[nome];
  if (!p) {
    var r = lote_([{ addSheet: { properties: {
      title: nome, index: Object.keys(abas).length, hidden: String(nome).charAt(0) === '_',
      gridProperties: { rowCount: Math.max(linhas || 0, 100), columnCount: Math.max(colunas || 0, 8), frozenRowCount: 1 }
    } } }]);
    p = abas[nome] = r.replies[0].addSheet.properties;
    return p;
  }
  var g = p.gridProperties || {}, req = [];
  if (linhas && (g.rowCount || 0) < linhas) {
    req.push({ appendDimension: { sheetId: p.sheetId, dimension: 'ROWS', length: linhas - (g.rowCount || 0) } });
    g.rowCount = linhas;
  }
  if (colunas && (g.columnCount || 0) < colunas) {
    req.push({ appendDimension: { sheetId: p.sheetId, dimension: 'COLUMNS', length: colunas - (g.columnCount || 0) } });
    g.columnCount = colunas;
  }
  lote_(req);
  return p;
}

/** Valores exibidos (texto) de uma faixa A1 da aba; [] se a aba não existe. */
function lerAba_(nome, a1) {
  if (!abas_()[nome]) return [];
  return Sheets.Spreadsheets.Values.get(planilhaId_(), faixa_(nome, a1), { valueRenderOption: 'FORMATTED_VALUE' }).values || [];
}

/** Valores brutos (números, datas como número de série) de uma faixa A1; [] se a aba não existe. */
function lerAbaValores_(nome, a1) {
  if (!abas_()[nome]) return [];
  return Sheets.Spreadsheets.Values.get(planilhaId_(), faixa_(nome, a1),
    { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' }).values || [];
}

/**
 * Reescreve uma aba inteira: cabeçalho na linha 1 e `linhas` a partir da linha 2 (valores RAW).
 * opts.formatos: [{col: 1, tipo: 'DATE'|'NUMBER'|'TEXT', padrao: 'yyyy-mm-dd'}] aplicados nas linhas de dados.
 * opts.datasIso: true converte a 1ª coluna (yyyy-mm-dd) em número de série do Sheets.
 */
function gravarAba_(nome, cab, linhas, opts) {
  opts = opts || {};
  var n = cab.length, total = linhas.length + 1;
  var p = garantirAba_(nome, total, n);
  var ultimaCol = colLetra_(Math.max(n, (p.gridProperties || {}).columnCount || n));
  Sheets.Spreadsheets.Values.clear({}, planilhaId_(), faixa_(nome, 'A2:' + ultimaCol));
  var valores = linhas.map(function (l) {
    var o = l.slice();
    if (opts.datasIso) o[0] = serialSheets_(l[0]);
    return o;
  });
  var dados = [{ range: faixa_(nome, 'A1:' + colLetra_(n) + '1'), values: [cab] }];
  for (var i = 0; i < valores.length; i += ESCRITA_LOTE) {
    var pedaco = valores.slice(i, i + ESCRITA_LOTE);
    dados.push({ range: faixa_(nome, 'A' + (2 + i) + ':' + colLetra_(n) + (1 + i + pedaco.length)), values: pedaco });
  }
  for (var j = 0; j < dados.length; j += 10) {
    Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'RAW', data: dados.slice(j, j + 10) }, planilhaId_());
  }
  var req = [{ repeatCell: {
    range: { sheetId: p.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: n },
    cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold'
  } }];
  (opts.formatos || []).forEach(function (f) {
    if (!valores.length) return;
    req.push({ repeatCell: {
      range: { sheetId: p.sheetId, startRowIndex: 1, endRowIndex: total, startColumnIndex: f.col - 1, endColumnIndex: f.col },
      cell: { userEnteredFormat: { numberFormat: { type: f.tipo, pattern: f.padrao || '' } } }, fields: 'userEnteredFormat.numberFormat'
    } });
  });
  lote_(req);
}

/** Acrescenta linhas no fim da aba (cria com cabeçalho se não existir). */
function anexarAba_(nome, cab, linhas) {
  if (!abas_()[nome]) gravarAba_(nome, cab, []);
  Sheets.Spreadsheets.Values.append({ values: linhas }, planilhaId_(), faixa_(nome, 'A1'),
    { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
}

/* ===== Clients.gs ===== */
/****************************************************************************************
 * Clients.gs: acesso ao Supabase (Irís) via PostgREST e ao BigQuery (serviço avançado)
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

/* ===== Sql.gs ===== */
/****************************************************************************************
 * Sql.gs: consultas no BigQuery (lake, projeto CFG.BQ_PROJECT, dataset prod). Só montagem de
 * texto; a execução (bqSql_) fica em Clients.gs.
 *
 * Tabelas:
 *   prod.fct_orders                 1 linha por pedido (order_context, categoria, datas, is_confirmed)
 *   prod.dim_order_item_discounts   promotion_code / promotion_coupon_code por item do pedido
 *   prod.dim_customer               CPF do cliente (só para o custo de medicação, em memória)
 ****************************************************************************************/

function sqlList_(arr) {
  if (!arr || !arr.length) return 'NULL';   // IN (NULL) não casa nada e mantém o SQL válido
  return arr.map(function (s) { return "'" + String(s).replace(/'/g, "\\'") + "'"; }).join(', ');
}

/**
 * Pedidos com o cupom de influenciador, 1 linha por pedido. Mesma regra do SQL do pace:
 * Voy, Brazil, promotion_code voy_br_coupon_15_influencer, confirmados ou não. Creators
 * híbridas (CUPONS_HIBRIDOS) entram com qualquer promotion code.
 * data     = checkout em Brasília (Orders)
 * data_pag = conclusão do pagamento em Brasília (Acquisitions, quando confirmado)
 * Lê pedidos com checkout OU pagamento a partir de desdeISO.
 *
 * Métricas de categoria (CFG.CATEGORIA_LAKE, ex.: weight_loss), por customer_id, olhando todos os
 * pedidos do cliente no país (qualquer cupom, qualquer order_context):
 *   cat_ord = é o 1º pedido do cliente na categoria (pela data do checkout)
 *   cat_pc  = é o 1º pedido confirmado do cliente na categoria (pela data do checkout)
 *   cat_acq = é o 1º pedido confirmado com pagamento concluído na categoria (pela data do pagamento)
 */
function sqlVendasInfluencer_(desdeISO) {
  var p = '`' + CFG.BQ_PROJECT + '.prod.';
  var conf = "IFNULL(is_confirmed, FALSE)";
  var pag = "payment_completed_at IS NOT NULL";
  var promos = sqlList_(CFG.PROMO_INFLUENCER.map(function (x) { return String(x).toLowerCase(); }));
  return "WITH cat AS (\n" +
    "  SELECT order_id,\n" +
    "    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY system_checkout_at, order_id) = 1 AS cat_ord,\n" +
    "    IF(" + conf + ", ROW_NUMBER() OVER (PARTITION BY customer_id, " + conf + " ORDER BY system_checkout_at, order_id) = 1, FALSE) AS cat_pc,\n" +
    "    IF(" + conf + " AND " + pag + ", ROW_NUMBER() OVER (PARTITION BY customer_id, " + conf + " AND " + pag + "\n" +
    "       ORDER BY payment_completed_at, order_id) = 1, FALSE) AS cat_acq\n" +
    "  FROM " + p + "fct_orders`\n" +
    "  WHERE LOWER(country) = " + sqlList_([CFG.COUNTRY]) + " AND order_taxonomy_business_category = " + sqlList_([CFG.CATEGORIA_LAKE]) + "\n" +
    "    AND system_checkout_at IS NOT NULL\n" +
    "),\n" +
    "disc AS (\n" +
    "  SELECT order_id, UPPER(TRIM(ANY_VALUE(promotion_coupon_code))) AS cupom\n" +
    "  FROM " + p + "dim_order_item_discounts`\n" +
    "  WHERE LOWER(promotion_code) IN (" + promos + ")\n" +
    "     OR UPPER(TRIM(promotion_coupon_code)) IN (" + sqlList_(CFG.CUPONS_HIBRIDOS.map(normCupom_)) + ")\n" +
    "  GROUP BY order_id\n" +
    ")\n" +
    "SELECT o.order_id, o.order_number, d.cupom,\n" +
    "  FORMAT_DATE('%Y-%m-%d', DATE(o.system_checkout_at, 'America/Sao_Paulo')) AS data,\n" +
    "  IF(o.payment_completed_at IS NULL, NULL, FORMAT_DATE('%Y-%m-%d', DATE(o.payment_completed_at, 'America/Sao_Paulo'))) AS data_pag,\n" +
    "  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S', o.system_checkout_at) AS checkout_utc,\n" +
    "  CAST(IFNULL(o.is_confirmed, FALSE) AS STRING) AS is_confirmed,\n" +
    "  o.order_context AS ctx,\n" +
    "  CAST(IFNULL(c.cat_ord, FALSE) AS STRING) AS cat_ord,\n" +
    "  CAST(IFNULL(c.cat_pc, FALSE) AS STRING) AS cat_pc,\n" +
    "  CAST(IFNULL(c.cat_acq, FALSE) AS STRING) AS cat_acq\n" +
    "FROM disc d JOIN " + p + "fct_orders` o USING (order_id)\n" +
    "LEFT JOIN cat c USING (order_id)\n" +
    "WHERE UPPER(o.brand_at_checkout) = " + sqlList_([String(CFG.BRAND).toUpperCase()]) + " AND LOWER(o.country) = " + sqlList_([CFG.COUNTRY]) + "\n" +
    "  AND o.system_checkout_at IS NOT NULL\n" +
    "  AND (DATE(o.system_checkout_at, 'America/Sao_Paulo') >= DATE '" + desdeISO + "'\n" +
    "       OR DATE(o.payment_completed_at, 'America/Sao_Paulo') >= DATE '" + desdeISO + "')\n" +
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

/* ===== Iris.gs ===== */
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

  // CPF das influenciadoras (influencer_personal_data), só em memória, para o custo de medicação.
  var cpfParaRef = {};
  try {
    sbSelect_('influencer_personal_data', 'influencer_id,cpf').forEach(function (r) {
      var cpf = String(r.cpf || '').replace(/\D/g, '');
      if (cpf.length > 0 && cpf.length < 11) cpf = ('00000000000' + cpf).slice(-11);
      if (cpf.length === 11 && !/^0+$/.test(cpf) && refPorInfluencer[r.influencer_id]) cpfParaRef[cpf] = refPorInfluencer[r.influencer_id];
    });
  } catch (e) { logar_('IRIS', 'aviso', 0, 'Sem CPF da Irís (influencer_personal_data): ' + e.message); }

  return {
    categoriaId: catId, cpfParaRef: cpfParaRef,
    refPorInfluencer: refPorInfluencer, influencerPorRef: influencerPorRef, nomePorRef: nomePorRef,
    contratos: contratos, termos: termos, ciclos: ciclos, pecas: pecas,
    campanhas: campanhas, campanhaContratos: campanhaContratos
  };
}

/* ===== Custos.gs ===== */
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
 * Replica a parte de vendas do calcular_pagamento da Irís, usando as vendas do BigQuery (lake):
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
  var ordenadas = vendas.filter(function (v) { return v.comissionavel != null ? v.comissionavel : v.pago; }).slice().sort(function (a, b) {
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

/* ===== Medicacao.gs ===== */
/****************************************************************************************
 * Medicacao.gs: custo de medicação por creator (cruzamento por CPF)
 *
 * pedidos:     [{data, cpf, gross}] do lake (sqlMedicacaoLake_), um por pedido gratuito
 * cpfParaCupom {cpf: CUPOM} das influenciadoras na Irís (influencer_personal_data)
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

/* ===== Conteudos.gs ===== */
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

/* ===== Mixpanel.gs ===== */
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
    // Ordem importa: no board de HL todas as métricas são "Total Sessions of <evento>".
    var c = k.indexOf('quest') >= 0 ? 'quest' : k.indexOf('checkout') >= 0 ? 'checkout'
      : k.indexOf('recommend') >= 0 ? 'recs' : k.indexOf('session') >= 0 ? 'sessoes' : null;
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
  var met = Object.keys(r.series).filter(function (m) {
    var k = m.toLowerCase();
    return k.indexOf('session') >= 0 && !/quest|checkout|recommend/.test(k);
  })[0];
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

/* ===== Base.gs ===== */
/****************************************************************************************
 * Base.gs: monta a aba BASE_INFLUENCERS_WL (formato longo: Data x Cupom x Métrica) e cuida do cache do funil.
 *
 * ENTRYPOINTS (menu "Base Influencers" ou botão Executar):
 *   executarDiario()             funil incremental (D-1..D-3) + reconstrução da base. Gatilho diário.
 *   atualizarBase()              reconstrói a base inteira (custos e vendas são baratos; o funil vem do cache)
 *   atualizarFunilIncremental()  só o funil (dias cobertos pelo report do Mixpanel)
 *   instalarGatilhoDiario()      cria o gatilho diário (≈ 7h40)
 *
 * Granularidade: 1 linha por dia e cupom com qualquer valor diferente de zero.
 * Custos: fixo, comissão e campanha de incentivo (Irís). Vendas e medicação: BigQuery (lake).
 * Funil: Mixpanel (Query API, cache). Conteúdos ficam na aba à parte ABA_CONTEUDOS.
 ****************************************************************************************/

function executarDiario() {
  comLock_(function () {
    var erros = [];
    Object.keys(PERFIS).forEach(function (p) {
      comPerfil_(p, function () {
        try { atualizarFunilIncremental_(); } catch (e) { logar_('FUNIL', 'erro', 0, e); avisar_('Funil ' + p, e); }
        try { atualizarBase_(); } catch (e) { logar_('BASE', 'erro', 0, e); avisar_('Base ' + p, e); erros.push(p + ': ' + e.message); }
      });
    });
    if (erros.length) throw new Error(erros.join(' | '));
  });
}

function atualizarBase() { executarDiario(); }
function atualizarFunilIncremental() {
  comLock_(function () { Object.keys(PERFIS).forEach(function (p) { comPerfil_(p, atualizarFunilIncremental_); }); });
}

/** Roda fn com o CFG do perfil (WL, HL...) e restaura o CFG no fim. */
var CFG_BASE_ = null;
function comPerfil_(nome, fn) {
  if (!CFG_BASE_) CFG_BASE_ = Object.assign({}, CFG);
  Object.keys(CFG).forEach(function (k) { delete CFG[k]; });
  Object.assign(CFG, CFG_BASE_, PERFIS[nome] || {}, { PERFIL: nome });
  MP_CACHE_ = null;
  try { return fn(); } finally {
    Object.keys(CFG).forEach(function (k) { delete CFG[k]; });
    Object.assign(CFG, CFG_BASE_);
    MP_CACHE_ = null;
  }
}

/* =========================================================================
 * Base
 * ========================================================================= */

function atualizarBase_() {
  var t0 = Date.now();
  var ini = CFG.DATA_INICIO, fim = ontemISO_();
  var acc = novoAcc_();

  var iris = carregarIris_();

  var vendas = bqSql_(sqlVendasInfluencer_(minIso_(CFG.VENDAS_DESDE, ini))).map(function (r) {
    var cupom = normCupom_(r.cupom);
    cupom = CFG.CUPOM_ALIAS[cupom] || cupom;
    return {
      order_id: r.order_id, order_number: r.order_number, cupom: cupom, data: r.data,
      data_pag: r.data_pag || null, checkout_utc: r.checkout_utc,
      confirmado: String(r.is_confirmed) === 'true', pago: !!r.data_pag,
      catOrd: String(r.cat_ord) === 'true', catPc: String(r.cat_pc) === 'true', catAcq: String(r.cat_acq) === 'true',
      ctxAcq: String(r.ctx || '').replace(/^unconfirmed-/, '') === CFG.CONTEXTO_AQUISICAO
    };
  });
  // Comissionável: aquisição confirmada e paga, de contexto acquisition ou adicional da categoria.
  vendas.forEach(function (v) { v.comissionavel = v.pago && v.confirmado && (v.ctxAcq || v.catAcq); });
  vendas.forEach(function (v) {
    var ck = v.data >= ini && v.data <= fim, pg = !!v.data_pag && v.data_pag >= ini && v.data_pag <= fim;
    if (v.ctxAcq) {
      // Orders: pedidos de aquisição, na data do checkout (todos os status)
      if (ck) accAdd_(acc, v.data, v.cupom, 'orders', 1);
      // Payment Completed: pedidos de aquisição do dia (checkout) com pagamento concluído
      if (ck && v.pago) accAdd_(acc, v.data, v.cupom, 'pagos', 1);
      // Acquisitions: pedidos de aquisição confirmados, na data de conclusão do pagamento
      if (pg && v.confirmado) accAdd_(acc, v.data_pag, v.cupom, 'acq', 1);
    } else {
      // Adicional da categoria: outro contexto, mas 1º pedido do cliente na categoria
      if (ck && v.catOrd) accAdd_(acc, v.data, v.cupom, 'orders_cat', 1);
      if (ck && v.catPc) accAdd_(acc, v.data, v.cupom, 'pagos_cat', 1);
      if (pg && v.catAcq) accAdd_(acc, v.data_pag, v.cupom, 'acq_cat', 1);
    }
  });

  custoFixo_(iris, acc, ini, fim);
  comissaoECampanha_(iris, vendas, acc, ini, fim);

  var med = CFG.MEDICACAO === false ? { casados: 0, pedidos: 0 }
    : custoMedicacao_(bqSql_(sqlMedicacaoLake_(ini)), iris.cpfParaRef || {}, acc, ini, fim);   // CPF só da Irís

  lerCacheFunil_().forEach(function (r) {
    if (r.data < ini || r.data > fim) return;
    accAdd_(acc, r.data, r.cupom, 'sessoes', r.sessoes);
    accAdd_(acc, r.data, r.cupom, 'quest', r.quest);
    accAdd_(acc, r.data, r.cupom, 'recs', r.recs);
    accAdd_(acc, r.data, r.cupom, 'checkout', r.checkout);
  });

  var linhas = linhasDaBase_(acc);
  // Histórico antes de BASE_DESDE montado com as abas da própria planilha (só onde CFG.HISTORICO existe).
  if (CFG.HISTORICO) linhas = linhasHistorico_().concat(linhas);
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
  var vals = lerAba_(M.aba, 'A2:Z');
  if (!vals.length) return function (c) { return c; };
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
  gravarAba_(CFG.ABA_BASE, CFG.COLUNAS, linhas, { datasIso: true, formatos: [{ col: 1, tipo: 'DATE', padrao: CFG.FORMATO_DATA_BASE }] });
}

function escreverConteudos_(linhas) {
  gravarAba_(CFG.ABA_CONTEUDOS, CFG.COLUNAS_CONTEUDOS, linhas, { datasIso: true, formatos: [
    { col: 1, tipo: 'DATE', padrao: 'dd/MM/yyyy' }, { col: 5, tipo: 'NUMBER', padrao: '#,##0' }] });
}

var ESCRITA_LOTE = 5000;   // linhas por intervalo enviado à API

/** Data ISO (yyyy-mm-dd) -> número de série do Sheets (dias desde 30/12/1899), sem objeto Date. */
function serialSheets_(iso) {
  var p = String(iso).slice(0, 10).split('-');
  var ms = Date.UTC(+p[0], +p[1] - 1, +p[2]);
  if (isNaN(ms)) throw new Error('Data inválida na base: "' + iso + '"');
  return (ms - Date.UTC(1899, 11, 30)) / 86400000;
}

/* =========================================================================
 * Funil (cache, para guardar os dias que saem da janela do report do Mixpanel)
 * ========================================================================= */

/**
 * Funil incremental: regrava só os dias que o report do Mixpanel cobre (ex.: últimos 30 dias).
 * Dias mais antigos ficam como estão no cache, então o histórico não se perde quando sai da
 * janela do report.
 */
function atualizarFunilIncremental_() {
  var fim = ontemISO_();
  var jan = mpJanelaReport_();
  var n = carregarFunil_(maxIso_(CFG.DATA_INICIO, jan.ini || CFG.DATA_INICIO), fim);
  if (!mpSessoesDia_(fim)) logar_('FUNIL', 'aviso', 0, 'Report do Mixpanel sem sessões em ' + fim + '. Confira o board.');
  return n;
}

/** Roda o funil de iniISO a fimISO e substitui essas datas no cache. */
function carregarFunil_(iniISO, fimISO) {
  var t0 = Date.now();
  var brutos = funilMixpanel_(iniISO, fimISO);
  var novos = brutos.map(function (r) {
    return { data: r.data, cupom: normCupom_(r.cupom), sessoes: +r.sessoes || 0, quest: +r.quest || 0, recs: +r.recs || 0, checkout: +r.checkout || 0 };
  });
  var mantidos = lerCacheFunil_().filter(function (r) { return r.data < iniISO || r.data > fimISO; });
  var todos = mantidos.concat(novos).sort(function (a, b) {
    return a.data === b.data ? (a.cupom < b.cupom ? -1 : 1) : (a.data < b.data ? -1 : 1);
  });
  var agora = Utilities.formatDate(new Date(), CFG.TZ, 'dd/MM/yyyy HH:mm');
  // RAW: data ISO e cupom ficam como texto, contagens como número.
  gravarAba_(CFG.ABA_FUNIL, ['Data', 'Cupom', 'Sessões', 'Quest started', 'Recommendations', 'Checkout started', 'Atualizado em'],
    todos.map(function (r) { return [r.data, r.cupom, r.sessoes, r.quest, r.recs, r.checkout, r.atualizado || agora]; }));
  logar_('FUNIL', 'ok', novos.length, 'Funil ' + iniISO + ' a ' + fimISO + ' em ' + Math.round((Date.now() - t0) / 1000) + 's');
  return novos.length;
}

function lerCacheFunil_() {
  return lerAba_(CFG.ABA_FUNIL, 'A2:G')
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return { data: r[0], cupom: r[1], sessoes: +r[2] || 0, quest: +r[3] || 0, recs: +r[4] || 0, checkout: +r[5] || 0, atualizado: r[6] };
    });
}

/* =========================================================================
 * Infra
 * ========================================================================= */

function comLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Outra execução em andamento.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function logar_(etapa, status, linhas, msg) {
  try {
    var quando = Utilities.formatDate(new Date(), CFG.TZ, 'dd/MM/yyyy HH:mm:ss');
    anexarAba_(CFG.ABA_LOG, ['Quando', 'Etapa', 'Status', 'Linhas', 'Mensagem'],
      [[quando, (CFG.PERFIL ? CFG.PERFIL + ' ' : '') + etapa, status, linhas, String(msg && msg.message ? msg.message : msg).slice(0, 500)]]);
  } catch (e) { console.error(e); }
}

function avisar_(etapa, e) {
  var para = prop_('ALERT_EMAIL', false) || Session.getEffectiveUser().getEmail();
  if (!para) return;
  MailApp.sendEmail(para, '[Base Influencers WL] erro em ' + etapa,
    String(e && e.stack ? e.stack : e) + '\n\nPlanilha: ' + urlPlanilha_());
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

/* ===== Menu.gs ===== */
/****************************************************************************************
 * Menu.gs: menu na planilha e diagnósticos rápidos
 ****************************************************************************************/

function onOpen() {
  var menu = SpreadsheetApp.getUi().createMenu('Base Influencers')
    .addItem('Atualizar tudo (funil + base)', 'executarDiario')
    .addItem('Reconstruir só a base', 'atualizarBase')
    .addItem('Atualizar só o funil', 'atualizarFunilIncremental')
    .addSeparator()
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

/** Confere Supabase e BigQuery com consultas pequenas. */
function debugConexoes() {
  var cat = sbSelect_('categories', 'slug');
  var contratos = sbSelect_('contracts', 'id');
  var n = bqSql_("SELECT COUNT(*) AS n FROM `" + CFG.BQ_PROJECT + ".prod.dim_order_item_discounts` WHERE LOWER(promotion_code) IN (" +
    sqlList_(CFG.PROMO_INFLUENCER.map(function (x) { return String(x).toLowerCase(); })) + ")");
  var sbOk = cat.length > 0 && contratos.length > 0;
  var msg = (sbOk ? 'Supabase OK' : 'Supabase SEM DADOS: a chave em SUPABASE_SERVICE_KEY não lê as tabelas (RLS). Use a service_role / sb_secret_, não a anon / sb_publishable_') +
    ' (' + cat.length + ' categorias, ' + contratos.length + ' contratos). BigQuery OK (' + n[0].n + ' linhas de desconto de influenciador).';
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

/** Quantos pedidos de medicação casam com o CPF de um creator, mês corrente e anterior. */
function debugMedicacao() {
  var ini = inicioMes_(somaDias_(inicioMes_(hojeISO_()), -1)), fim = ontemISO_();
  var acc = novoAcc_();
  var pedidos = bqSql_(sqlMedicacaoLake_(ini));
  var mapa = carregarIris_().cpfParaRef;
  var r = custoMedicacao_(pedidos, mapa, acc, ini, fim);
  var porCupom = {};
  Object.keys(acc).forEach(function (k) { porCupom[acc[k].cupom] = (porCupom[acc[k].cupom] || 0) + acc[k].medicacao; });
  var msg = 'Medicação ' + ini + ' a ' + fim + ': ' + r.pedidos + ' pedidos (R$ ' + r.valor.toFixed(2) + '), ' +
    r.casados + ' casados com creator (R$ ' + r.valorCasado.toFixed(2) + '). Creators com CPF: ' + Object.keys(mapa).length +
    '. Por cupom: ' + Object.keys(porCupom).sort().map(function (c) { return c + ' ' + porCupom[c].toFixed(2); }).join(', ');
  logar_('DEBUG', 'ok', r.pedidos, msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
