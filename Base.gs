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
  var conteudos = linhasConteudos_(iris, ini, fim);
  escreverConteudos_(conteudos);
  logar_('BASE', 'ok', linhas.length, 'Base ' + ini + ' a ' + fim + ' (' + conteudos.length + ' linhas de conteúdo; medicação: ' +
    med.casados + '/' + med.pedidos + ' pedidos casados por CPF) em ' + Math.round((Date.now() - t0) / 1000) + 's');
  return linhas.length;
}

function linhasDaBase_(acc) {
  return Object.keys(acc).sort().map(function (k) {
    var r = acc[k];
    return [r.data, r.cupom, r.fixo || 0, r.comissao || 0, r.campanha || 0, r.medicacao || 0,
      r.sessoes || 0, r.quest || 0, r.recs || 0, r.checkout || 0, r.orders || 0, r.acq || 0];
  });
}

function escreverBase_(linhas) {
  escreverAba_(CFG.ABA_BASE, CFG.COLUNAS, linhas, function (sh, n) {
    sh.getRange(2, 3, n, 4).setNumberFormat('#,##0.00');      // custos: arredonda só na exibição
    sh.getRange(2, 7, n, 6).setNumberFormat('#,##0');
  });
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
function escreverAba_(nome, cols, linhas, formatar) {
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
    sh.getRange(2, 1, valores.length, 1).setNumberFormat('dd/MM/yyyy');
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
