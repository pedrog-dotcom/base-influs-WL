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
  var msg = 'Mixpanel ' + ini + ' a ' + fim + ': ' + tot + ' sessões em ' + Object.keys(cupons).length + ' cupons; ' +
    CFG.MIXPANEL.CUPOM_OUTROS + ' = ' + outros + ' (' + (tot ? (100 * outros / tot).toFixed(1) : 0) + '%).';
  logar_('DEBUG', 'ok', linhas.length, msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
