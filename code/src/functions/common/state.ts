export interface EntityState {
  completed: boolean;
  offset: number;
  extractedCount: number;
  skipped?: boolean;
  lastWriteDate?: string;
}

export interface State {
  accounts: EntityState;
  contacts: EntityState;
  opportunities: EntityState;
  lastSyncStarted?: string;
  lastSuccessfulSyncStarted?: string;
}

export function getInitialState(): State {
  return {
    accounts: { completed: false, offset: 0, extractedCount: 0 },
    contacts: { completed: false, offset: 0, extractedCount: 0 },
    opportunities: { completed: false, offset: 0, extractedCount: 0 },
  };
}
