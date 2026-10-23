# Base Influencers WL (Voy BR)

> Repositório **Base-Influencers-WL**. Apps Script vinculado a uma planilha Google que monta a base diária de influenciadores da WL: custos da Irís (Supabase), vendas e medicação do lake (Nekt) e funil do Mixpanel (Nekt), em uma linha por **Data x Cupom**.

## Saída: aba `BASE_INFLUENCERS_WL`

| Coluna | Fonte e regra |
|---|---|
| Data | Data em Brasília (checkout para vendas, 1º passo da sessão para funil, dia de competência para custos) |
| Cupom | `promotion_coupon_code` do lake = `utm_campaign` do Mixpanel = `referral_code` da Irís, em maiúsculas |
| Custo fixo | Irís: `contract_terms_ranges.fixed_monthly_cents` (fallback: snapshot do ciclo e `contracts.monthly_fixed_cents`), diarizado pelos dias de contrato ativos no mês. Peças com `unit_value_cents` entram na data de publicação. `FIXO_MODO = 'PECA'` troca pelo rateio por peça entregue (regra de pagamento) |
| Custo de comissão | Irís: `sale_bands` dos termos vigentes, por ordinal de venda no mês (`tier_counter_scope`), aplicado às vendas pagas da Nekt. Mesma lógica do `calcular_pagamento` |
| Custo de plataformas | Aba `INPUT_PLATAFORMAS` (manual): valor diário ou mensal / dias do mês, do início até o fim (vazio = fim do mês). Sem cupom vai para `(GERAL)` |
| Custo de medicação | Nekt: gross revenue de todas as orders confirmadas dos clientes cuja order de aquisição usou `voy_br_influvoy_4_99off` ou `voy_br_influvoy_99`. Linha `(MEDICACAO INFLUVOY)` |
| Custo de campanha | Irís: `commission_campaigns` ativas (`bonus_por_venda`, `bonus_meta`, `troca_faixa`: a diferença sobre a faixa padrão) |
| Custo total | Soma dos cinco custos |
| Sessões / Quest started / Recommendations / Checkout started | Mixpanel bruto (`manual_default.mixpanel_events`), réplica do board "Voy Saude BR Full funnel": sessões com Loaded a Page (topo de funil) → Questionnaire Started → Recommendations Loaded / Checkout Started na mesma sessão; filtro last touch `utm_source` in (influencer, Influencers), breakdown por `utm_campaign` |
| Orders | Nekt: pedidos Voy/Brazil com `promotion_code = voy_br_coupon_15_influencer` (todos os contextos, confirmados ou não), mesma regra do SQL do lake |
| Acquisitions | Orders com `order_context = 'acquisition'` e `is_confirmed` |

Valores com precisão cheia; arredondamento só no formato de exibição.

## Arquivos

- **Config.gs**: parâmetros (datas, promo codes, modos de fixo e comissão, regras do funil, abas)
- **Clients.gs**: Supabase via PostgREST (paginado) e Nekt via MCP `execute_sql` (mesmo cliente do CRM-WL)
- **Sql.gs**: SQLs da Nekt (vendas, medicação, funil)
- **Iris.gs**: leitura das tabelas da Irís filtradas para `weight_loss`
- **Custos.gs**: fixo, comissão, campanha e plataformas (lógica pura, testável fora do Apps Script)
- **Util.gs**: datas ISO e acumulador
- **Base.gs**: orquestração, cache do funil, backfill, log, alerta e gatilho
- **Menu.gs**: menu "Base Influencers" e diagnósticos

## Instalação

1. Crie uma planilha, abra Extensões > Apps Script e copie os arquivos (ou use `clasp push`). Deixe a planilha em pt-BR para a vírgula decimal.
2. Propriedades do script:
   - `SUPABASE_URL` = `https://eupkvybriepteduevrpr.supabase.co`
   - `SUPABASE_SERVICE_KEY` = service_role key do projeto IRIS
   - `NEKT_MCP_TOKEN` = token de MCP da Nekt (o do CRM-WL serve)
   - `ALERT_EMAIL` (opcional)
