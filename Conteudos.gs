/****************************************************************************************
 * Conteudos.gs: conteúdos postados por dia e cupom (Irís, content_pieces)
 *
 * Conta peças com status em CFG.CONTEUDO_STATUS ('entregue') e não canceladas, na data de
 * publicação (published_at; sem ela, delivered_at), em Brasília. Cada peça soma 1 na
 * coluna do formato, 1 na coluna da plataforma e 1 no total. Formato fora de CFG.FORMATOS
 * (ou vazio) vai para "Outros formatos" / "Plataforma Outras".
 ****************************************************************************************/

function conteudos_(iris, acc, iniISO, fimISO) {
  var porFormato = {};
  CFG.FORMATOS.forEach(function (f) { porFormato[f.id] = f; });
  var cicloContrato = {}, contratoPorId = {};
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
    var f = porFormato[String(p.format || '').toLowerCase()] || CFG.FORMATO_SEM_TIPO;
    accAdd_(acc, dia, cupom, 'conteudos', 1);
    accAdd_(acc, dia, cupom, 'fmt:' + f.coluna, 1);
    accAdd_(acc, dia, cupom, 'plat:' + f.plataforma, 1);
  });
}
