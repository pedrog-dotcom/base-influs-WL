/****************************************************************************************
 * Sql.gs: consultas no BigQuery (lake, projeto CFG.BQ_PROJECT, dataset prod). Só montagem de
 * texto; a execução (bqSql_) fica em Clients.gs.
 *
 * Tabelas:
 *   prod.fct_orders                 1 linha por pedido (order_context, categoria, datas, is_confirmed)
 *   prod.dim_order_item_discounts   promotion_code / promotion_coupon_code por item do pedido
 *   prod.dim_customer               CPF do cliente (só para o custo de medicação, em memória)
 ****************************************************************************************/

function sqlList_(arr) {
  if (!arr || !arr.length) return 'NULL';   // IN (NULL) não casa nada e mantém o SQL válido
  return arr.map(function (s) { return "'" + String(s).replace(/'/g, "\\'") + "'"; }).join(', ');
}

/**
 * Pedidos com o cupom de influenciador, 1 linha por pedido. Mesma regra do SQL do pace:
 * Voy, Brazil, promotion_code voy_br_coupon_15_influencer, confirmados ou não. Creators
 * híbridas (CUPONS_HIBRIDOS) entram com qualquer promotion code.
 * data     = checkout em Brasília (Orders)
 * data_pag = conclusão do pagamento em Brasília (Acquisitions, quando confirmado)
 * Lê pedidos com checkout OU pagamento a partir de desdeISO.
 *
 * Métricas de categoria (CFG.CATEGORIA_LAKE, ex.: weight_loss), por customer_id, olhando todos os
 * pedidos do cliente no país (qualquer cupom, qualquer order_context):
 *   cat_ord = é o 1º pedido do cliente na categoria (pela data do checkout)
 *   cat_pc  = é o 1º pedido confirmado do cliente na categoria (pela data do checkout)
 *   cat_acq = é o 1º pedido confirmado com pagamento concluído na categoria (pela data do pagamento)
 */
function sqlVendasInfluencer_(desdeISO) {
  var p = '`' + CFG.BQ_PROJECT + '.prod.';
  var conf = "IFNULL(is_confirmed, FALSE)";
  var pag = "payment_completed_at IS NOT NULL";
  var promos = sqlList_(CFG.PROMO_INFLUENCER.map(function (x) { return String(x).toLowerCase(); }));
  return "WITH cat AS (\n" +
    "  SELECT order_id,\n" +
    "    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY system_checkout_at, order_id) = 1 AS cat_ord,\n" +
    "    IF(" + conf + ", ROW_NUMBER() OVER (PARTITION BY customer_id, " + conf + " ORDER BY system_checkout_at, order_id) = 1, FALSE) AS cat_pc,\n" +
    "    IF(" + conf + " AND " + pag + ", ROW_NUMBER() OVER (PARTITION BY customer_id, " + conf + " AND " + pag + "\n" +
    "       ORDER BY payment_completed_at, order_id) = 1, FALSE) AS cat_acq\n" +
    "  FROM " + p + "fct_orders`\n" +
    "  WHERE LOWER(country) = " + sqlList_([CFG.COUNTRY]) + " AND order_taxonomy_business_category = " + sqlList_([CFG.CATEGORIA_LAKE]) + "\n" +
    "    AND system_checkout_at IS NOT NULL\n" +
    "),\n" +
    "disc AS (\n" +
    "  SELECT order_id, UPPER(TRIM(ANY_VALUE(promotion_coupon_code))) AS cupom\n" +
    "  FROM " + p + "dim_order_item_discounts`\n" +
    "  WHERE LOWER(promotion_code) IN (" + promos + ")\n" +
    "     OR UPPER(TRIM(promotion_coupon_code)) IN (" + sqlList_(CFG.CUPONS_HIBRIDOS.map(normCupom_)) + ")\n" +
    "  GROUP BY order_id\n" +
    ")\n" +
    "SELECT o.order_id, o.order_number, d.cupom,\n" +
    "  FORMAT_DATE('%Y-%m-%d', DATE(o.system_checkout_at, 'America/Sao_Paulo')) AS data,\n" +
    "  IF(o.payment_completed_at IS NULL, NULL, FORMAT_DATE('%Y-%m-%d', DATE(o.payment_completed_at, 'America/Sao_Paulo'))) AS data_pag,\n" +
    "  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S', o.system_checkout_at) AS checkout_utc,\n" +
    "  CAST(IFNULL(o.is_confirmed, FALSE) AS STRING) AS is_confirmed,\n" +
    "  o.order_context AS ctx,\n" +
    "  CAST(IFNULL(c.cat_ord, FALSE) AS STRING) AS cat_ord,\n" +
    "  CAST(IFNULL(c.cat_pc, FALSE) AS STRING) AS cat_pc,\n" +
    "  CAST(IFNULL(c.cat_acq, FALSE) AS STRING) AS cat_acq\n" +
    "FROM disc d JOIN " + p + "fct_orders` o USING (order_id)\n" +
    "LEFT JOIN cat c USING (order_id)\n" +
    "WHERE UPPER(o.brand_at_checkout) = " + sqlList_([String(CFG.BRAND).toUpperCase()]) + " AND LOWER(o.country) = " + sqlList_([CFG.COUNTRY]) + "\n" +
    "  AND o.system_checkout_at IS NOT NULL\n" +
    "  AND (DATE(o.system_checkout_at, 'America/Sao_Paulo') >= DATE '" + desdeISO + "'\n" +
    "       OR DATE(o.payment_completed_at, 'America/Sao_Paulo') >= DATE '" + desdeISO + "')\n" +
    "ORDER BY o.system_checkout_at, o.order_number";
}

/**
 * Custo de medicação, direto no lake (BigQuery, manual-data-team.prod). Adaptação do SQL de
 * medicação: pedidos Voy/Brazil com desconto >= MEDICACAO_DESCONTO_MIN, de clientes cuja order
 * de aquisição (mesmo parent_customer_id) usou PROMO_MEDICACAO. Uma linha por pedido (o SQL
 * original repete o gross quando o pedido tem mais de um desconto). Só pedidos com pagamento
 * concluído, que é a data do custo.
 */
function sqlMedicacaoLake_(desdeISO) {
  var p = '`' + CFG.BQ_PROJECT + '.prod.';
  return "SELECT\n" +
    "  o.order_id,\n" +
    "  FORMAT_DATE('%Y-%m-%d', DATE(o.payment_completed_at, 'Brazil/East')) AS data,\n" +
    "  LPAD(REGEXP_REPLACE(IFNULL(c.cpf_number, ''), r'\\D', ''), 11, '0') AS cpf,\n" +
    "  o.gross_revenue_local AS gross,\n" +
    "  o.is_confirmed\n" +
    "FROM " + p + "fct_orders` AS o\n" +
    "LEFT JOIN " + p + "dim_customer` AS c ON o.customer_id = c.customer_id\n" +
    "WHERE IF(o.brand_at_checkout = 'Manual', 'MANUAL', o.brand_at_checkout) = " + sqlList_([CFG.BRAND]) + "\n" +
    "  AND INITCAP(REPLACE(o.country, '_', ' ')) = 'Brazil'\n" +
    "  AND SAFE_DIVIDE(o.discount_local, o.gross_revenue_local) >= " + Number(CFG.MEDICACAO_DESCONTO_MIN) + "\n" +
    "  AND o.payment_completed_at IS NOT NULL\n" +
    "  AND DATE(o.payment_completed_at, 'Brazil/East') >= DATE '" + desdeISO + "'\n" +
    "  AND EXISTS (\n" +
    "    SELECT 1 FROM " + p + "fct_orders` AS a\n" +
    "    JOIN " + p + "dim_order_item_discounts` AS d ON d.order_id = a.order_id\n" +
    "    WHERE a.parent_customer_id = o.parent_customer_id AND a.is_acquisition_order\n" +
    "      AND d.promotion_code IN (" + sqlList_(CFG.PROMO_MEDICACAO) + "))";
}
