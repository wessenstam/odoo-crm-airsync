import { ExtractorEventType, processTask, WorkerAdapter } from '@devrev/ts-adaas';
import type { State } from '../../common/state';

// Odoo CRM does not expose attachment blobs via the JSON-2 API in a way
// that maps cleanly to Airdrop attachments. This worker completes immediately.
processTask({
  onTimeout: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    await adapter.emit(ExtractorEventType.AttachmentExtractionDone);
  },
  task: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    await adapter.emit(ExtractorEventType.AttachmentExtractionDone);
  },
});
