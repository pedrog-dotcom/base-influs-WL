/****************************************************************************************
 * Sql.gs: consultas na Nekt (BigQuery). Só montagem de texto; a execução fica nos módulos.
 *
 * Tabelas (camada default, alimentadas pelo Nekt-brazil a partir do lake):
 *   manual_default.webhook_v2_orders_lake            1 linha por envio do webhook: deduplicada
 *                                                    pela última _nekt_webhook_received_at
 *   manual_default.webhook_v2_order_discounts_lake   promotion_code / promotion_coupon_code
 *   manual_default.mixpanel_events                   eventos brutos (properties em JSON)
 ****************************************************************************************/

function sqlList_(arr) {
  return arr.map(function (s) { return "'" + String(s).replace(/'/g, "\\'") + "'"; }).join(', ');
}

function sqlOrdersCte_() {
  return "orders AS (\n" +
    "  SELECT * FROM `manual_default`.`webhook_v2_orders_lake`\n" +
    "  WHERE brand_at_checkout = " + sqlList_([CFG.BRAND]) + " AND LOWER(country) = " + sqlList_([CFG.COUNTRY]) + "\n" +
    "  QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY _nekt_webhook_received_at DESC) = 1\n" +
    ")";
}

/**
 * Pedidos com o cupom de influenciador, 1 linha por pedido. Mesma regra do SQL do pace:
 * Voy, Brazil, promotion_code voy_br_coupon_15_influencer, confirmados ou não. Creators
 * híbridas (CUPONS_HIBRIDOS) entram com qualquer promotion code.
 * data     = checkout em Brasília (Orders)
 * data_pag = conclusão do pagamento em Brasília (Acquisitions, quando confirmado)
 * Lê pedidos com checkout OU pagamento a partir de desdeISO.
 */
function sqlVendasInfluencer_(desdeISO) {
  return "WITH " + sqlOrdersCte_() + ",\n" +
    "disc AS (\n" +
    "  SELECT order_id, UPPER(TRIM(ANY_VALUE(promotion_coupon_code))) AS cupom\n" +
    "  FROM `manual_default`.`webhook_v2_order_discounts_lake`\n" +
    "  WHERE promotion_code IN (" + sqlList_(CFG.PROMO_INFLUENCER) + ")\n" +
    "     OR UPPER(TRIM(promotion_coupon_code)) IN (" + sqlList_(CFG.CUPONS_HIBRIDOS.map(normCupom_)) + ")\n" +
    "  GROUP BY order_id\n" +
    ")\n" +
    "SELECT o.order_id, o.order_number, d.cupom,\n" +
    "  FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP(o.system_checkout_at), 'America/Sao_Paulo')) AS data,\n" +
    "  IF(NULLIF(o.payment_completed_at, '') IS NULL, NULL,\n" +
    "     FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP(o.payment_completed_at), 'America/Sao_Paulo'))) AS data_pag,\n" +
    "  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S', TIMESTAMP(o.system_checkout_at)) AS checkout_utc,\n" +
    "  CAST(o.is_confirmed AS STRING) AS is_confirmed\n" +
    "FROM disc d JOIN orders o USING (order_id)\n" +
    "WHERE NULLIF(o.system_checkout_at, '') IS NOT NULL\n" +
    "  AND (DATE(TIMESTAMP(o.system_checkout_at), 'America/Sao_Paulo') >= DATE '" + desdeISO + "'\n" +
    "       OR (NULLIF(o.payment_completed_at, '') IS NOT NULL\n" +
    "           AND DATE(TIMESTAMP(o.payment_completed_at), 'America/Sao_Paulo') >= DATE '" + desdeISO + "'))\n" +
    "ORDER BY o.system_checkout_at, o.order_number";
}

/**
 * Funil por dia e cupom (utm_campaign do last touch no 1º passo), contado em sessões.
 * Sessão: eventos do mesmo distinct_id com intervalo <= SESSAO_MIN.
 * Last touch: último utm_source (com o utm_campaign do mesmo evento) visto até o evento.
 * Lê de (início - LOOKBACK_HORAS) até o fim do dia final, mas só devolve sessões cujo
 * 1º passo cai entre iniISO e fimISO (datas de Brasília, inclusive).
 */
function sqlFunil_(iniISO, fimISO) {
  var F = CFG.FUNIL;
  var t = '`' + F.TABELA.replace('.', '`.`') + '`';
  var iniTs = "TIMESTAMP_SUB(TIMESTAMP('" + iniISO + " 00:00:00', 'America/Sao_Paulo'), INTERVAL " + F.LOOKBACK_HORAS + " HOUR)";
  var fimTs = "TIMESTAMP_ADD(TIMESTAMP('" + fimISO + " 00:00:00', 'America/Sao_Paulo'), INTERVAL 1 DAY)";
  var srcs = sqlList_(F.UTM_SOURCES.map(function (s) { return String(s).toLowerCase(); }));
  return "WITH ev AS (\n" +
    "  SELECT distinct_id, event, event_time,\n" +
    "    LOWER(JSON_VALUE(properties, '$.current_domain')) AS dom,\n" +
    "    JSON_VALUE(properties, '$.mp_country_code') AS cc,\n" +
    "    NULLIF(LOWER(TRIM(JSON_VALUE(properties, '$.utm_source'))), '') AS src,\n" +
    "    NULLIF(UPPER(TRIM(JSON_VALUE(properties, '$.utm_campaign'))), '') AS camp\n" +
    "  FROM " + t + "\n" +
    "  WHERE event_time >= " + iniTs + " AND event_time < " + fimTs + "\n" +
    "    AND event IN (" + sqlList_([F.EV_PAGINA, F.EV_QUEST, F.EV_RECS, F.EV_CHECKOUT]) + ")\n" +
    "), t AS (\n" +
    "  SELECT *,\n" +
    "    LAST_VALUE(IF(src IS NULL, NULL, CONCAT(src, '|', IFNULL(camp, ''))) IGNORE NULLS) OVER w AS touch,\n" +
    "    IF(LAG(event_time) OVER (PARTITION BY distinct_id ORDER BY event_time) IS NULL\n" +
    "       OR TIMESTAMP_DIFF(event_time, LAG(event_time) OVER (PARTITION BY distinct_id ORDER BY event_time), SECOND) > " + (F.SESSAO_MIN * 60) + ", 1, 0) AS novo\n" +
    "  FROM ev\n" +
    "  WINDOW w AS (PARTITION BY distinct_id ORDER BY event_time ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)\n" +
    "), s AS (\n" +
    "  SELECT *, SUM(novo) OVER (PARTITION BY distinct_id ORDER BY event_time ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS sid\n" +
    "  FROM t\n" +
    "), sess AS (\n" +
    "  SELECT distinct_id, sid,\n" +
    "    ARRAY_AGG(IF(event = " + sqlList_([F.EV_PAGINA]) + " AND ENDS_WITH(IFNULL(dom, ''), " + sqlList_([F.DOMINIO_SUFIXO]) + ") AND cc = " + sqlList_([F.PAIS]) + ",\n" +
    "      STRUCT(event_time AS ts, touch AS touch), NULL) IGNORE NULLS ORDER BY event_time LIMIT 1)[SAFE_OFFSET(0)] AS p1,\n" +
    "    ARRAY_AGG(STRUCT(event, event_time)) AS evs\n" +
    "  FROM s GROUP BY 1, 2\n" +
    "), f AS (\n" +
    "  SELECT DATE(p1.ts, 'America/Sao_Paulo') AS dia,\n" +
    "    SPLIT(p1.touch, '|')[SAFE_OFFSET(0)] AS src,\n" +
    "    NULLIF(SPLIT(p1.touch, '|')[SAFE_OFFSET(1)], '') AS camp,\n" +
    "    (SELECT MIN(e.event_time) FROM UNNEST(evs) e WHERE e.event = " + sqlList_([F.EV_QUEST]) + " AND e.event_time >= p1.ts) AS q_ts,\n" +
    "    evs\n" +
    "  FROM sess WHERE p1.ts IS NOT NULL\n" +
    ")\n" +
    "SELECT FORMAT_DATE('%Y-%m-%d', dia) AS data, IFNULL(camp, '(SEM UTM_CAMPAIGN)') AS cupom,\n" +
    "  COUNT(*) AS sessoes,\n" +
    "  COUNTIF(q_ts IS NOT NULL) AS quest,\n" +
    "  COUNTIF(EXISTS(SELECT 1 FROM UNNEST(evs) e WHERE e.event = " + sqlList_([F.EV_RECS]) + " AND e.event_time >= q_ts)) AS recs,\n" +
    "  COUNTIF(EXISTS(SELECT 1 FROM UNNEST(evs) e WHERE e.event = " + sqlList_([F.EV_CHECKOUT]) + " AND e.event_time >= q_ts)) AS checkout\n" +
    "FROM f\n" +
    "WHERE src IN (" + srcs + ") AND dia BETWEEN DATE '" + iniISO + "' AND DATE '" + fimISO + "'\n" +
    "GROUP BY 1, 2 ORDER BY 1, 2";
}
