# Base Influencers WL (Voy BR)

> Repositório **base-influs-WL** (pedrog-dotcom). Apps Script vinculado a uma planilha Google que monta a base diária de influenciadores da WL: custos e conteúdos da Irís (Supabase), vendas do lake (Nekt), custo de medicação do lake (BigQuery) e funil do Mixpanel (Query API, report do board), em duas abas: a base geral em formato longo (uma linha por **Data x Cupom x Métrica**, a partir de 21/10/2026) e a base de conteúdos.

## Saída 1: aba `BASE_INFLUENCERS_WL` (base geral, formato longo)

Colunas: `Data | Channel Group | Channel | Subchannel | Metrica | Valor`. Channel Group = `Influence`, Channel = `Influencers`, Subchannel = cupom. Só valores diferentes de zero, a partir de `CFG.BASE_DESDE` (21/10/2026). Data em `yyyy-mm-dd`.

| Metrica | Regra |
|---|---|
| Sessions, Quest started, Recommendations, Checkout started | funil do Mixpanel (ver abaixo) |
| Orders | pedidos com o cupom, na data do checkout |
| Payment Completed | pedidos com o cupom que tiveram o pagamento concluído, na data do checkout (subconjunto de Orders) |
| Acquisitions | pedidos confirmados, na data do pagamento |
| Spend | custo fixo + comissão + campanha de incentivo + medicação |

Regras de cada componente:


| Coluna | Fonte e regra |
|---|---|
| Data | Data em Brasília: checkout para Orders, conclusão do pagamento para Acquisitions, 1º passo da sessão para funil, dia de competência para custos |
| Cupom | `promotion_coupon_code` do lake = `utm_campaign` do Mixpanel = `referral_code` da Irís, em maiúsculas |
| Custo fixo | Irís, valor mensal do contrato (`FIXO_MODO = 'DIARIZADO'`): em cada mês ativo, o fixo mensal é dividido igualmente pelos dias de contrato no mês, de max(1º dia do mês, início) até min(último dia do mês, fim). Contrato que começa no meio do mês: fixo mensal / dias do início até o fim do mês. Contrato ativo sem data de fim segue mês a mês, com o fixo mensal espalhado por todos os dias do mês. Peças com `unit_value_cents` entram na data de publicação. Alternativas: `'CONTRATO'` (total do contrato / todos os dias) e `'PECA'` (regra de pagamento) |
| Custo de comissão | Irís: `sale_bands` dos termos vigentes, por ordinal de venda no mês (`tier_counter_scope`), aplicado às vendas pagas da Nekt. Mesma lógica do `calcular_pagamento` |
| Custo de campanha de incentivo | Irís: `commission_campaigns` ativas ou encerradas (`bonus_por_venda`, `bonus_meta`, `troca_faixa`: a diferença sobre a faixa padrão) |
| Custo de medicação | Lake no BigQuery (`manual-data-team.prod`): gross revenue dos pedidos Voy/Brazil com desconto >= 90% (vendas gratuitas) de clientes cuja order de aquisição usou `voy_br_influvoy_4_99off` ou `voy_br_influvoy_99`, na data de conclusão do pagamento. O CPF do cliente (`dim_customer.cpf_number`) é cruzado com o CPF do creator em `manual_silver.creators` (Nekt) e o custo vai para o `referral_code` do creator. Sem creator correspondente: linha `(MEDICACAO SEM CREATOR)`. Nenhum CPF é gravado na planilha |
| Sessões / Quest started / Recommendations / Checkout started | Mixpanel direto pela Query API (Insights) com service account: report 93726547 do board "Voy Saude BR Full funnel" (projeto 2829492, EU), breakdown por "Last touch UTM campaign name". Uma chamada traz o período salvo no report (recomendado: últimos 30 dias); a cada execução só os dias dentro desse período são regravados no `_cache_funil`, e os dias mais antigos ficam guardados. Dias no fuso do projeto do Mixpanel. Cupons além do limite de 200 segmentos do report caem em `(OUTROS NO MIXPANEL)`. `CFG.FUNIL.FONTE = 'NEKT'` volta para o SQL no `mixpanel_events` |
| Orders | Nekt, regra do SQL do pace: pedidos Voy/Brazil com `promotion_code = voy_br_coupon_15_influencer`, todos os contextos e status, na data do checkout. Creators híbridas (`CUPONS_HIBRIDOS`: ISAVOY, CARINAVOY/CARINA40) entram com qualquer promotion code |
| Acquisitions | Mesmos pedidos, só os confirmados (`is_confirmed`, qualquer `order_context`), na data de conclusão do pagamento |

Valores com precisão cheia; arredondamento só no formato de exibição.

## Saída 2: aba `BASE_CONTEUDOS_WL` (conteúdos)

