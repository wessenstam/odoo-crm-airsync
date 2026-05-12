import { ExtractorEventType, processTask, WorkerAdapter } from '@devrev/ts-adaas';
import type { State } from '../../common/state';
import { formatError } from '../../common/utils';

processTask({
  onTimeout: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionError, {
      error: { message: 'Timeout during sync unit discovery' },
    });
  },
  task: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    try {
      await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionDone, {
        external_sync_units: [
          {
            id: 'odoo-crm-pipeline',
            name: 'Odoo CRM Pipeline',
            description: 'Contacts, organizations, and opportunities from Odoo CRM',
          },
        ],
      });
    } catch (error) {
      console.error('[external-sync-units-extraction] Failed:', formatError(error));
      await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionError, {
        error: { message: formatError(error) },
      });
    }
  },
});
