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
  var base = String(prop_('SUPABASE_URL')).replace(/\/+$/, '');
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
