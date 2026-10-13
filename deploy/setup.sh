#!/usr/bin/env bash
# Instala Docker, configura la app y deja un cron que la actualiza sola.
# Uso (en la VM, dentro de la carpeta deploy/):  ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"

if ! command -v cron >/dev/null; then
  sudo apt-get update -qq && sudo apt-get install -y -qq cron
fi

if ! command -v docker >/dev/null; then
  echo "==> Instalando Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# Swap de 1 GB: la e2-micro tiene 1 GB de RAM
if ! swapon --show | grep -q /swapfile; then
  echo "==> Creando swap"
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if [ ! -f .env ]; then
  echo "==> Configuración"
  read -rp "Imagen (ej. ghcr.io/usuario/lol-drafter:latest): " IMAGE
  IP=$(curl -fsS -H 'Metadata-Flavor: Google' \
    http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip || true)
  read -rp "Dominio [${IP:+$IP.sslip.io}]: " DOMAIN
  DOMAIN=${DOMAIN:-$IP.sslip.io}
  read -rp "Usuario [politecnica]: " AUTH_USER
  AUTH_PASSWORD=""
  while [ -z "$AUTH_PASSWORD" ]; do
    read -rsp "Contraseña para entrar a la app (no puede quedar vacía): " AUTH_PASSWORD; echo
  done
  cat > .env <<ENV
IMAGE=$IMAGE
DOMAIN=$DOMAIN
AUTH_USER=${AUTH_USER:-politecnica}
AUTH_PASSWORD=$AUTH_PASSWORD
ENV
  chmod 600 .env
fi

mkdir -p data backups

echo "==> Levantando"
sudo docker compose pull
sudo docker compose up -d

echo "==> Cron: actualización cada 5 min y backup diario"
sudo tee /etc/cron.d/draft-politecnica >/dev/null <<CRON
*/5 * * * * root cd $DIR && docker compose pull -q app && docker compose up -d app >/dev/null 2>&1 && docker image prune -f >/dev/null 2>&1
30 4 * * * root cd $DIR && docker compose exec -T app node -e "require('better-sqlite3')(process.env.DB_PATH).backup('/data/backup.db').then(()=>process.exit())" && mv data/backup.db backups/draft-\$(date +\%F).db && find backups -name '*.db' -mtime +14 -delete
CRON

echo
echo "Listo: https://$(grep ^DOMAIN= .env | cut -d= -f2)"
