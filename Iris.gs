/****************************************************************************************
 * Iris.gs: carrega do Supabase (projeto IRIS) o que a base precisa, já filtrado para WL.
 *
 * Tabelas: categories, influencers, contracts, contract_terms_ranges (view: só termos
 * 'ativa', com valid_until), content_cycles, content_pieces, commission_campaigns,
 * commission_campaign_contracts.
 *
 * Plug-and-play: sale_bands (contract_terms) e commission_campaigns estão vazias hoje;
 * assim que forem preenchidas na Irís, a próxima execução já calcula comissão e campanha.
 ****************************************************************************************/

function carregarIris_() {
  var cat = sbSelect_('categories', 'id,slug', 'slug=eq.' + CFG.CATEGORIA_IRIS);
  if (!cat.length) throw new Error('Categoria ' + CFG.CATEGORIA_IRIS + ' não encontrada na Irís.');
  var catId = cat[0].id;

  var influencers = sbSelect_('influencers', 'id,name,referral_code,archived_at');
  var contratos = sbSelect_('contracts',
    'id,influencer_id,category_id,monthly_fixed_cents,pieces_per_cycle,starts_on,ends_on,status,previous_contract_id,commission_extended_until',
    'category_id=eq.' + catId);
  var idsContrato = {};
  contratos.forEach(function (c) { idsContrato[c.id] = true; });

  var termos = {};
  sbSelect_('contract_terms_ranges', 'id,contract_id,valid_from,valid_until,fixed_monthly_cents,sale_bands,tier_counter_scope,agency_share_bps')
    .forEach(function (t) {
      if (!idsContrato[t.contract_id]) return;
      (termos[t.contract_id] = termos[t.contract_id] || []).push(t);
    });
  Object.keys(termos).forEach(function (k) {
    termos[k].sort(function (a, b) { return a.valid_from < b.valid_from ? -1 : 1; });
  });

  var ciclos = sbSelect_('content_cycles', 'id,contract_id,reference_month,contract_monthly_fixed_cents_snapshot,contract_pieces_per_cycle_snapshot')
    .filter(function (cy) { return idsContrato[cy.contract_id]; });
  var idsCiclo = {};
  ciclos.forEach(function (cy) { idsCiclo[cy.id] = true; });

  var pecas = sbSelect_('content_pieces', 'id,cycle_id,status,is_cancelled,published_at,delivered_at,unit_value_cents')
    .filter(function (p) { return idsCiclo[p.cycle_id]; });

  var campanhas = sbSelect_('commission_campaigns', 'id,name,kind,starts_on,ends_on,per_sale_cents,goal_sales,bonus_cents,switch_bands,status',
    'status=eq.ativa&category_id=eq.' + catId);
  var campanhaContratos = {};
  sbSelect_('commission_campaign_contracts', 'campaign_id,contract_id').forEach(function (r) {
    (campanhaContratos[r.campaign_id] = campanhaContratos[r.campaign_id] || []).push(r.contract_id);
  });

  // Cupom = referral_code da influenciadora (em maiúsculas, igual ao promotion_coupon_code do lake).
  var comContratoWL = {};
  contratos.forEach(function (c) { comContratoWL[c.influencer_id] = true; });
  var refPorInfluencer = {}, influencerPorRef = {}, nomePorRef = {};
  influencers.forEach(function (i) {
    var ref = normCupom_(i.referral_code);
    if (!ref || !comContratoWL[i.id]) return;
    refPorInfluencer[i.id] = ref;
    influencerPorRef[ref] = i.id;
    nomePorRef[ref] = i.name;
  });

  return {
    categoriaId: catId,
    refPorInfluencer: refPorInfluencer, influencerPorRef: influencerPorRef, nomePorRef: nomePorRef,
    contratos: contratos, termos: termos, ciclos: ciclos, pecas: pecas,
    campanhas: campanhas, campanhaContratos: campanhaContratos
  };
}
