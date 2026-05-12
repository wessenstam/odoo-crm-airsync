import { ExtractorEventType, processTask } from '@devrev/ts-adaas';
import staticExternalDomainMetadata from '../../external-system/external_domain_metadata.json';

const repos = [{ itemType: 'external_domain_metadata' }];

processTask({
  task: async ({ adapter }) => {
    adapter.initializeRepos(repos);
    const externalDomainMetadata = { ...staticExternalDomainMetadata };
    await adapter.getRepo('external_domain_metadata')?.push([externalDomainMetadata]);
    await adapter.emit(ExtractorEventType.MetadataExtractionDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.MetadataExtractionError, {
      error: { message: 'Failed to extract metadata. Lambda timeout.' },
    });
  },
});
