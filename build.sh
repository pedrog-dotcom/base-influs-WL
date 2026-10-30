#!/bin/sh
# Junta os .gs num arquivo só (dist/BASE_INFLUENCERS_WL.gs), que é o que fica no projeto de
# Apps Script da planilha de pacing de WL ao lado do Pace.gs.
cd "$(dirname "$0")"
mkdir -p dist
out=dist/BASE_INFLUENCERS_WL.gs
{
  echo "/* BASE_INFLUENCERS_WL.gs: gerado por build.sh a partir de github.com/pedrog-dotcom/base-influs-WL. Não edite aqui; edite os .gs do repositório. */"
  for f in Config.gs Util.gs Planilha.gs Clients.gs Sql.gs Iris.gs Custos.gs Medicacao.gs Conteudos.gs Mixpanel.gs Base.gs Menu.gs; do
    echo; echo "/* ===== $f ===== */"; cat "$f"
  done
} > "$out"
echo "$out: $(wc -l < "$out") linhas"