3. Menu **Base Influencers > Testar conexões**.
4. **Backfill do funil desde DATA_INICIO** (continua sozinho por gatilho até terminar; ver `_log`).
5. **Reconstruir só a base**.
6. **Instalar gatilho diário** (≈ 7h40: funil D-1..D-3 + base inteira).

## Plug-and-play da comissão

`contract_terms.sale_bands` e `commission_campaigns` estão vazias hoje, então Custo de comissão e Custo de campanha saem zerados. Nada precisa mudar no código quando forem preenchidas: a próxima execução já calcula. Formatos esperados (os mesmos do `calcular_pagamento`):

```json
sale_bands:    [{"from": 1, "cents": 20000}, {"from": 11, "cents": 25000}, {"from": 36, "cents": 30000}, {"from": 81, "cents": 35000}]
switch_bands:  [{"from": 1, "cents": 40000}]
```

`Diagnóstico da Irís` no menu mostra quantos termos já têm faixa e quantas campanhas estão ativas.

## Premissas e limites

- **Janela da comissão** (`COMISSAO_JANELA = 'IRIS'`): igual à Irís, a comissão só começa na 1ª peça publicada do contrato (ou em `starts_on` se o contrato renova outro). Hoje quase todas as peças estão `sem_data`, então mesmo com faixas preenchidas a comissão fica zerada até haver publicação. `'CONTRATO'` usa `starts_on`.
- **Vendas da comissão**: pedidos com pagamento concluído (`payment_completed_at`), 1 unidade por pedido, contados pela ordem do checkout. A Irís usa a própria sincronização (`attributed_sales`), que hoje registra menos pedidos que o lake (ex.: out/26: 339 na Irís x 457 pagos no lake), porque só casa cupons de influenciadoras com contrato. A base segue o lake.
- **troca_faixa**: o ordinal da campanha conta só vendas dentro do período da campanha.
- **Custo fixo diarizado** cobre contratos `active`/`ended` em todos os meses do contrato e `paused` só nos meses com ciclo aberto. Pode diferir do pago quando há peças glosadas.
- **Medicação** não tem cupom de influenciadora: os cupons INFLUVOY são aleatórios por cliente, então o custo fica na linha `(MEDICACAO INFLUVOY)`.
- **Funil**:
  - O filtro "Voy BR top of funnel filter for acquisitions" não é acessível pela API; a réplica usa domínio `*.voysaude.com.br` e país BR (`CFG.FUNIL`). Ajustar se o filtro tiver mais regras e conferir um dia contra o board (`debugFunilDia`).
  - Sessão = 30 min de inatividade entre os 4 eventos do funil; last touch olha só `LOOKBACK_HORAS` (24h) para trás. Usuário que voltou depois disso sem UTM não entra como influencer aqui, mas pode entrar no Mixpanel.
  - Custo de leitura: ~30 GB por dia de Mixpanel. O incremental diário lê ~4 dias (~120 GB); o backfill de jun/26 em diante lê cerca de 6 TB uma única vez (blocos de 2 dias + 1 dia de lookback).
- Cupons que aparecem no lake ou no Mixpanel sem cadastro na Irís continuam na base (sem custo fixo).

## Recebe dados de / entrega para

- Supabase IRIS (`eupkvybriepteduevrpr`): influencers, contracts, contract_terms_ranges, content_cycles, content_pieces, commission_campaigns, commission_campaign_contracts
- Nekt: `webhook_v2_orders_lake`, `webhook_v2_order_discounts_lake` (alimentadas pelo Nekt-brazil a partir do lake) e `mixpanel_events`
- Entrega: aba `BASE_INFLUENCERS_WL` da planilha vinculada (consumidor a definir; candidato natural: Base-Final-WL / Pacing-WL)

```
Irís (Supabase) ----------------------------+
Nekt-brazil (lake) --> orders/discounts ----+--> Base-Influencers-WL --> aba BASE_INFLUENCERS_WL
Mixpanel --> Nekt mixpanel_events ----------+
```

> Manter esta documentação: ao ligar a base a outro repositório, atualizar este README e o mapa (README/RepoMap.gs) dos repositórios envolvidos.
