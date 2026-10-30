#!/usr/bin/env bash
# Uso: ./deploy/gerar-segredos.sh <dominio> <email-para-o-certificado>

set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
modelo="$raiz/producao.env.example"
destino="$raiz/.env"

if [[ $# -ne 2 ]]; then
  echo "uso: $0 <dominio> <email-para-o-certificado>" >&2
  echo "exemplo: $0 seu-dominio.exemplo julio@exemplo.com" >&2
  exit 1
fi

dominio="$1"
email="$2"

if [[ -e "$destino" ]]; then
  echo "ERRO: $destino já existe." >&2
  echo "Regerar trocaria o sal de pseudonimização e desligaria os dados novos" >&2
  echo "dos já coletados. Apague o arquivo à mão se for mesmo isso que quer." >&2
  exit 1
fi

# base64url: sem '/', '+' ou '=', que atrapalham em URL de conexão e em shell.
segredo() {
  openssl rand -base64 "$1" | tr -d '\n=' | tr '+/' '-_'
}

senha_postgres="$(segredo 24)"
segredo_jwt="$(segredo 48)"
sal_telemetria="$(segredo 32)"
chave_storage="$(segredo 24)"

umask 077
sed \
  -e "s|^TASKPLAY_DOMINIO=.*|TASKPLAY_DOMINIO=$dominio|" \
  -e "s|^TASKPLAY_EMAIL_ACME=.*|TASKPLAY_EMAIL_ACME=$email|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$senha_postgres|" \
  -e "s|^AUTH_JWT_SECRET=.*|AUTH_JWT_SECRET=$segredo_jwt|" \
  -e "s|^TELEMETRY_PSEUDONYM_SALT=.*|TELEMETRY_PSEUDONYM_SALT=$sal_telemetria|" \
  -e "s|^STORAGE_SECRET_KEY=.*|STORAGE_SECRET_KEY=$chave_storage|" \
  "$modelo" >"$destino"
chmod 600 "$destino"

echo "Escrito $destino (permissão 600, fora do controle de versão)."
echo
echo "Domínio: $dominio"
echo "Confira, antes de subir, que o registro A dele aponta para o IP deste"
echo "servidor. O Caddy pede o certificado no arranque e falha se não alcançar."
echo
echo "Faça uma cópia do arquivo em lugar seguro. Perder o AUTH_JWT_SECRET"
echo "desloga todas as famílias; perder o TELEMETRY_PSEUDONYM_SALT separa os"
echo "dados de pesquisa novos dos antigos."
