# Odoo CRM Airsync for DevRev

A DevRev **Airdrop (ADaaS)** snap-in that performs a **one-way sync** from **Odoo CRM into DevRev**. It imports Companies, Contacts, and Opportunities from Odoo and maps them to the corresponding DevRev objects: Accounts, Rev Users, and Opportunities.

---

## Overview

| Direction | Supported |
|-----------|-----------|
| Odoo → DevRev | Yes |
| DevRev → Odoo | No |

This snap-in uses the DevRev **Airdrop** framework (`@devrev/ts-adaas`) and communicates with Odoo via its JSON-RPC 2.0 API using API key authentication.

---

## Synced Objects

### Accounts (Odoo: `res.partner` where `is_company = true`)

| Odoo Field | DevRev Field | Notes |
|---|---|---|
| `name` | `display_name` | Required. Fallback: `"Unknown Account"` |
| `comment` | `description` | Optional |
| `active` | `state` | Mapped to `ACTIVE` / `INACTIVE`. Fallback: `ACTIVE` |
| `email` | — | Stored in normalized data |
| `phone` | — | Stored in normalized data |
| `website` | — | Stored in normalized data |
| — | `owned_by` | Assigned via DevRev user record (`use_devrev_record`) |

---

### Contacts (Odoo: `res.partner` where `is_company = false`)

| Odoo Field | DevRev Field | Notes |
|---|---|---|
| `name` | `display_name` | Required. Fallback: `"Unknown Contact"` |
| `email` | `email` | Optional |
| `phone` | — | Stored in normalized data |

Contacts are mapped to DevRev `rev_user` objects.

---

### Opportunities (Odoo: `crm.lead` where `type = opportunity`)

| Odoo Field | DevRev Field | Notes |
|---|---|---|
| `name` | `title` | Required. Fallback: `"Untitled Opportunity"` |
| `description` | `body` | Optional |
| `expected_revenue` | `amount` | Optional |
| `probability` | — | Stored in normalized data |
| `stage_id` | `stage` | Mapped via stage name substrings. Fallback: `qualification` |
| `priority` | `priority` | Mapped `0→P3`, `1→P2`, `2→P1`, `3→P0`. Fallback: `P2` |
| `stage_id` | `forecast_category` | Derived from stage. Fallback: `pipeline` |
| `partner_id` | `account_id` | Links to synced Account. Resolved via `use_devrev_record` |
| — | `owned_by_ids` | Assigned via DevRev user record (`use_devrev_record`) |

#### Stage Mapping (Odoo stage name → DevRev stage)

| Odoo Stage Name contains… | DevRev Stage |
|---|---|
| `new`, `draft`, `qualif` | `qualification` |
| `valid`, `proposit`, `present` | `validation` |
| `negot`, `discuss` | `negotiation` |
| `contract`, `order`, `sign` | `contract` |
| `stall`, `hold`, `block` | `stalled` |
| `won`, `closed won` | `closed_won` |
| `lost`, `closed lost` | `closed_lost` |

#### Forecast Category Mapping (derived from DevRev stage)

| DevRev Stage | Forecast Category |
|---|---|
| `qualification` | `pipeline` |
| `validation` | `pipeline` |
| `negotiation` | `best_case` |
| `contract` | `commit` |
| `stalled` | `omitted` |
| `closed_won` | `closed_won` |
| `closed_lost` | `omitted` |

---

## Prerequisites

- An Odoo instance with the **CRM module** installed
- Odoo **API key** (generated in Settings → Users → Preferences → Account Security)
- A DevRev organization with the snap-in deployed
- `devrev` CLI, `node` (v18+), and `npm` installed locally for development

---

## Setup

### 1. Generate an Odoo API Key

1. Log in to your Odoo instance.
2. Go to **Settings → Users → [Your User] → Preferences**.
3. Under **Account Security**, click **New API Key**.
4. Copy the generated key — it is shown only once.

### 2. Deploy the Snap-in

