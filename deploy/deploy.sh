#!/usr/bin/env bash
# Build the game and upload it + the relay to the server, then (re)start things.
#   bash deploy/deploy.sh root@<server-ip> <domain>
# First run installs everything (deploy/setup.sh); later runs just update files.
set -euo pipefail
HOST="${1:?usage: deploy.sh root@<server-ip> <domain>}"
DOMAIN="${2:?usage: deploy.sh root@<server-ip> <domain>}"
cd "$(dirname "$0")/.."
# use the Hetzner key if there is one (override with SSH_KEY=...)
KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
OPTS=()
[ -f "$KEY" ] && OPTS=(-i "$KEY")

npm run build
ssh "${OPTS[@]}" "$HOST" 'mkdir -p /srv/zsq'
scp "${OPTS[@]}" -r dist server deploy "$HOST:/srv/zsq/"
ssh "${OPTS[@]}" "$HOST" "bash /srv/zsq/deploy/setup.sh $DOMAIN"
