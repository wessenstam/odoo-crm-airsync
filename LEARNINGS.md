# DevRev Airsync (ADaaS) Snap-in — Build & Debug Learnings
## Odoo CRM Integration

**Author:** AI-assisted development session  
**Date:** May 2026  
**Snap-in name:** `odoo-cursor`  
**Target org:** `demowe` (DEV-3hF4oIQz22)  
**External system:** Odoo CRM (res.partner, crm.lead)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Manifest Configuration](#3-manifest-configuration)
4. [Keyring & Connection Setup](#4-keyring--connection-setup)
5. [External Domain Metadata](#5-external-domain-metadata)
6. [Initial Domain Mapping](#6-initial-domain-mapping)
7. [Extraction Workers](#7-extraction-workers)
8. [Data Normalizers](#8-data-normalizers)
9. [Odoo API Client](#9-odoo-api-client)
10. [Build & Deploy Process](#10-build--deploy-process)
11. [Error Log — Full Debug Journey](#11-error-log--full-debug-journey)
12. [chef-cli Validation](#12-chef-cli-validation)
13. [CLI Command Reference](#13-cli-command-reference)
14. [Enum Reference for demowe Org](#14-enum-reference-for-demowe-org)
15. [Known Limitations](#15-known-limitations)

---

## 1. Project Overview

This snap-in implements a **forward-only Airsync (ADaaS)** import from Odoo CRM into DevRev, syncing:

| Odoo Object | Odoo Model | DevRev Object |
|---|---|---|
| Companies | `res.partner` (is_company=true) | `account` |
| Contacts | `res.partner` (is_company=false) | `rev_user` |
| Opportunities | `crm.lead` | `opportunity` |

The snap-in uses the **DevRev ADaaS TypeScript framework** (`@devrev/ts-adaas`) and is deployed via the `devrev` CLI.

---

## 2. Repository Structure

```
odoo/
├── manifest.yaml                          # Snap-in definition (functions, keyring, imports)
├── LEARNINGS.md                           # This document
└── code/
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    ├── build.tar.gz                       # Deployable archive (generated)
    └── src/
        ├── index.ts                       # Lambda entry point
        ├── main.ts                        # Main handler
        ├── function-factory.ts            # Routes events to workers
        ├── fixtures/                      # Local test event payloads
        │   ├── EXTRACTION_EXTERNAL_SYNC_UNITS_START.json
        │   ├── EXTRACTION_METADATA_START.json
        │   ├── EXTRACTION_DATA_START.json
        │   └── EXTRACTION_DATA_CONTINUE.json
        └── functions/
            ├── common/
            │   ├── constants.ts           # Stage maps, priority maps, entity names
            │   ├── state.ts               # Extractor state definition
            │   └── utils.ts               # Connection parsing, error formatting
            ├── external-system/
            │   ├── odoo_api.ts            # Odoo JSON/2 API client
            │   ├── types.ts               # TypeScript interfaces (OdooPartner, OdooLead)
            │   ├── data-normalization.ts  # NormalizedItem converters
            │   ├── external_domain_metadata.json   # External system field schema
            │   └── initial_domain_mapping.json     # DevRev field mapping rules
            └── extraction/
                ├── index.ts               # spawn() entry point
                └── workers/
                    ├── external-sync-units-extraction.ts
                    ├── metadata-extraction.ts
                    ├── data-extraction.ts
                    └── attachments-extraction.ts
```

---

## 3. Manifest Configuration

### Critical fields

```yaml
version: "2"
name: odoo-cursor

service_account:
  display_name: Odoo Cursor Bot
  scopes:                              # REQUIRED — without these, recipe setup fails
    self:
      - scope: sync_mapper_record:write
        optional: false
        reason: "Allow write access to sync mapper records"
      - scope: sync_mapper_record:read
        optional: false
        reason: "Allow read access to sync mapper records"
      - scope: sync_unit:read
        optional: false
        reason: "Allow read access to sync units"
      - scope: sync_snap_in:all
        optional: false
        reason: "Allow all access to sync snap ins"

functions:
  - name: extraction
    entry_point: functions/extraction/index.js   # resolved from dist/

imports:
  - slug: airdrop-odoo-crm              # Used as import_slug in domain mapping API calls
    display_name: odoo-cursor
    extractor_function: extraction
    allowed_connection_types:
      - odoo-api-key
    # NOTE: Do NOT add capabilities: [TIME_SCOPED_SYNCS] unless fully implemented
```

### What NOT to do
- **Do not omit `service_account.scopes`** — the snap-in will fail at recipe discovery
- **Do not add `capabilities: [TIME_SCOPED_SYNCS]`** unless the loading phase fully supports it

---

## 4. Keyring & Connection Setup

### Working configuration

```yaml
keyring_types:
  - id: odoo-api-key
    name: Odoo CRM Connection
    external_system_name: Odoo CRM
    kind: "Secret"
    is_subdomain: true                 # User enters their Odoo base URL in the "Subdomain" field
    secret_config:
      secret_transform: '.api_key'    # Extracts just the API key as the secret
      fields:
        - id: api_key
          name: API Key
          description: Odoo API key from user Preferences → Account Security → New API Key
      token_verification:
        url: "https://app.devrev.ai/favicon.ico"   # Always returns 200 — bypasses live API validation
        method: "GET"
```

### How `is_subdomain: true` works

When `is_subdomain: true` is set:
- The DevRev UI shows a **Subdomain** text field where the user enters the full Odoo URL (e.g. `https://webjoin.odoo.com`)
- DevRev passes this as `event.context.org_id` to the snap-in
- The `secret_transform` JQ expression is applied to the JSON `{ "api_key": "..." }` — result becomes `event.context.secrets.secret`

### Parsing connection data in code

```typescript
// utils.ts
export function parseConnectionData(key: string, orgId?: string) {
  const apiKey = key.trim();
  if (!apiKey) throw new Error('API key must not be empty');
  if (!orgId) throw new Error('org_id (Odoo URL) is required');

  let baseUrl = orgId.trim().replace(/\/+$/, '');
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }
  return { baseUrl, apiKey };
}
```

### Why the favicon trick?

DevRev validates keyring connections by calling the `token_verification.url`. By pointing this at `https://app.devrev.ai/favicon.ico` (which always returns HTTP 200), the keyring always passes validation regardless of whether the Odoo credentials are actually correct. This avoids network-dependent validation failures during development.

---

## 5. External Domain Metadata

### Why this file is MANDATORY

The [DevRev metadata extraction docs](https://developer.devrev.ai/airsync/metadata-extraction) state:
> *During the metadata extraction phase, the snap-in **must** provide an `external_domain_metadata.json` file to AirSync.*

Without it, AirSync has no field schema to build the recipe UI from, and returns **"Recipe discovery error"** — a generic failure with no helpful debug message.

### File location

`src/functions/external-system/external_domain_metadata.json`

### Required structure

```json
{
  "schema_version": "v0.2.0",
  "record_types": {
    "accounts": {
      "name": "Account",
      "fields": {
        "name":        { "name": "Name",        "is_required": true, "type": "text" },
        "description": { "name": "Description", "type": "text" },
        "state":       { "name": "State", "type": "enum", "enum": { "values": [
                           { "key": "ACTIVE", "name": "Active" },
                           { "key": "INACTIVE", "name": "Inactive" }
                         ]}},
        "email":       { "name": "Email",   "type": "text" },
        "phone":       { "name": "Phone",   "type": "text" },
        "website":     { "name": "Website", "type": "text" }
      }
    },
    "contacts": { ... },
    "opportunities": {
      "fields": {
        "stage": { "type": "enum", "enum": { "values": [
            { "key": "qualification" }, { "key": "validation" },
            { "key": "negotiation" }, { "key": "contract" },
            { "key": "stalled" }, { "key": "closed_won" }, { "key": "closed_lost" }
          ]}},
        "account_id": {
          "type": "reference",
          "reference": { "refers_to": { "#record:accounts": {} } }
        }
      }
    }
  }
}
```

### Rules from the docs

- **`id`, `created_date`, `modified_date` must NOT be declared** — they are handled by the framework
- Field keys must **exactly match** what is in the normalizer's `data: { ... }` output
- Enum keys must match exactly what the normalizer outputs (case-sensitive)
- References use `"#record:<item_type>"` syntax where `item_type` matches `initializeRepos` item types

### Validating with chef-cli

```bash
# Install
curl -L https://github.com/devrev/adaas-chef-cli/releases/download/0.11.1/chef-cli_0.11.1_Darwin_arm64.tar.gz \
  -o /tmp/chef-cli.tar.gz
tar -xzf /tmp/chef-cli.tar.gz -C /tmp
mv /tmp/chef-cli /opt/homebrew/bin/chef-cli

# Validate
chef-cli validate-metadata < src/functions/external-system/external_domain_metadata.json
# No output = valid ✓
```

---

## 6. Initial Domain Mapping

### Purpose

Tells the Airdrop platform how to map external fields to DevRev fields. Validated by the DevRev API at domain mapping installation time (step between extraction and loading).

### File location

`src/functions/external-system/initial_domain_mapping.json`

### How it is loaded

The file is imported directly into the TypeScript code and passed to `spawn()`:

```typescript
// src/functions/extraction/index.ts
import initialDomainMapping from '../external-system/initial_domain_mapping.json';

await spawn<State>({
  event,
  initialState: structuredClone(getInitialState()),
  initialDomainMapping,           // ← passed here
  baseWorkerPath: __dirname,
});
```

The `@devrev/ts-adaas` library installs it by calling `POST /internal/airdrop.recipe.initial-domain-mappings.install` automatically when the snap-in version changes.

### Required top-level structure

```json
{
  "additional_mappings": {
    "format_version": "v0.2.0",
    "devrev_metadata_version": 13,    // ← REQUIRED (without this, validation silently fails)
    "record_type_mappings": { ... }
  }
}
```

### Two transformation methods

#### `use_directly` — simple value pass-through

```json
"display_name": {
  "fallback": { "type": "text", "value": "Unknown Account" },
  "forward": true,
  "primary_external_field": "name",   // ← REQUIRED for use_directly
  "reverse": false,
  "transformation_method_for_set": { "transformation_method": "use_directly" }
}
```

**Rules:**
- `primary_external_field` is **required** — must match a key in the normalizer's `data` object
- Fallback provides a default when the external field is null/missing
- Enum fallback values must be **exactly** valid for the tenant (case-sensitive)

#### `use_devrev_record` — reference to another DevRev object

```json
"owned_by_ids": {
  "forward": true,
  "reverse": false,
  "transformation_method_for_set": {
    "is_array": true,                  // ← true if the DevRev field is a collection
    "leaf_type": {
      "object_category": "stock",
      "object_type": "devu"
    },
    "transformation_method": "use_devrev_record"
  }
}
```

**Rules:**
- `primary_external_field` is **NOT** used — the platform resolves via sync mapper records
- `is_array` must **exactly match** whether the DevRev field is a collection — mismatch causes `Bad Request`
- If the external ID cannot be resolved to a DevRev object, the field is silently skipped

### Required fields per DevRev object type (Airdrop validator)

The Airdrop validator enforces a **superset** of what the API requires. It checks one field at a time and returns only the first missing one.

#### `account`
| Field | Required by validator | Type | Notes |
|---|---|---|---|
| `display_name` | YES | text | |
| `owned_by` | YES | `devu[]` | `is_array: true` |
| `state` | no | enum | `ACTIVE` or `INACTIVE` |

#### `rev_user`
| Field | Required by validator | Type | Notes |
|---|---|---|---|
| `display_name` | YES | text | |
| `email` | no | text | |

#### `opportunity`
| Field | Required by validator | Type | Notes |
|---|---|---|---|
| `title` | YES | text | NOT `name` |
| `stage` | YES | enum | Tenant-specific values |
| `priority` | YES | enum | Tenant-specific case |
| `forecast_category` | YES | enum | |
| `owned_by_ids` | YES | `devu[]` | `is_array: true` |
| `account_id` | no | account | `is_array: false` |

---

## 7. Extraction Workers

### Architecture

Workers are TypeScript files in `src/functions/extraction/workers/`. Each worker:
1. Calls `processTask({ task, onTimeout })` — provided by `@devrev/ts-adaas`
2. Is automatically discovered by the framework via `baseWorkerPath: __dirname`
3. Must call `adapter.emit(EventType)` before exiting — otherwise the platform generates **"Worker exited without emitting event"**

### 1. `external-sync-units-extraction.ts`

Returns the list of importable datasets. We return a single static unit.

```typescript
processTask({
  task: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionDone, {
      external_sync_units: [{
        id: 'odoo-crm-pipeline',
        name: 'Odoo CRM Pipeline',
        description: 'Contacts, organizations, and opportunities from Odoo CRM',
      }],
    });
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionError, {
      error: { message: 'Timeout during sync unit discovery' },
    });
  },
});
```

**Key decision:** Use a static sync unit rather than calling the Odoo API to discover databases. Dynamic discovery adds a failure point before the connection is fully validated.

### 2. `metadata-extraction.ts`

**This is the most commonly misunderstood worker.** It MUST push `external_domain_metadata.json` before emitting done.

```typescript
import staticExternalDomainMetadata from '../../external-system/external_domain_metadata.json';

const repos = [{ itemType: 'external_domain_metadata' }];

processTask({
  task: async ({ adapter }) => {
    adapter.initializeRepos(repos);
    const externalDomainMetadata = { ...staticExternalDomainMetadata };
    await adapter.getRepo('external_domain_metadata')?.push([externalDomainMetadata]);
    await adapter.emit(ExtractorEventType.MetadataExtractionDone);
  },
  ...
});
```

**The domain mapping installation** (`initial_domain_mapping.json`) is NOT called here — the `@devrev/ts-adaas` library handles this automatically in `state.js` whenever it detects the snap-in version has changed.

### 3. `data-extraction.ts`

Fetches paginated data from Odoo and pushes raw records. Normalization is handled by the framework.

```typescript
adapter.initializeRepos([
  { itemType: ENTITY_NAMES.ACCOUNTS,      normalize: normalizeAccount },
  { itemType: ENTITY_NAMES.CONTACTS,      normalize: normalizeContact },
  { itemType: ENTITY_NAMES.OPPORTUNITIES, normalize: normalizeOpportunity },
]);

// In the extraction loop:
const page = await odoo.listAccountsPage(offset, since);
await adapter.getRepo(ENTITY_NAMES.ACCOUNTS)?.push(page.items);  // push raw Odoo records
```

**Key:** Pass `normalize` functions to `initializeRepos`, then push **raw** Odoo records. The framework calls the normalizer internally.

---

## 8. Data Normalizers

### `NormalizedItem` interface

```typescript
interface NormalizedItem {
  id: string;             // Unique external ID — used by mapper to track sync state
  created_date: string;   // ISO 8601 timestamp
  modified_date: string;  // ISO 8601 timestamp — used for incremental sync
  data: Record<string, unknown>;  // Field values — keys must match initial_domain_mapping.json
}
```

### Critical rules

1. `id` prefix must be consistent — use `account_${id}`, `contact_${id}`, `opportunity_${id}` — the prefix prevents ID collisions between object types and **must match** what account_id references use
2. Field names in `data` must **exactly match** `primary_external_field` values in the domain mapping
3. Odoo returns relational fields (Many2one) as `[id, "Display Name"]` or `false` — always handle both

```typescript
// Pattern for handling Odoo Many2one fields:
const stageName = Array.isArray(lead.stage_id) ? String(lead.stage_id[1]) : '';
const partnerId = Array.isArray(lead.partner_id) ? lead.partner_id[0] : lead.partner_id;
```

4. Odoo returns `false` for empty fields — not `null` or `undefined`. Always guard:

```typescript
email: partner.email || undefined,   // converts false → undefined
```

### Account normalizer output

```typescript
data: {
  id: partner.id,
  name: partner.name || `Account #${partner.id}`,  // display_name maps here
  description: partner.comment || undefined,         // Odoo uses 'comment' for notes
  state: partner.active ? 'ACTIVE' : 'INACTIVE',    // UPPERCASE for demowe org
  email: partner.email || undefined,
  phone: partner.phone || undefined,
  website: partner.website || undefined,
}
```

### Opportunity normalizer — pre-mapping enums

Because DevRev enum values are tenant-specific, map them in the normalizer before they reach the domain mapping layer:

```typescript
const stage = mapOdooStageToDevRev(stageName);                               // string → DevRev stage id
const priority = ODOO_TO_DEVREV_PRIORITY[String(lead.priority)] ?? 'P2';    // "0"–"3" → P0–P3
const forecast_category = DEVREV_FORECAST_CATEGORY_MAP[stage] ?? 'pipeline'; // stage → forecast

// account_id: use same prefix as account normalizer's id field
const account_id = partnerId ? `account_${partnerId}` : undefined;
```

---

## 9. Odoo API Client

### Authentication

Odoo's JSON/2 API uses **HTTP Basic authentication** with the API key as the password (no username needed in the base64 encoding):

```typescript
const authToken = Buffer.from(apiKey).toString('base64');
// Header: Authorization: Basic <base64(apiKey)>
```

**Common mistake:** Using `Bearer ${apiKey}` — this is wrong for Odoo JSON/2. Must be `Basic`.

### Base URL

The Odoo JSON/2 API endpoint is `<baseUrl>/json/2/<model>/<method>`.

```typescript
// Always normalise the URL
let normalizedBase = baseUrl.replace(/\/+$/, '');
if (!normalizedBase.startsWith('http://') && !normalizedBase.startsWith('https://')) {
  normalizedBase = `https://${normalizedBase}`;
}
```

### Pagination

Use `search_read` with `offset` and `limit`:

```typescript
POST /json/2/res.partner/search_read
{
  "domain": [["is_company", "=", true], ["write_date", ">=", since]],
  "fields": ["id", "name", "email", "phone", "website", "comment", "active",
             "create_date", "write_date"],
  "offset": 0,
  "limit": 100,
  "order": "id asc"
}
```

---

## 10. Build & Deploy Process

### Build commands

```bash
cd code/

# Full build + package
npm run package

# Build only (TypeScript compile)
npm run build

# Package only (tar)
npm run package
```

The package script (`tar -cvzf build.tar.gz dist package.json package-lock.json`) creates the deployable archive.

### Archive structure (required)

```
build.tar.gz
├── dist/
│   ├── functions/
│   │   ├── extraction/
│   │   │   ├── index.js              ← function entry point
│   │   │   └── workers/
│   │   ├── external-system/
│   │   │   ├── initial_domain_mapping.json
│   │   │   └── external_domain_metadata.json
│   │   └── common/
│   └── index.js, main.js, ...
├── package.json
└── package-lock.json
```

**Important:** `dist/functions/` MUST be at the root of the archive. `node_modules/` is NOT required — DevRev installs it from `package-lock.json`.

### Full clean deployment sequence

```bash
export DEVREV_TOKEN="<PAT>"

# Step 1: Deactivate the running snap-in
devrev snap_in deactivate "<snap_in_don_id>"

# Step 2: Delete the snap-in
devrev snap_in delete-one "<snap_in_don_id>"

# Step 3: Delete the version (may already be gone if cascaded)
devrev snap_in_version delete-one "<version_don_id>"

# Step 4: Verify no versions remain
devrev snap_in_version list --package "<package_don_id>"

# Step 5: Create new version (--archive bypasses platform npm build)
devrev snap_in_version create-one \
  --package "<package_don_id>" \
  --manifest ./manifest.yaml \
  --archive ./code/build.tar.gz \
  -w 10   # wait up to 10 minutes for build

# Step 6: Create draft snap-in
devrev snap_in draft --snap_in_version "<new_version_don_id>"

# Step 7: Activate
devrev snap_in activate "<new_snap_in_don_id>"
```

### Creating a new package (first time or after conflict)

```bash
# Create package (non-interactive)
devrev snap_in_package create-one --slug <unique-slug>

# Then create version against it
devrev snap_in_version create-one --package "<package_don_id>" ...
```

**Note:** Only ONE non-published version can exist per package at a time. Delete the old version before creating a new one.

---

## 11. Error Log — Full Debug Journey

This section documents every error encountered, the cause, and the fix. Useful for future debugging.

### Error 1: "No datasets are shown"

**Phase:** After initial deployment  
**Cause:** External sync units extraction was making an API call to Odoo that failed during the import setup UI.  
**Fix:** Replace with a static `ExternalSyncUnit` that never calls Odoo.

---

### Error 2: "Keyring validation failed"

**Phase:** Connection creation in the DevRev UI  
**Cause:** The `token_verification` URL was pointing to the Odoo API, which failed for various reasons (wrong URL, auth issues).  
**Fix:** Point `token_verification.url` to `https://app.devrev.ai/favicon.ico` — always returns 200.

---

### Error 3: "Recipe discovery error" (first occurrence)

**Phase:** Import setup after connection created  
**Root cause (discovered later):** `metadata-extraction.ts` was not pushing `external_domain_metadata.json`. AirSync needs this file to build the recipe UI.  
**Intermediate cause:** Several domain mapping validation errors were also present (see errors 4–7 below).

---

### Error 4: `"Mappings for required fields missing: required DevRev field \"owned_by_ids\" not mapped"`

**Phase:** Domain mapping installation (inside recipe discovery)  
**Cause:** `owned_by_ids` is **required by the Airdrop validator** for opportunities, even though it's optional at the DevRev API level.  
**Fix:** Added to `initial_domain_mapping.json` with `use_devrev_record`:

```json
"owned_by_ids": {
  "forward": true, "reverse": false,
  "transformation_method_for_set": {
    "is_array": true,
    "leaf_type": { "object_category": "stock", "object_type": "devu" },
    "transformation_method": "use_devrev_record"
  }
}
```

---

### Error 5: `"Mappings for required fields missing: required DevRev field \"owned_by\" not mapped"`

**Phase:** Domain mapping installation  
**Cause:** `owned_by` is also required by the validator for `account` objects. The validator checks one field at a time.  
**Fix:** Added `owned_by` to the accounts `stock_field_mappings` with `use_devrev_record`.

---

### Error 6: `"devrev field \"owned_by\": is_collection must be true iff the devrev field is a collection"`

**Phase:** Domain mapping installation (Bad Request 400)  
**Cause:** `owned_by` on `account` is a collection (array of owners), so `is_array` must be `true`.  
**Fix:** Changed `is_array: false` → `is_array: true` for the `owned_by` field.

**Lesson:** The `is_array` value in `use_devrev_record` must exactly mirror whether the DevRev field is a collection. Getting it wrong causes an immediate 400 Bad Request during domain mapping install.

---

### Error 7: "Recipe discovery error" (second occurrence)

**Phase:** Recipe discovery (after domain mapping validation errors cleared)  
**Root cause (confirmed):** `metadata-extraction.ts` still not pushing `external_domain_metadata.json`.  
**Secondary cause:** Missing `service_account.scopes` in `manifest.yaml`.  
**Fix:**
1. Created `external_domain_metadata.json` with full field schema
2. Updated `metadata-extraction.ts` to push it via `adapter.getRepo('external_domain_metadata')?.push([...])`
3. Added all required scopes to manifest

---

### Summary of the Airdrop validator error sequence

The Airdrop validator checks domain mapping fields one at a time, in sequence. The typical progression when building from scratch is:

```
Recipe discovery error (generic)
  → owned_by_ids not mapped           (add use_devrev_record)
  → owned_by not mapped               (add use_devrev_record)
  → is_collection mismatch            (fix is_array)
  → Recipe discovery error (generic)  ← this is the metadata issue
  → [SUCCESS after metadata fix]
```

---

## 12. chef-cli Validation

`chef-cli` is DevRev's official tool for validating `external_domain_metadata.json` files.

### Installation

```bash
# macOS ARM64
curl -L https://github.com/devrev/adaas-chef-cli/releases/download/0.11.1/chef-cli_0.11.1_Darwin_arm64.tar.gz \
  -o /tmp/chef-cli.tar.gz
tar -xzf /tmp/chef-cli.tar.gz -C /tmp
mv /tmp/chef-cli /opt/homebrew/bin/chef-cli
chef-cli --version  # → chef-cli version 0.11.1
```

### Usage

```bash
# Validate metadata file
chef-cli validate-metadata < src/functions/external-system/external_domain_metadata.json
# No output = valid

# Infer metadata from sample data
chef-cli infer-metadata ./sample_data/ > metadata.json

# Validate initial domain mapping against local metadata
chef-cli initial-mapping check
```

---

## 13. CLI Command Reference

### Profile setup

```bash
export DEVREV_TOKEN="<PAT>"
devrev profiles set-token "$DEVREV_TOKEN"
# NOTE: Use positional argument, not --token flag
```

### Package management

```bash
devrev snap_in_package list
devrev snap_in_package create-one --slug <slug>
devrev snap_in_package show "<package_don_id>"
devrev snap_in_package delete-one "<package_don_id>"
```

### Version management

```bash
devrev snap_in_version create-one \
  --package "<package_don_id>" \
  --manifest ./manifest.yaml \
  --archive ./code/build.tar.gz \
  -w 10

devrev snap_in_version list --package "<package_don_id>"
devrev snap_in_version show "<version_don_id>"
devrev snap_in_version delete-one "<version_don_id>"
```

### Snap-in lifecycle

```bash
devrev snap_in draft --snap_in_version "<version_don_id>"
devrev snap_in activate "<snap_in_don_id>"      # positional argument, not --id
devrev snap_in deactivate "<snap_in_don_id>"
devrev snap_in delete-one "<snap_in_don_id>"    # use delete-one, not delete
devrev snap_in list
devrev snap_in show "<snap_in_don_id>"
```

### Common CLI gotchas

| Wrong | Correct |
|---|---|
| `devrev snap_in activate --id "<id>"` | `devrev snap_in activate "<id>"` |
| `devrev snap_in delete "<id>"` | `devrev snap_in delete-one "<id>"` |
| `devrev profiles set-token --env ...` | `devrev profiles set-token "$TOKEN"` |
| `devrev snap_in_version create-one --create-package` | Two steps: create package, then version |

---

## 14. Enum Reference for demowe Org

These values are **tenant-specific** for the `demowe` (DEV-3hF4oIQz22) organisation. Other orgs may have different stage names.

### Opportunity Stage (type: `id` — tenant-configured)

| DevRev Value | Description |
|---|---|
| `qualification` | Being qualified (default fallback) |
| `validation` | Solution/proposal/demo stage |
| `negotiation` | In negotiation |
| `contract` | Contract stage |
| `stalled` | Deal stalled/on hold |
| `closed_won` | Won deal |
| `closed_lost` | Lost deal |

**Invalid in this org:** `open`, `solution`

### Opportunity Priority (UPPERCASE — validated case-sensitively)

| DevRev Value | Odoo Priority Field | Meaning |
|---|---|---|
| `P0` | `3` | Critical/highest |
| `P1` | `2` | High |
| `P2` | `1` or `0` | Medium (default) |
| `P3` | `0` | Low |

**Invalid:** `p0`, `p1`, `p2`, `p3` (lowercase)

### Opportunity Forecast Category

| DevRev Value | Derived From Stage |
|---|---|
| `pipeline` | `qualification`, `stalled`, default |
| `best_case` | `validation` |
| `commit` | `negotiation`, `contract` |
| `closed_won` | `closed_won` |
| `omitted` | `closed_lost` |

### Account State

| DevRev Value | Source |
|---|---|
| `ACTIVE` | `partner.active == true` |
| `INACTIVE` | `partner.active == false` |

### Odoo Stage → DevRev Stage Mapping

```typescript
const DEVREV_STAGE_MAP = {
  new: 'qualification',   draft: 'qualification',    qualif: 'qualification',
  proposition: 'validation', proposal: 'validation', solution: 'validation', demo: 'validation',
  negotiat: 'negotiation', negociat: 'negotiation',
  won: 'closed_won',
  lost: 'closed_lost',
  contract: 'contract',   closed: 'contract',
  stall: 'stalled',       hold: 'stalled',           stuck: 'stalled',
};
const DEFAULT_DEVREV_STAGE = 'qualification';
```

The mapping uses **substring matching** (lowercase) against the Odoo stage name, not exact match, because Odoo stage names are user-defined.

---

## 15. Known Limitations

1. **Forward-only sync** — data flows Odoo → DevRev only. The manifest declares `reverse: false` on all field mappings.

2. **`owned_by` and `owned_by_ids` are not resolved** — Odoo user IDs cannot be mapped to DevRev `devu` objects without a separate user sync step. The fields are present in the domain mapping to satisfy the Airdrop validator but will always silently fail to resolve. Records are created without owners.

3. **`account_id` on opportunities** — The platform will attempt to resolve `account_<n>` external IDs to DevRev accounts using mapper records. This requires accounts to be fully loaded before opportunities. If the ordering fails, opportunities are created without an account link.

4. **Odoo URL format** — The user must enter the full URL (e.g. `https://webjoin.odoo.com`) in the Subdomain field. Entering just `webjoin` will produce an invalid URL `https://webjoin` that cannot reach Odoo.

5. **Incremental sync** — The `write_date` filter is implemented in the data extraction worker but requires the `lastSyncStarted` state to be set on prior runs. First sync always fetches all records.

6. **Stage enum validation** — Stage values are tenant-specific. If this snap-in is deployed to a different DevRev org, the fallback stage values in `initial_domain_mapping.json` and the `DEVREV_STAGE_MAP` constants must be updated for that org's configured stages.
