export type ContactMethodInput = {
  id?: number;
  type: string;
  value: string;
  label?: string | null;
  source?: string;
};

export type PersonInput = {
  fullName: string;
  preferredName?: string | null;
  company?: string | null;
  field?: string | null;
  context?: string | null;
  notes?: string | null;
  contactMethods?: ContactMethodInput[];
  affiliations?: string[];
  introducedToIds?: number[];
  introducedByIds?: number[];
  introducedToNames?: string[];
  introducedByNames?: string[];
};

export type AppleContact = {
  identifier: string;
  fullName: string;
  givenName: string;
  familyName: string;
  organizationName: string;
  jobTitle: string;
  notes?: string;
  emails: Array<{ value: string; label: string }>;
  phones: Array<{ value: string; label: string }>;
};
