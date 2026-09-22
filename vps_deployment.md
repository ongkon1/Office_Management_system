# VPS Deployment Guide

This guide deploys the application as a persistent Next.js 16 Node.js service behind Nginx. It assumes that **MySQL is already installed on the VPS**. It does not reinstall or replace MySQL; it only explains how to connect the application and apply this repository's schema migrations.

> Current readiness: the repository contains the MySQL schema, migrations, and backend services, but some browser flows still use mock service adapters while backend cutover milestones remain pending. Deploying the application does not by itself make unfinished backend integrations production-ready.

## 1. Deployment assumptions

Replace these examples with the real values for the server:

| Item | Example |
|---|---|
| Linux distribution | Ubuntu 24.04 LTS |
| Domain | `timesheet.example.com` |
| Application directory | `/var/www/Office_Management_system` |
| Linux service account | `officeapp` |
| Local application port | `3000` |
| MySQL database | `office_management` |
| Node.js | 24 LTS, as required by `package.json` |

The recommended topology is:

```text
Internet -> HTTPS/Nginx -> Next.js on 127.0.0.1:3000 -> existing MySQL
                                                |----> Redis/BullMQ when workers are enabled
                                                |----> private S3-compatible storage
                                                `----> transactional email provider
```

Use a single application instance until shared cache and multi-instance coordination are configured.

## 2. Existing database commands

The repository already provides the requested commands, so no new package scripts are needed:

| Command | Purpose | Production use |
|---|---|---|
| `npm run db:validate` | Validate migration files without connecting to MySQL | Yes |
| `npm run db:status` | Show applied, pending, or checksum-mismatched migrations | Yes |
| `npm run db:migrate` | Apply pending migrations in version order under a MySQL advisory lock | Yes |
| `npm run db:seed` | Load deterministic demo users and data | **No** |
| `npm run db:harden-task-work` | Apply the approved post-migration runtime grants for task-based work logging | Only during the approved migration `0011` cutover |
| `npm run db:rollback -- --to VERSION` | Guarded destructive recovery for an approved empty schema | Not a normal production rollback |

`npm run db:seed` intentionally stops when `NODE_ENV=production`. It uses the privileged `DATABASE_MIGRATION_URL`, inserts demo accounts with the shared demo password, and must never run against the production database. Production employees, divisions, departments, assignments, and policy data must be imported through an approved production-data process or created through authorized administration screens.

## 3. Prepare the VPS (without installing MySQL)

Install the application runtime and reverse proxy. Skip any package already managed by the VPS provider:

```bash
sudo apt update
sudo apt install -y nginx curl ca-certificates build-essential
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

The Node version must be `24.x`.

Create a dedicated service account and application directory:

```bash
id -u officeapp >/dev/null 2>&1 || sudo adduser --system --group --home /home/officeapp officeapp
sudo install -d -o officeapp -g officeapp -m 0750 /home/officeapp
sudo chown -R officeapp:officeapp /var/www/Office_Management_system
```

The repository is already cloned at `/var/www/Office_Management_system`. Verify it before continuing:

```bash
cd /var/www/Office_Management_system
pwd
git remote -v
```

Do not upload local `.env*`, `.next`, `node_modules`, logs, screenshots, or development database files.

## 4. Configure the existing MySQL database

The application expects two credentials for the same database:

- `DATABASE_URL`: the restricted runtime account used by the web application.
- `DATABASE_MIGRATION_URL`: a separately controlled account allowed to create and alter the application schema.

Never use `root`, a MySQL system account, or the migration account in `RUNTIME_DATABASE_ACCOUNTS`. The hardening command rejects these identities because revoking their grants can break migration-owned triggers and database administration.

Ask the VPS/database administrator to provide both URLs. The database and accounts may already exist; do not recreate them unnecessarily. Use `127.0.0.1` when MySQL is on the same VPS, or the database server's private address when it is remote.

Example URL format:

```text
mysql://office_app:URL_ENCODED_PASSWORD@127.0.0.1:3306/office_management
mysql://office_migrator:URL_ENCODED_PASSWORD@127.0.0.1:3306/office_management
```

Percent-encode special characters in usernames and passwords. Do not place either URL in source control, terminal history, screenshots, or support messages. MySQL must use UTC internally; the application handles business dates in `Asia/Dhaka`.

The migration account is used only while running migration commands. The Next.js service uses only `DATABASE_URL` during normal operation.

## 5. Create the production environment file

From the application directory, copy the documented template:

```bash
cd /var/www/Office_Management_system
sudo -u officeapp -H cp .env.example .env.local
sudo chown officeapp:officeapp .env.local
sudo chmod 600 .env.local
```

Edit `/var/www/Office_Management_system/.env.local` and configure at least:

