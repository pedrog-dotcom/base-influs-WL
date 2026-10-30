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
