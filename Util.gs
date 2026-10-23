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