| Coluna | Fonte e regra |
|---|---|
| Data | Data de publicação da peça em Brasília (`published_at`; sem ela, `delivered_at`) |
| Cupom | `referral_code` da influenciadora dona do contrato da peça |
| Plataforma | Instagram, TikTok, YouTube, Twitch, WhatsApp, Podcast (ou Outras), a partir de `content_pieces.format` |
| Formato | Reels, Feed, Stories, Transmissão, Vídeo, Shorts, Inserção, Live, Envio, Episódio (ou Não informado) |
| Quantidade | Peças com status `entregue` e não canceladas |

Mapeamento formato da Irís → plataforma/formato em `CFG.FORMATOS`.

## Arquivos

- **Config.gs**: parâmetros (datas, promo codes, modos de fixo e comissão, regras do funil, abas)
- **Clients.gs**: Supabase via PostgREST (paginado), Nekt via MCP `execute_sql` (mesmo cliente do CRM-WL) e BigQuery (serviço avançado)
- **Sql.gs**: SQLs da Nekt (vendas, funil, CPF dos creators) e do lake (medicação)
- **Iris.gs**: leitura das tabelas da Irís filtradas para `weight_loss`
- **Custos.gs**: fixo, comissão e campanha de incentivo (lógica pura, testável fora do Apps Script)
- **Medicacao.gs**: cruzamento CPF do cliente x CPF do creator e custo de medicação por cupom
- **Conteudos.gs**: base de conteúdos (Data, Cupom, Plataforma, Formato, Quantidade)
- **Util.gs**: datas ISO e acumulador
- **Mixpanel.gs**: cliente da Query API do Mixpanel (service account em `MIXPANEL_SA_USER`, `MIXPANEL_SA_SECRET`, `MIXPANEL_PROJECT_ID`) e leitura do report do funil
- **Base.gs**: orquestração, cache do funil, backfill, log, alerta e gatilho
- **Menu.gs**: menu "Base Influencers" e diagnósticos

## Instalação

1. Crie uma planilha, abra Extensões > Apps Script e copie os arquivos (ou use `clasp push`). Deixe a planilha em pt-BR para a vírgula decimal.
2. Propriedades do script:
   - `SUPABASE_URL` = `https://eupkvybriepteduevrpr.supabase.co`
   - `SUPABASE_SERVICE_KEY` = service_role key do projeto IRIS
   - `NEKT_MCP_TOKEN` = token de MCP da Nekt (o do CRM-WL serve)
   - `ALERT_EMAIL` (opcional)
   - Serviço avançado **BigQuery API** ativado (já declarado no `appsscript.json`). A conta que executa precisa ler `manual-data-team.prod` e rodar jobs no projeto `manual-data-team`, como no Base-Final-HL.
3. Menu **Base Influencers > Testar conexões** e **Diagnóstico da medicação (CPF)**.
4. **Backfill do funil desde DATA_INICIO** (continua sozinho por gatilho até terminar; ver `_log`).
5. **Reconstruir só a base**.
6. **Instalar gatilho diário**. "Reconstruir só a base" também atualiza o funil dos dias que faltam no cache; se o Mixpanel da Nekt estiver atrasado, o `_log` avisa até quando há eventos (≈ 7h40: funil D-1..D-3 + base inteira).

## Plug-and-play da comissão

`contract_terms.sale_bands` e `commission_campaigns` estão vazias hoje, então Custo de comissão e Custo de campanha saem zerados. Nada precisa mudar no código quando forem preenchidas: a próxima execução já calcula. Formatos esperados (os mesmos do `calcular_pagamento`):

```json
sale_bands:    [{"from": 1, "cents": 20000}, {"from": 11, "cents": 25000}, {"from": 36, "cents": 30000}, {"from": 81, "cents": 35000}]
switch_bands:  [{"from": 1, "cents": 40000}]
```

`Diagnóstico da Irís` no menu mostra quantos termos já têm faixa e quantas campanhas estão ativas.

## Premissas e limites