```dotenv
NODE_ENV=production
APP_BASE_URL=https://timesheet.example.com
BUSINESS_TIMEZONE=Asia/Dhaka
DEFAULT_CURRENCY=BDT

DATABASE_URL=mysql://office_app:URL_ENCODED_PASSWORD@127.0.0.1:3306/office_management
DATABASE_MIGRATION_URL=mysql://office_migrator:URL_ENCODED_PASSWORD@127.0.0.1:3306/office_management
DATABASE_POOL_LIMIT=10
RUNTIME_DATABASE_ACCOUNTS=office_app@localhost,office_app@127.0.0.1

BETTER_AUTH_SECRET=GENERATE_A_UNIQUE_SECRET_OF_AT_LEAST_32_RANDOM_BYTES
BETTER_AUTH_URL=https://timesheet.example.com

REDIS_URL=redis://127.0.0.1:6379

S3_ENDPOINT=
S3_REGION=ap-southeast-1
S3_BUCKET=office-management-private
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false

RESEND_API_KEY=
EMAIL_FROM=PowerInAI <no-reply@example.com>

NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=BASE64_ENCODED_32_BYTE_KEY
DEPLOYMENT_VERSION=RELEASE_IDENTIFIER

EXPORT_S3_BUCKET=
EXPORT_PDF_FONT_PATH=/absolute/path/to/licensed-unicode-font.ttf
```

Generate secrets on the VPS, for example:

```bash
openssl rand -base64 48
openssl rand -base64 32
```

Use the first output for `BETTER_AUTH_SECRET` and the second for `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. Keep the Server Actions encryption key stable between builds and running instances of the same release. Change `DEPLOYMENT_VERSION` for each release if it is wired into `next.config.ts` in a later milestone.

Configuration notes:

- `.env.local` stays at the repository root because Next.js does not load environment files from `src/`.
- Variables without `NEXT_PUBLIC_` remain server-only. Never prefix database, authentication, storage, or email secrets with `NEXT_PUBLIC_`.
- Redis is already selected for BullMQ jobs. If Redis is not installed/configured, scheduled HR processing and durable export workers cannot run.
- Private S3-compatible storage and a Unicode PDF font are required for protected export artifacts.
- Transactional email needs valid provider credentials and a verified sender.

## 6. Install, validate, migrate, and build

Run application commands as the `officeapp` user:

```bash
cd /var/www/Office_Management_system
sudo -u officeapp -H npm ci
sudo -u officeapp -H npm run db:validate
sudo -u officeapp -H npm run db:status
```

Before the first migration or any migration-containing release, take a tested backup of the existing database using the VPS provider's backup facility or the organization's approved MySQL backup procedure.

Apply and verify the schema:

```bash
sudo -u officeapp -H npm run db:migrate
sudo -u officeapp -H npm run db:status
```

Every migration should now report `applied`. Stop deployment if a checksum mismatch appears. Never edit an already-applied migration; add a new forward migration.

Migration `0011` has a separate runtime-permission hardening step. Run it only as part of the approved task-based work-log cutover, after checking `RUNTIME_DATABASE_ACCOUNTS`, taking a backup, completing reconciliation, and obtaining the required HR rehearsal sign-off:

```bash
sudo -u officeapp -H npm run db:harden-task-work
```

This command revokes and rebuilds the listed runtime accounts' grants. A wrong account list can interrupt the application, so the database administrator must review it before execution.

Build and verify the application:

```bash
sudo -u officeapp -H npm run verify
```

`npm run verify` includes the production build. A failed type check, lint, contrast audit, test, or build blocks deployment. If the full verification was already performed against the exact release artifact in CI, run at minimum:

```bash
sudo -u officeapp -H npm run build
```

Do not run `npm run db:seed` in this production environment.

## 7. Run Next.js with systemd

Find the installed npm path:

```bash
command -v npm
```

Create `/etc/systemd/system/office-management.service` and replace `/usr/bin/npm` if the previous command returned a different path:

```ini
[Unit]
Description=Office Management Next.js application
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=officeapp
Group=officeapp
WorkingDirectory=/var/www/Office_Management_system
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now office-management.service
sudo systemctl status office-management.service
curl -I http://127.0.0.1:3000/login
```

Next.js receives `SIGTERM` during a restart and is given 30 seconds to finish in-flight work.

The BullMQ worker functions exist in the codebase, but there is currently no production worker entry script or `npm run worker` command. Do not invent a systemd worker service yet. Scheduled HR jobs and durable export generation need that backend deployment task completed before they can be operated on the VPS.

## 8. Configure Nginx

Create `/etc/nginx/sites-available/office-management`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name timesheet.example.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_buffering off;
    }
}
```

Enable and validate it:

```bash
sudo ln -s /etc/nginx/sites-available/office-management /etc/nginx/sites-enabled/office-management
sudo nginx -t
sudo systemctl reload nginx
```

Keep port `3000` private. Allow only SSH and web traffic through the VPS firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 9. Enable HTTPS

Point the domain's DNS record to the VPS before requesting a certificate. On Ubuntu with Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d timesheet.example.com
sudo certbot renew --dry-run
```

After HTTPS is active, confirm that both `APP_BASE_URL` and `BETTER_AUTH_URL` use the final `https://` domain, then rebuild and restart if either value changed.

## 10. Deployment update procedure

For each release:

1. Upload the new release to the application directory using the organization's release process.
2. Preserve `.env.local` and never copy a developer environment file over it.
3. Install exactly the locked dependencies.
4. Validate migrations and build before changing the live process.
5. Back up MySQL before applying new migrations.
6. Apply migrations once, then restart the application.
7. Perform authenticated role-based smoke tests.

Commands:

```bash
cd /var/www/Office_Management_system
sudo -u officeapp -H npm ci
sudo -u officeapp -H npm run db:validate
sudo -u officeapp -H npm run build
sudo -u officeapp -H npm run db:status
sudo -u officeapp -H npm run db:migrate
sudo -u officeapp -H npm run db:status
sudo systemctl restart office-management.service
sudo systemctl status office-management.service
curl -I https://timesheet.example.com/login
```

For lower downtime, prepare and build a timestamped release directory first, preserve the same secrets, migrate once, switch the service's release path, and restart. Do not run two releases with incompatible schemas at the same time.

## 11. Verification checklist

- [ ] `node --version` reports Node 24.x.
- [ ] `.env.local` is owned by `officeapp`, mode `600`, and excluded from source control.
- [ ] Runtime and migration database accounts are separate.
- [ ] `npm run db:validate` passes.
- [ ] `npm run db:status` reports every migration as `applied`.
- [ ] Migration `0011` reconciliation, HR sign-off, and runtime grant hardening are complete if that cutover is included.
- [ ] `npm run verify` passes for the deployed release.
- [ ] `systemctl status office-management.service` reports `active (running)`.
- [ ] `curl -I http://127.0.0.1:3000/login` succeeds locally.
- [ ] HTTPS works on the public domain and HTTP redirects to HTTPS.
- [ ] Login, logout, session expiry, and direct-route authorization are tested.
- [ ] Employee, Team Lead, HR, Management, and Super Administrator journeys are smoke-tested.
- [ ] Database-backed flows are confirmed separately from mock-backed screens.
- [ ] Upload/download and protected exports are tested if S3 and workers are enabled.
- [ ] Logs contain no database URLs, credentials, salary data, or protected payloads.
- [ ] Automated database backups and restore testing are scheduled.

## 12. Operations and troubleshooting

Application logs:

```bash
sudo journalctl -u office-management.service -n 200 --no-pager
sudo journalctl -u office-management.service -f
```

Nginx checks:

```bash
sudo nginx -t
sudo tail -n 200 /var/log/nginx/error.log
```

Database checks:

```bash
cd /var/www/Office_Management_system
sudo -u officeapp -H npm run db:status
```

Common failures:

| Symptom | Check |
|---|---|
| `DATABASE_MIGRATION_URL must be a MySQL URL` | Add the migration account URL to `.env.local`. |
| npm reports `EACCES` for `/home/officeapp` | Create the service user's home with `install -d -o officeapp -g officeapp -m 0750 /home/officeapp`, remove the incomplete `node_modules`, and rerun `npm ci` with `sudo -u officeapp -H`. |
| `ERR_MODULE_NOT_FOUND` after a failed `npm ci` | Do not install the single missing package. Remove the incomplete `node_modules` directory and rerun the locked installation successfully. |
| Database authentication error | Confirm the account host grant, URL-encoded password, database name, and MySQL bind/firewall rules. |
| Migration checksum mismatch | Stop; restore the original migration file and create a new forward migration. |
| Authentication callback or cookie failure | Ensure `APP_BASE_URL` and `BETTER_AUTH_URL` exactly match the HTTPS origin. |
| Server Action mismatch after deployment | Keep one encryption key for the build/runtime and avoid serving mixed releases. |
| `502 Bad Gateway` | Check systemd status, logs, port `3000`, and Nginx `proxy_pass`. |
| Export remains queued | The separate worker host is not yet wired, Redis is unavailable, or S3 configuration is incomplete. |

For an application rollback, redeploy the previous release only when its code is compatible with the current schema. The repository's database recovery scripts are intentionally destructive and guarded for approved empty-schema recovery; they are not a substitute for production backups. Prefer a forward fix or restore a verified database backup under an approved incident procedure.
