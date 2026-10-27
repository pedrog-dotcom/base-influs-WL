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
