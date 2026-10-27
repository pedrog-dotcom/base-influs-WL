/****************************************************************************************
 * Medicacao.gs: custo de medicação por creator (cruzamento por CPF)
 *
 * pedidos:     [{data, cpf, gross}] do lake (sqlMedicacaoLake_), um por pedido gratuito
 * cpfParaCupom {cpf: CUPOM} da base de creators (sqlCreatorsCpf_)
 * O custo (gross revenue) vai para o cupom do creator dono do CPF, na data de conclusão do
 * pagamento. Sem correspondência, vai para CFG.CUPOM_MEDICACAO_SEM_CREATOR.
 ****************************************************************************************/

function custoMedicacao_(pedidos, cpfParaCupom, acc, iniISO, fimISO) {
  var resumo = { pedidos: 0, casados: 0, valor: 0, valorCasado: 0 };
  pedidos.forEach(function (p) {
    if (!p.data || p.data < iniISO || p.data > fimISO) return;
    var v = Number(p.gross) || 0;
    var cupom = cpfParaCupom[p.cpf];
    if (cupom) cupom = CFG.CUPOM_ALIAS[cupom] || cupom;
    accAdd_(acc, p.data, cupom || CFG.CUPOM_MEDICACAO_SEM_CREATOR, 'medicacao', v);
    resumo.pedidos++; resumo.valor += v;
    if (cupom) { resumo.casados++; resumo.valorCasado += v; }
  });
  return resumo;
}

/** Mapa CPF (11 dígitos) -> cupom, a partir das linhas de sqlCreatorsCpf_. */
function mapaCpfCreators_(linhas) {
  var m = {};
  linhas.forEach(function (r) {
    var cpf = String(r.cpf || '').replace(/\D/g, '');
    if (cpf.length === 11 && !/^0+$/.test(cpf)) m[cpf] = normCupom_(r.cupom);
  });
  return m;
}
