/****************************************************************************************
 * Menu.gs: menu na planilha e diagnósticos rápidos
 ****************************************************************************************/

function onOpen() {
  var menu = SpreadsheetApp.getUi().createMenu('Base Influencers')
    .addItem('Atualizar tudo (funil + base)', 'executarDiario')
    .addItem('Reconstruir só a base', 'atualizarBase')
    .addItem('Atualizar só o funil', 'atualizarFunilIncremental')
    .addSeparator()
    .addItem('Instalar gatilhos (8h30 e a cada 3h)', 'instalarGatilhoDiario')
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
