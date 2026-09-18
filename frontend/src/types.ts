export type PersonListItem = {
  id: number;
  fullName: string;
  preferredName: string | null;
  company: string | null;
  field: string | null;
  notes: string | null;
  source: string;
  updatedAt: string;
  contactSummary: string | null;
  affiliations: string | null;
  introducedBy: string | null;
};

export type ContactMethod = {
  id?: number;
  type: string;
  value: string;
  label?: string | null;
  source?: string;
};

export type RelatedPerson = { id: number; fullName: string; context?: string | null };

export type Person = {
  id?: number;
  fullName: string;
  preferredName: string | null;
  company: string | null;
  field: string | null;
  context: string | null;
  notes: string | null;
  source?: string;
  appleContactId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastSyncedFromContactsAt?: string | null;
  rawSourceData?: unknown;
  contactMethods: ContactMethod[];
  affiliations: Array<{ id: number; name: string }>;
  introducedBy: RelatedPerson[];
  introducedTo: RelatedPerson[];
};

export type Conflict = {
  id: number;
  source: string;
  conflictType: 'field' | 'possible_duplicate';
  incomingName: string;
  incomingPersonId: number | null;
  incomingPersonName: string | null;
  possiblePersonId: number | null;
  possiblePersonName: string | null;
  field: string | null;
  incomingValue: string | null;
  existingValue: string | null;
  createdAt: string;
};

export type SyncRun = {
  id: number;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  summary: string | null;
};
