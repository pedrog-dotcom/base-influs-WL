/****************************************************************************************
 * Custos.gs: custo fixo, comissão, campanha e plataformas, em R$ por dia e cupom.
 *
 * Entrada "iris" (montada em Iris.gs a partir do Supabase):
 *   { refPorInfluencer: {influencer_id: CUPOM}, influencerPorRef: {CUPOM: influencer_id},
 *     contratos: [contracts WL], termos: {contract_id: [contract_terms_ranges ordenados]},
 *     ciclos: [content_cycles WL], pecas: [content_pieces WL],
 *     campanhas: [commission_campaigns ativas WL], campanhaContratos: {campaign_id: [contract_id]} }
 *
 * Valores do Supabase vêm em centavos; aqui tudo vira reais com precisão cheia.
 ****************************************************************************************/

/* ---------------- termos vigentes ---------------- */

function termosNaData_(iris, contractId, dataISO) {
  var lista = iris.termos[contractId] || [];
  for (var i = 0; i < lista.length; i++) {
    var t = lista[i];
    if (t.valid_from <= dataISO && (!t.valid_until || t.valid_until > dataISO)) return t;
  }
  return null;
}

function precoFaixa_(bandas, ordinal) {
  if (!bandas || !bandas.length) return 0;
  var melhor = null;
  bandas.forEach(function (b) {
    var de = Number(b.from);
    if (de <= ordinal && (melhor === null || de > Number(melhor.from))) melhor = b;
  });
  return melhor ? Number(melhor.cents) || 0 : 0;
}

/* ---------------- custo fixo ---------------- */

function custoFixo_(iris, acc, iniISO, fimISO) {
  var ciclosPorContrato = {};
  iris.ciclos.forEach(function (cy) {
    (ciclosPorContrato[cy.contract_id] = ciclosPorContrato[cy.contract_id] || {})[String(cy.reference_month).slice(0, 10)] = cy;
  });

  if (CFG.FIXO_MODO === 'DIARIZADO') {
    iris.contratos.forEach(function (c) {
      var cupom = iris.refPorInfluencer[c.influencer_id];
      if (!cupom || !c.starts_on || CFG.CUPONS_IGNORAR.indexOf(cupom) >= 0) return;
      var ciclos = ciclosPorContrato[c.id] || {};
      var statusOk = CFG.FIXO_STATUS_CONTRATO.indexOf(c.status) >= 0;
      // Contrato sem fim: o mês corrente vai até o último dia do mês (não até ontem),
      // senão o fixo mensal inteiro cairia nos dias já decorridos.
      var fimContrato = c.ends_on || '9999-12-31';
      for (var m = inicioMes_(c.starts_on); m <= inicioMes_(minIso_(fimContrato, fimISO)); m = somaDias_(fimMes_(m), 1)) {
        var ciclo = ciclos[m];
        if (!statusOk && !ciclo) continue;
        var a = maxIso_(m, c.starts_on), b = minIso_(fimMes_(m), fimContrato);
        if (a > b) continue;
        var t = termosNaData_(iris, c.id, a) || termosNaData_(iris, c.id, b);
        var centavos = t ? Number(t.fixed_monthly_cents)
          : (ciclo && ciclo.contract_monthly_fixed_cents_snapshot != null ? Number(ciclo.contract_monthly_fixed_cents_snapshot)
          : Number(c.monthly_fixed_cents || 0));
        if (!centavos) continue;
        var diario = centavos / 100 / diasEntre_(a, b);
        for (var d = maxIso_(a, iniISO); d <= minIso_(b, fimISO); d = somaDias_(d, 1)) {
          accAdd_(acc, d, cupom, 'fixo', diario);
        }
      }
    });
  }

  // Peças: valor próprio (sempre) e rateio por peça (modo PECA), na data de publicação.
  var cicloPorId = {}, contratoPorId = {};
  iris.ciclos.forEach(function (cy) { cicloPorId[cy.id] = cy; });
  iris.contratos.forEach(function (c) { contratoPorId[c.id] = c; });
  var posicoes = {};
  iris.pecas.forEach(function (p) {
    if (p.status !== 'postergada' && p.unit_value_cents == null) posicoes[p.cycle_id] = (posicoes[p.cycle_id] || 0) + 1;
  });
  iris.pecas.forEach(function (p) {
    if (p.status !== 'entregue' || p.is_cancelled) return;
    var cy = cicloPorId[p.cycle_id]; if (!cy) return;
    var c = contratoPorId[cy.contract_id]; if (!c) return;
    var cupom = iris.refPorInfluencer[c.influencer_id]; if (!cupom) return;
    var dia = tsParaDiaISO_(p.published_at || p.delivered_at);
    if (!dia || dia < iniISO || dia > fimISO) return;
    if (p.unit_value_cents != null) {
      accAdd_(acc, dia, cupom, 'fixo', Number(p.unit_value_cents) / 100);
    } else if (CFG.FIXO_MODO === 'PECA') {
      var mes = String(cy.reference_month).slice(0, 10);
      var t = termosNaData_(iris, c.id, mes) || termosNaData_(iris, c.id, maxIso_(mes, c.starts_on));
      var centavos = t ? Number(t.fixed_monthly_cents) : Number(cy.contract_monthly_fixed_cents_snapshot || c.monthly_fixed_cents || 0);
      if (centavos && posicoes[p.cycle_id]) accAdd_(acc, dia, cupom, 'fixo', centavos / 100 / posicoes[p.cycle_id]);
    }
  });
}

/* ---------------- comissão e campanhas ---------------- */

