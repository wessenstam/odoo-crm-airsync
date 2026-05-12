import { ExtractorEventType, processTask, WorkerAdapter } from '@devrev/ts-adaas';
import type { State } from '../../common/state';
import { OdooClient } from '../../external-system/odoo_api';
import {
  normalizeAccount,
  normalizeContact,
  normalizeOpportunity,
} from '../../external-system/data-normalization';
import {
  ADAPTER_TIMEOUT_DELAY_MS,
  ENTITY_NAMES,
  PAGE_SIZE,
} from '../../common/constants';
import { formatError, parseConnectionData, wait } from '../../common/utils';

const BATCH_SIZE = PAGE_SIZE;

processTask({
  onTimeout: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    await adapter.postState();
    await adapter.emit(ExtractorEventType.DataExtractionProgress);
  },
  task: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    const connectionData = adapter.event.payload.connection_data as {
      key: string;
      org_id?: string;
    };

    let baseUrl: string;
    let apiKey: string;
    try {
      ({ baseUrl, apiKey } = parseConnectionData(connectionData.key, connectionData.org_id));
    } catch (err) {
      await adapter.emit(ExtractorEventType.DataExtractionError, {
        error: { message: `Invalid connection data: ${formatError(err)}` },
      });
      return;
    }

    const odoo = new OdooClient(baseUrl, apiKey);

    adapter.initializeRepos([
      { itemType: ENTITY_NAMES.ACCOUNTS, normalize: normalizeAccount },
      { itemType: ENTITY_NAMES.CONTACTS, normalize: normalizeContact },
      { itemType: ENTITY_NAMES.OPPORTUNITIES, normalize: normalizeOpportunity },
    ]);

    if (!adapter.state.lastSyncStarted) {
      adapter.state.lastSyncStarted = new Date().toISOString();
    }
    const since = adapter.state.lastSuccessfulSyncStarted;

    // ── Accounts ─────────────────────────────────────────────────────────────
    if (!adapter.state.accounts.completed) {
      try {
        let offset = adapter.state.accounts.offset;
        let hasMore = true;
        while (hasMore) {
          if (adapter.isTimeout) {
            await wait(ADAPTER_TIMEOUT_DELAY_MS);
            return;
          }
          const page = await odoo.listAccountsPage(offset, since);
          if (page.items.length > 0) {
            await adapter.getRepo(ENTITY_NAMES.ACCOUNTS)?.push(page.items);
            adapter.state.accounts.extractedCount += page.items.length;
            offset += page.items.length;
            adapter.state.accounts.offset = offset;
          }
          hasMore = page.items.length === BATCH_SIZE;
        }
        adapter.state.accounts.completed = true;
        await adapter.postState();
        console.log(`[data-extraction] Accounts done: ${adapter.state.accounts.extractedCount}`);
      } catch (err) {
        console.warn('[data-extraction] Accounts failed, skipping:', formatError(err));
        adapter.state.accounts.completed = true;
        await adapter.postState();
      }
    }

    // ── Contacts ─────────────────────────────────────────────────────────────
    if (!adapter.state.contacts.completed) {
      try {
        let offset = adapter.state.contacts.offset;
        let hasMore = true;
        while (hasMore) {
          if (adapter.isTimeout) {
            await wait(ADAPTER_TIMEOUT_DELAY_MS);
            return;
          }
          const page = await odoo.listContactsPage(offset, since);
          if (page.items.length > 0) {
            await adapter.getRepo(ENTITY_NAMES.CONTACTS)?.push(page.items);
            adapter.state.contacts.extractedCount += page.items.length;
            offset += page.items.length;
            adapter.state.contacts.offset = offset;
          }
          hasMore = page.items.length === BATCH_SIZE;
        }
        adapter.state.contacts.completed = true;
        await adapter.postState();
        console.log(`[data-extraction] Contacts done: ${adapter.state.contacts.extractedCount}`);
      } catch (err) {
        console.warn('[data-extraction] Contacts failed, skipping:', formatError(err));
        adapter.state.contacts.completed = true;
        await adapter.postState();
      }
    }

    // ── Opportunities ────────────────────────────────────────────────────────
    if (!adapter.state.opportunities.completed) {
      try {
        let offset = adapter.state.opportunities.offset;
        let hasMore = true;
        while (hasMore) {
          if (adapter.isTimeout) {
            await wait(ADAPTER_TIMEOUT_DELAY_MS);
            return;
          }
          const page = await odoo.listOpportunitiesPage(offset, since);
          if (page.items.length > 0) {
            await adapter.getRepo(ENTITY_NAMES.OPPORTUNITIES)?.push(page.items);
            adapter.state.opportunities.extractedCount += page.items.length;
            offset += page.items.length;
            adapter.state.opportunities.offset = offset;
          }
          hasMore = page.items.length === BATCH_SIZE;
        }
        adapter.state.opportunities.completed = true;
        await adapter.postState();
        console.log(`[data-extraction] Opportunities done: ${adapter.state.opportunities.extractedCount}`);
      } catch (err) {
        console.warn('[data-extraction] Opportunities failed, skipping:', formatError(err));
        adapter.state.opportunities.completed = true;
        await adapter.postState();
      }
    }

    adapter.state.lastSuccessfulSyncStarted = adapter.state.lastSyncStarted;
    await adapter.emit(ExtractorEventType.DataExtractionDone);
  },
});
