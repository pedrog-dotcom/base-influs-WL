/****************************************************************************************
 * Base.gs: monta a aba BASE_INFLUENCERS_WL (Data x Cupom) e cuida do cache do funil.
 *
 * ENTRYPOINTS (menu "Base Influencers" ou botão Executar):
 *   executarDiario()             funil incremental (D-1..D-3) + reconstrução da base. Gatilho diário.
 *   atualizarBase()              reconstrói a base inteira (custos e vendas são baratos; o funil vem do cache)
 *   atualizarFunilIncremental()  só o funil, janela CFG.FUNIL.JANELA_DIAS
 *   backfillFunil()              recarrega o funil de DATA_INICIO até D-1 em blocos, continuando por gatilho
 *   instalarGatilhoDiario()      cria o gatilho diário (≈ 7h40)
 *
 * Granularidade: 1 linha por dia e cupom com qualquer valor diferente de zero.
 * Linhas especiais: (MEDICACAO INFLUVOY) e (GERAL) para custos sem cupom de influenciadora.
 ****************************************************************************************/

function executarDiario() {
  comLock_(function () {
    try { atualizarFunilIncremental_(); } catch (e) { logar_('FUNIL', 'erro', 0, e); avisar_('Funil', e); }
    try { atualizarBase_(); } catch (e) { logar_('BASE', 'erro', 0, e); avisar_('Base', e); throw e; }
  });
}

function atualizarBase() { comLock_(atualizarBase_); }
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
    return {
      order_id: r.order_id, order_number: r.order_number, cupom: normCupom_(r.cupom), data: r.data,
      checkout_utc: r.checkout_utc, contexto: r.order_context,
      confirmado: String(r.is_confirmed) === 'true', pago: String(r.pago) === 'true'
    };
  });
  vendas.forEach(function (v) {
    if (v.data < ini || v.data > fim) return;
    accAdd_(acc, v.data, v.cupom, 'orders', 1);
    if (v.confirmado && v.contexto === 'acquisition') accAdd_(acc, v.data, v.cupom, 'acq', 1);
  });

  nektSql_(sqlMedicacao_(ini)).forEach(function (r) {
    if (r.data <= fim) accAdd_(acc, r.data, CFG.CUPOM_MEDICACAO, 'medicacao', Number(r.gross));
  });

  custoFixo_(iris, acc, ini, fim);
  comissaoECampanha_(iris, vendas, acc, ini, fim);
  custoPlataformas_(lerPlataformas_(), acc, ini, fim);

  lerCacheFunil_().forEach(function (r) {
    if (r.data < ini || r.data > fim) return;
    accAdd_(acc, r.data, r.cupom, 'sessoes', r.sessoes);
    accAdd_(acc, r.data, r.cupom, 'quest', r.quest);
    accAdd_(acc, r.data, r.cupom, 'recs', r.recs);
    accAdd_(acc, r.data, r.cupom, 'checkout', r.checkout);
  });

  var linhas = linhasDaBase_(acc);
  escreverBase_(linhas);
  logar_('BASE', 'ok', linhas.length, 'Base ' + ini + ' a ' + fim + ' em ' + Math.round((Date.now() - t0) / 1000) + 's');
  return linhas.length;
}

function linhasDaBase_(acc) {
  var chaves = Object.keys(acc).sort();
  return chaves.map(function (k) {
    var r = acc[k];
    var total = (r.fixo || 0) + (r.comissao || 0) + (r.plataformas || 0) + (r.medicacao || 0) + (r.campanha || 0);
    return [r.data, r.cupom, r.fixo || 0, r.comissao || 0, r.plataformas || 0, r.medicacao || 0, r.campanha || 0, total,
      r.sessoes || 0, r.quest || 0, r.recs || 0, r.checkout || 0, r.orders || 0, r.acq || 0];
  });
}

function escreverBase_(linhas) {
  var sh = aba_(CFG.ABA_BASE, CFG.COLUNAS);
  var n = CFG.COLUNAS.length;
  var max = sh.getMaxRows();
  if (max > 1) sh.getRange(2, 1, max - 1, n).clearContent();
  if (linhas.length) {
    var valores = linhas.map(function (l) {
      var p = l[0].split('-');
      var out = l.slice();
      out[0] = new Date(+p[0], +p[1] - 1, +p[2]);
      return out;
    });
    if (sh.getMaxRows() < valores.length + 1) sh.insertRowsAfter(sh.getMaxRows(), valores.length + 1 - sh.getMaxRows());
    sh.getRange(2, 1, valores.length, n).setValues(valores);
    sh.getRange(2, 1, valores.length, 1).setNumberFormat('dd/MM/yyyy');
    sh.getRange(2, 3, valores.length, 6).setNumberFormat('#,##0.00');      // custos: arredonda só na exibição
    sh.getRange(2, 9, valores.length, 6).setNumberFormat('#,##0');
  }
  sh.setFrozenRows(1);
}

/* =========================================================================
 * Funil (cache em _cache_funil, porque cada dia de Mixpanel lê ~30 GB)
 * ========================================================================= */

function atualizarFunilIncremental_() {
  var fim = ontemISO_();
  var ini = maxIso_(somaDias_(fim, -(CFG.FUNIL.JANELA_DIAS - 1)), CFG.DATA_INICIO);
  return carregarFunil_(ini, fim);
}

/** Roda o funil de iniISO a fimISO e substitui essas datas no cache. */
function carregarFunil_(iniISO, fimISO) {
  var t0 = Date.now();
  var novos = nektSql_(sqlFunil_(iniISO, fimISO)).map(function (r) {
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
 * Plataformas (input manual)
 * ========================================================================= */

function lerPlataformas_() {
  var cab = ['Plataforma', 'Cupom (vazio = GERAL)', 'Início', 'Fim (vazio = fim do mês)', 'Valor mensal (R$)', 'Valor diário (R$)'];
  var sh = aba_(CFG.ABA_PLATAFORMAS, cab);
  if (sh.getLastRow() < 2) return [];
  var tz = CFG.TZ;
  function iso(v) {
    if (!v) return null;
    if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    var m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? m[3] + '-' + m[2] + '-' + m[1] : String(v).slice(0, 10);
  }
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues()
    .filter(function (r) { return r[0] || r[4] || r[5]; })
    .map(function (r) {
      return { plataforma: r[0], cupom: r[1], inicio: iso(r[2]), fim: iso(r[3]), mensal: Number(r[4]) || 0, diario: Number(r[5]) || 0 };
    });
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