/**
 * Replica a parte de vendas do calcular_pagamento da Irís, usando as vendas da Nekt:
 *  - venda elegível: pedido com o cupom da influenciadora e pagamento concluído
 *  - contrato da venda: o de starts_on mais recente cuja janela contém a data do checkout
 *  - ordinal por contrato e mês (tier_counter_scope 'month') ou por contrato ('contract')
 *  - preço da unidade: faixa de sale_bands com maior "from" <= ordinal
 * Campanhas ativas ligadas ao contrato (custo de campanha):
 *  - bonus_por_venda: per_sale_cents por venda no período
 *  - bonus_meta: bonus_cents no dia em que as vendas do período batem goal_sales
 *  - troca_faixa: depois da meta, a diferença entre a faixa da campanha e a faixa padrão
 *    (a comissão fica com o preço padrão, a diferença vai para campanha)
 */
function comissaoECampanha_(iris, vendas, acc, iniISO, fimISO) {
  var primeiraPublicacao = {}, cicloContrato = {};
  iris.ciclos.forEach(function (cy) { cicloContrato[cy.id] = cy.contract_id; });
  iris.pecas.forEach(function (p) {
    var cid = cicloContrato[p.cycle_id];
    var d = tsParaDiaISO_(p.published_at);
    if (cid && d && (!primeiraPublicacao[cid] || d < primeiraPublicacao[cid])) primeiraPublicacao[cid] = d;
  });

  var contratosPorInfluencer = {};
  iris.contratos.forEach(function (c) {
    var ini = (c.previous_contract_id || CFG.COMISSAO_JANELA === 'CONTRATO') ? c.starts_on : primeiraPublicacao[c.id];
    if (!ini) return;
    (contratosPorInfluencer[c.influencer_id] = contratosPorInfluencer[c.influencer_id] || []).push({
      c: c, ini: ini, fim: c.commission_extended_until || c.ends_on || null
    });
  });

  var campanhasPorContrato = {};
  iris.campanhas.forEach(function (k) {
    (iris.campanhaContratos[k.id] || []).forEach(function (cid) {
      (campanhasPorContrato[cid] = campanhasPorContrato[cid] || []).push(k);
    });
  });

  var ordinal = {}, ordCampanha = {}, metaPaga = {};
  var ordenadas = vendas.filter(function (v) { return v.pago; }).slice().sort(function (a, b) {
    return a.checkout_utc < b.checkout_utc ? -1 : a.checkout_utc > b.checkout_utc ? 1 : String(a.order_number) < String(b.order_number) ? -1 : 1;
  });

  ordenadas.forEach(function (v) {
    var infl = iris.influencerPorRef[v.cupom];
    if (!infl) return;
    var cand = (contratosPorInfluencer[infl] || []).filter(function (j) {
      return v.data >= j.ini && (!j.fim || v.data <= j.fim);
    });
    if (!cand.length) return;
    cand.sort(function (a, b) { return a.c.starts_on < b.c.starts_on ? 1 : -1; });
    var c = cand[0].c;

    var tMes = termosNaData_(iris, c.id, inicioMes_(v.data)) || termosNaData_(iris, c.id, v.data);
    var escopo = (tMes && tMes.tier_counter_scope) || 'month';
    var part = escopo === 'contract' ? c.id : c.id + ':' + inicioMes_(v.data);
    var ord = ordinal[part] = (ordinal[part] || 0) + 1;

    var t = termosNaData_(iris, c.id, v.data);
    var padrao = precoFaixa_(t && t.sale_bands, ord);
    var grava = v.data >= iniISO && v.data <= fimISO;
    if (grava) accAdd_(acc, v.data, v.cupom, 'comissao', padrao / 100);

    (campanhasPorContrato[c.id] || []).forEach(function (k) {
      if (v.data < String(k.starts_on).slice(0, 10) || v.data > String(k.ends_on).slice(0, 10)) return;
      var kk = k.id + ':' + c.id;
      var n = ordCampanha[kk] = (ordCampanha[kk] || 0) + 1;
      var extra = 0;
      if (k.kind === 'bonus_por_venda') {
        extra = Number(k.per_sale_cents || 0);
      } else if (k.kind === 'bonus_meta') {
        if (!metaPaga[kk] && k.goal_sales != null && n >= Number(k.goal_sales)) { metaPaga[kk] = true; extra = Number(k.bonus_cents || 0); }
      } else if (k.kind === 'troca_faixa') {
        if (k.goal_sales != null && n > Number(k.goal_sales)) extra = precoFaixa_(k.switch_bands, n) - padrao;
      }
      if (grava && extra) accAdd_(acc, v.data, v.cupom, 'campanha', extra / 100);
    });
  });
}

/* ---------------- plataformas (aba INPUT_PLATAFORMAS) ---------------- */

/**
 * linhas: [{plataforma, cupom, inicio, fim, mensal, diario}]
 * Custo diário = "Valor diário" se preenchido; senão "Valor mensal" / dias do mês.
 * Vai do início até o fim informado (vazio = fim do mês do início), como no Cost - Extra.
 */
function custoPlataformas_(linhas, acc, iniISO, fimISO) {
  linhas.forEach(function (l) {
    if (!l.inicio || (!l.mensal && !l.diario)) return;
    var cupom = normCupom_(l.cupom) || CFG.CUPOM_GERAL;
    var fim = l.fim || fimMes_(l.inicio);
    for (var d = maxIso_(l.inicio, iniISO); d <= minIso_(fim, fimISO); d = somaDias_(d, 1)) {
      var v = l.diario ? Number(l.diario) : Number(l.mensal) / diasNoMes_(d);
      accAdd_(acc, d, cupom, 'plataformas', v);
    }
  });
}