- **Janela da comissão** (`COMISSAO_JANELA = 'CONTRATO'`): a comissão começa em `starts_on` do contrato, porque a publicação das peças ainda não é registrada na Irís. `'IRIS'` replica o `calcular_pagamento` (começa na 1ª peça publicada).
- **Simulação do protótipo** (`COMISSAO_SIMULACAO`): as faixas entraram na Irís em 29/10/2026; com `{inicio: '2026-10-22', termosDe: '2026-10-29'}` as vendas desde 22/10 usam os termos de 29/10 e vendas anteriores não geram comissão. Em produção: `null`.
- **Vendas da comissão**: pedidos com pagamento concluído (`payment_completed_at`), 1 unidade por pedido, contados pela ordem do checkout. A Irís usa a própria sincronização (`attributed_sales`), que hoje registra menos pedidos que o lake (ex.: out/26: 339 na Irís x 457 pagos no lake), porque só casa cupons de influenciadoras com contrato. A base segue o lake.
- **troca_faixa**: o ordinal da campanha conta só vendas dentro do período da campanha.
- **Custo fixo diarizado** cobre contratos `active`/`ended` em todos os meses do contrato e `paused` só nos meses com ciclo aberto. Pode diferir do pago quando há peças glosadas.
- **Diferença para o pace (Influencers - PACING V3)**: no pace, a lista Cupom → Cupom principal da aba `Mapeamento` está com `#REF!`, então só ~13 cupons recebem Orders/Acquisitions (out/26 até 26/10: 74 orders no pace x 558 no lake). Para esses cupons a base bate exatamente com o pace; a diferença está nos cupons que o pace descarta (XULIA, BORAJUNTAS, SARADA, ECS e outros).
- **Medicação**: o SQL original conta o gross uma vez por linha de desconto do pedido (`fct_order_discounts`); aqui é uma vez por pedido. Pedidos sem pagamento concluído não entram (sem data de custo). Só 42 dos 61 creators da `manual_silver.creators` têm CPF: medicação de creator sem CPF cadastrado cai em `(MEDICACAO SEM CREATOR)`.
- **Conteúdos** dependem do preenchimento da Irís: hoje só 15 peças estão `entregue` (todas em 29/09/2026). Outros status de postagem podem entrar via `CFG.CONTEUDO_STATUS`.
- **Funil**:
  - O filtro "Voy BR top of funnel filter for acquisitions" não é acessível pela API; a réplica usa domínio `*.voysaude.com.br` e país BR (`CFG.FUNIL`). Ajustar se o filtro tiver mais regras e conferir um dia contra o board (`debugFunilDia`).
  - Sessão = 30 min de inatividade entre os 4 eventos do funil; last touch olha só `LOOKBACK_HORAS` (24h) para trás. Usuário que voltou depois disso sem UTM não entra como influencer aqui, mas pode entrar no Mixpanel.
  - Custo de leitura: ~30 GB por dia de Mixpanel. O incremental diário lê ~4 dias (~120 GB); o backfill de jun/26 em diante lê cerca de 6 TB uma única vez (blocos de 2 dias + 1 dia de lookback).
- Cupons que aparecem no lake ou no Mixpanel sem cadastro na Irís continuam na base (sem custo fixo).

## Recebe dados de / entrega para

- Supabase IRIS (`eupkvybriepteduevrpr`): influencers, contracts, contract_terms_ranges, content_cycles, content_pieces, commission_campaigns, commission_campaign_contracts
- Nekt: `webhook_v2_orders_lake`, `webhook_v2_order_discounts_lake` (alimentadas pelo Nekt-brazil a partir do lake), `mixpanel_events` e `manual_silver.creators`
- BigQuery: `manual-data-team.prod.fct_orders`, `dim_customer`, `dim_order_item_discounts` (medicação)
- Entrega: abas `BASE_INFLUENCERS_WL` e `BASE_CONTEUDOS_WL` da planilha vinculada (consumidor a definir; candidato natural: Base-Final-WL / Pacing-WL)

```
Irís (Supabase) ----------------------------+                         +--> aba BASE_INFLUENCERS_WL
Nekt-brazil (lake) --> orders/discounts ----+--> base-influs-WL -------+
Lake (BigQuery) --> medicação por CPF ------+
Mixpanel --> Nekt mixpanel_events ----------+                         +--> aba BASE_CONTEUDOS_WL
```

> Manter esta documentação: ao ligar a base a outro repositório, atualizar este README e o mapa (README/RepoMap.gs) dos repositórios envolvidos.

## Versão do PACING V3 (`pace/`)

Planilha "WL BR | Influencers - PACING V3". A aba `Acquisition: Paid Creators` continua sendo uma fórmula:

- **até a véspera do corte** (`Config!B14`, 01/11/2026): igual a antes (H_Spend, H_Mixpanel, H_Checkouts);
- **a partir do corte**: lê a aba auxiliar oculta `H_Iris` (Data | Cupom principal | Metric | Value), gerada por este código com a mesma lógica da base de teste. O cupom passa pelo de-para da aba `Mapeamento` (Cupom D→E e UTM J→K).

Instalação:

1. `./pace/build.sh` gera `pace/dist/BaseIris.gs` (um arquivo só) e `pace/dist/appsscript.json`; cole os dois no projeto Apps Script da planilha.
2. Propriedades do script: `SUPABASE_SERVICE_KEY`, `NEKT_MCP_TOKEN`, `MIXPANEL_SA_USER`, `MIXPANEL_SA_SECRET` (e `ALERT_EMAIL`, opcional). `SUPABASE_URL` e o projeto do Mixpanel já têm padrão no código.
3. Rodar `executarDiario` uma vez (autoriza e cria `H_Iris`, `_iris_cache_funil`, `_iris_log`).
4. Rodar `configurarPace` (grava o corte em `Config!B14`, troca a fórmula, guarda a anterior em `Config!B16` e esconde as abas auxiliares). `desfazerPace` volta a fórmula anterior.
5. Rodar `instalarGatilhoDiario` (≈ 7h40).
