# AidBridge

AidBridge is a case, household, inventory, and volunteer workspace for small community organizations. Each organization is a separate tenant. A person who belongs to two organizations still works in one of them at a time, and the database refuses the other organization’s rows.

## Run it locally

Docker Desktop needs to be running. From this folder:

```bash
npm install
npm run setup
npm run dev
```

Open http://localhost:3000 and sign in with a sample account. The sample password for every account is `Harbor-lamp-42`.

| Organization | Person | Role | Email | Authenticator |
| --- | --- | --- | --- | --- |
| Community Food Bank (`food-bank`) | June Alvarez | Owner | june.alvarez@foodbank.test | `JBSWY3DPEHPK3PXP` |
| Community Food Bank | Andre Brooks | Administrator | andre.brooks@foodbank.test | `MFRGGZDFMZTWQ2LK` |
| Community Food Bank | Maria Santos | Case worker | maria.santos@foodbank.test | none |
| Community Food Bank | Sam Okonkwo | Field worker | sam.okonkwo@foodbank.test | none |
| Community Food Bank | Pat Nguyen | Volunteer coordinator | pat.nguyen@foodbank.test | none |
| Community Food Bank | Lee Ortiz | Inventory manager | lee.ortiz@foodbank.test | none |
| Community Food Bank | Jordan Hale | Viewer | jordan.hale@foodbank.test | none |
| Rural Assistance NGO (`rural-assistance`) | Riley Chen | Owner | riley.chen@rural.test | `ORUGS4ZANFZSAYLO` |
| Rural Assistance NGO | Alex Morgan | Case worker | alex.morgan@rural.test | none |

Both organizations are marked as sample data. The banner on those workspaces says so. Henderson household is `H-1042` in the food bank and is assigned to Sam. Ellis household is unassigned, so Sam’s field-worker view does not include it. The rural NGO also has a household `H-1042`; codes are unique inside one organization, not across all of them.

Owner and administrator accounts require the authenticator code above. Add the secret as a base32 key in any TOTP app, or generate the current 6-digit code while developing.

## What is included

- Organizations, invites, sessions, and authenticator codes for owners and administrators
- Households, people, programs, cases, notes, tasks, appointments, referrals, and documents
- Programs, fields, services, and case types stored as data
- Inventory that cannot be issued below zero, including when two people issue the last unit together
- Volunteers, shifts, hours, and a service directory
- A map for households and directory sites
- Search, reports, a CSV download for people allowed to export, and an audit list of status and code changes
- A phone queue that keeps assigned cases on the device and sends notes when the connection returns
- Separate sample organizations so one workspace cannot read the other

Files stay on disk under `storage/`, which is not committed. Download links are signed and still require a signed-in member of that organization.

## Checks

```bash
npm test
npm run test:integration
npm run test:e2e
```

`npm run setup` creates the database, applies `db/migrations/001_schema.sql`, and loads the sample organizations. SQL is the source of truth for tables, permissions, and row security. The app talks to Postgres through `postgres.js` and sets the current user and organization for each transaction.

## Scheduled work

`POST /api/cron` with `Authorization: Bearer $CRON_SECRET` removes organizations whose purge date has passed and queues appointment reminders. Nothing is emailed unless `SMTP_HOST` is set. Invites always show a link to copy.

## Local configuration

`.env.example` lists `DATABASE_URL`, `DATABASE_URL_ADMIN`, `FILE_SIGNING_KEY`, and `CRON_SECRET`. The checked-in example values are for this local Docker database only.
