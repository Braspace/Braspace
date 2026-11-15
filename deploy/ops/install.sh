#!/usr/bin/env bash
# Installs the MoonProof production watch (every 10 min) and the daily off-site DB backup as systemd user timers
# on a workstation with Tailscale SSH access to the harness (EXO-X1). Idempotent. Log: journalctl --user -u braspace-*
set -euo pipefail
src=$(cd "$(dirname "$0")" && pwd)
dst="$HOME/.local/share/braspace-ops"; units="$HOME/.config/systemd/user"
mkdir -p "$dst" "$units"
install -m 755 "$src/prod-watch.sh" "$src/pull-backup.sh" "$dst/"
install -m 644 "$src"/systemd/braspace-*.service "$src"/systemd/braspace-*.timer "$units/"
systemctl --user daemon-reload
systemctl --user enable --now braspace-prod-watch.timer braspace-backup.timer
systemctl --user list-timers 'braspace-*' --no-pager
