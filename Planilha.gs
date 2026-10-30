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
