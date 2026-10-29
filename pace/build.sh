#!/usr/bin/env bash
# Monta pace/dist/BaseIris.gs (um arquivo só) para colar no projeto Apps Script do
# "WL BR | Influencers - PACING V3". Config vem de pace/Config.gs; o resto é o código comum.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p pace/dist
{
  echo "// GERADO por pace/build.sh a partir do repositório base-influs-WL. Não editar aqui."
  for f in pace/Config.gs Util.gs Clients.gs Sql.gs Iris.gs Custos.gs Medicacao.gs Conteudos.gs Mixpanel.gs Base.gs Menu.gs pace/Pace.gs; do
    echo; echo "// ===== $f ====="; cat "$f"
  done
} > pace/dist/BaseIris.gs
cp appsscript.json pace/dist/appsscript.json
echo "ok: pace/dist/BaseIris.gs ($(wc -c < pace/dist/BaseIris.gs) bytes)"