```bash
# Install dependencies and build
cd code
npm install
npm run build

# Package the snap-in
npm run package

# Authenticate with DevRev
devrev profiles authenticate --org <your-org-slug> --usr <your-email>

# Upload the package
devrev snap_in_package create-one --slug airdrop-odoo-crm | tee /tmp/package.out
PACKAGE_ID=$(cat /tmp/package.out | grep '"id"' | head -1 | awk -F'"' '{print $4}')

# Create a snap-in version
devrev snap_in_version create-one \
  --package "$PACKAGE_ID" \
  --path code/build.tar.gz \
  --create-package | tee /tmp/version.out
VERSION_ID=$(cat /tmp/version.out | grep '"id"' | head -1 | awk -F'"' '{print $4}')

# Draft and activate the snap-in
devrev snap_in draft "$VERSION_ID"
devrev snap_in activate
```

### 3. Create a Connection in DevRev

1. In DevRev, go to **Settings → Snap-ins → Odoo CRM Airsync**.
2. Click **New Connection**.
3. In the **Odoo URL** field, enter your full Odoo instance URL (e.g. `https://mycompany.odoo.com`).
4. In the **API Key** field, paste the key generated in step 1.
5. Save the connection.

### 4. Start the Import

1. Open the Airdrop import wizard in DevRev.
2. Select the **odoo-cursor** import.
3. Choose the **Odoo CRM Pipeline** sync unit.
4. Map fields as needed and activate the sync.

---

## Project Structure

```
odoo-crm-airsync/
├── manifest.yaml                          # Snap-in definition (keyring, functions, imports)
├── code/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                       # Entry point
│       ├── main.ts                        # Local dev runner
│       ├── function-factory.ts            # Routes events to workers
│       ├── fixtures/                      # Local test event payloads
│       └── functions/
│           ├── common/
│           │   ├── constants.ts           # Stage/priority/forecast maps
│           │   ├── state.ts               # Sync state type definitions
│           │   └── utils.ts               # Connection data parser
│           ├── external-system/
│           │   ├── odoo_api.ts            # Odoo JSON-RPC API client
│           │   ├── types.ts               # Odoo data type definitions
│           │   ├── data-normalization.ts  # Transforms Odoo records → NormalizedItem
│           │   ├── external_domain_metadata.json  # Odoo schema for Airdrop
│           │   └── initial_domain_mapping.json    # Field mapping rules
│           └── extraction/
│               ├── index.ts              # Worker dispatcher
│               └── workers/
│                   ├── metadata-extraction.ts          # Pushes external domain metadata
│                   ├── external-sync-units-extraction.ts  # Declares sync unit
│                   ├── data-extraction.ts              # Fetches and pushes Odoo records
│                   └── attachments-extraction.ts       # Attachment placeholder
└── README.md
```

---

## Development

```bash
cd code
npm install

# Run locally against fixture event files
npm start

# Watch mode
npm run build:watch

# Run tests
npm test
```

---

## Key Technical Notes

- **Authentication:** Odoo JSON-RPC API uses HTTP Basic auth with `Authorization: Basic <base64(apiKey:)>`. The username is the API key and the password is left empty.
- **Pagination:** Records are fetched in pages of 100 using `offset` / `limit` parameters on the Odoo `search_read` RPC method.
- **Incremental sync:** The `write_date` field on all Odoo models is used to detect changes since the last sync run.
- **Relational fields:** Odoo returns relational fields as `[id, "Name"]` tuples or `false` for null. The normalizer handles both cases.
- **`is_subdomain: true`:** The DevRev keyring is configured with `is_subdomain: true` so the full Odoo URL is stored as `org_id` and the API key is stored as `key`. The `utils.ts` parser extracts both correctly.
- **`external_domain_metadata.json`:** Must be pushed during the `EXTRACTION_METADATA_START` phase for Airdrop to build the field-mapping UI. Without this, recipe discovery fails silently.
- **Required DevRev fields:** `owned_by` (accounts) and `owned_by_ids` (opportunities) are required by DevRev but have no Odoo equivalent — they are handled via `use_devrev_record` and resolved against a DevRev user during the recipe setup.

---

## Dependencies

| Package | Purpose |
|---|---|
| `@devrev/ts-adaas` | Airdrop worker framework |
| `@devrev/typescript-sdk` | DevRev TypeScript SDK |
| `axios` | HTTP client for Odoo API calls |

---

## Version History

| Version | Notes |
|---|---|
| `0.1` | Initial working release — one-way sync of Accounts, Contacts, Opportunities |
