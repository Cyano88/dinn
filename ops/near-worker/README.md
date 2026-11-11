# Dinn NEAR Agent Market worker on a shared VPS

The marketplace hosts Dinn's A2A endpoint. This service polls assignments every 45 seconds and has no public HTTP listener. It must not share PolyDesk's Linux user, home directory, environment, logs, database credentials, wallet session, worker state, or systemd unit.

## Isolation

- User and group: `dinnworker`
- Checkout: `/opt/dinn-near-worker/app`
- Private environment: `/etc/dinn-near-worker/worker.env`
- Unit: `dinn-near-worker.service`
- State: PostgreSQL tables `dinn_near_work` and `dinn_near_work_events`

The worker needs outbound HTTPS to Agent Market and Robinhood Chain RPC, plus a TLS PostgreSQL connection to Dinn's database. No inbound port or reverse proxy route is needed. Keep the checkout read-only to the service user.

## Requirements

- Node.js 22 or later available on the service's configured `PATH`.
- Dinn PostgreSQL database with the schema in `migrations/20261111_dinn_near_worker.sql`.
- A separate PostgreSQL worker login with CONNECT and schema USAGE, SELECT/INSERT/UPDATE on `dinn_near_work`, INSERT on `dinn_near_work_events`, and USAGE on `dinn_near_work_events_id_seq`. Apply the schema and grants using the database owner; do not give the worker DDL or owner privileges.
- Registered Dinn `NEAR_AGENT_ID` and private `NEAR_AGENT_TOKEN`.
- Owner-approved `NEAR_WORKER_ESCROW_TOKEN` (`USD` or `USDC`) and `NEAR_WORKER_MIN_ESCROW`.
- Confirmed memory, disk, egress and monitoring capacity on the VPS.

## Install

Create a dedicated account and directories. Do not use the existing PolyDesk or perps-agent accounts:

```sh
sudo useradd --system --create-home --home-dir /home/dinnworker --shell /usr/sbin/nologin dinnworker
sudo install -d -o root -g root -m 0755 /opt/dinn-near-worker/app
sudo install -d -o root -g root -m 0755 /etc/dinn-near-worker
```

Place the approved Dinn checkout in `/opt/dinn-near-worker/app`, then install production dependencies:

```sh
sudo npm --prefix /opt/dinn-near-worker/app ci --omit=dev
```

Apply the migration as the database owner and provision the restricted worker login. Create `/etc/dinn-near-worker/worker.env` from `worker.env.example` with that login's connection string, Agent Market credentials, and approved escrow settings. Use the VPS's secure administration channel. Set ownership to `root:dinnworker` and mode `0640`. Never commit or paste secret values into chat.

Install `dinn-near-worker.service` as `/etc/systemd/system/dinn-near-worker.service`. Review the unit and service account before activation:

```sh
sudo chown root:dinnworker /etc/dinn-near-worker/worker.env
sudo chmod 0640 /etc/dinn-near-worker/worker.env
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/dinn-near-worker.service
sudo systemctl enable --now dinn-near-worker
sudo systemctl status dinn-near-worker --no-pager
```

Do not enable the service until listing credentials, database access, escrow currency and minimum, release revision, VPS headroom and monitoring are confirmed. Inspect logs with `journalctl -u dinn-near-worker`; logs contain only worker status and sanitized error classes.

## Rollback

Stop and disable only `dinn-near-worker.service`. Do not restart or modify PolyDesk, Pocket Concierge, or perps-agent services during Dinn worker maintenance.
