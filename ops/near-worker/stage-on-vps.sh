#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 0 || "$EUID" -ne 0 ]]; then
  echo "Run this no-argument staging command through its temporary root grant." >&2
  exit 2
fi

readonly stage=/home/pocket/.dinn-near-stage
readonly archive="$stage/dinn-near-worker.tar.gz"
readonly env_source="$stage/worker.env"
readonly sudoers=/etc/sudoers.d/99-dinn-worker-stage
readonly runner=/usr/local/sbin/dinn-near-worker-stage
readonly root=/opt/dinn-near-worker
readonly app="$root/app"
readonly backup="$root/app-node-modules-full-before-isolation"
readonly unit=/etc/systemd/system/dinn-near-worker.service
readonly env_target=/etc/dinn-near-worker/worker.env

cleanup() {
  local status=$?
  trap - EXIT
  rm -f "$sudoers" "$archive" "$env_source"
  /usr/sbin/visudo -c || status=1
  if [[ "$status" -eq 0 ]]; then
    rm -f "$runner"
  fi
  exit "$status"
}
trap cleanup EXIT

[[ -d "$stage" && "$(stat -c '%a' "$stage")" == "700" ]]
[[ -f "$archive" && -f "$env_source" && -d "$app" ]]
grep -qx 'NEAR_WORKER_ENABLED=false' "$env_source"
grep -Eq '^DATABASE_URL=postgresql://dinn_near_worker:[^@]+@dpg-dbq3uol6e07s73c2ht0g-a[.]oregon-postgres[.]render[.]com:5432/dinn[?]sslmode=require$' "$env_source"
[[ "$(systemctl show -p ActiveState --value dinn-near-worker.service)" == inactive ]]
[[ "$(systemctl show -p UnitFileState --value dinn-near-worker.service)" == disabled ]]
[[ ! -e "$backup" && ! -L "$backup" ]]

tar --no-same-owner -xzf "$archive" -C "$app"
chown -R root:root "$app"
/usr/local/bin/npm --prefix "$app/ops/near-worker" ci --omit=dev --ignore-scripts --no-audit

if [[ -e "$app/node_modules" || -L "$app/node_modules" ]]; then
  mv "$app/node_modules" "$backup"
fi
ln -s "$app/ops/near-worker/node_modules" "$app/node_modules"
chown -h root:root "$app/node_modules"

install -o root -g dinnworker -m 0640 "$env_source" "$env_target"
install -o root -g root -m 0644 "$app/ops/near-worker/dinn-near-worker.service" "$unit"
systemctl daemon-reload
systemd-analyze verify "$unit"

cd "$app"
db_check='import {Pool} from "pg"; const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000}); try { const {rows:[row]}=await pool.query("select current_user as login,(select ssl from pg_stat_ssl where pid=pg_backend_pid()) as tls"); if(row.login!=="dinn_near_worker"||row.tls!==true) throw Error("Worker database verification failed."); console.log("Restricted worker database login and TLS verified."); } finally { await pool.end(); }'
runuser -u dinnworker -- env HOME=/home/dinnworker /usr/local/bin/node --env-file="$env_target" --input-type=module -e "$db_check"

[[ "$(systemctl show -p ActiveState --value dinn-near-worker.service)" == inactive ]]
[[ "$(systemctl show -p UnitFileState --value dinn-near-worker.service)" == disabled ]]
rm -rf "$backup"
echo "Dinn worker staged. Service remains disabled and inactive."
