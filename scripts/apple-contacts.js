/* Run with: osascript -l JavaScript scripts/apple-contacts.js */

function safe(read, fallback = '') {
  try {
    const value = read();
    return value == null ? fallback : String(value);
  } catch (_error) {
    return fallback;
  }
}

function run() {
  const Contacts = Application('Contacts');
  const people = Contacts.people();

  return JSON.stringify(people.map((person) => {
    const givenName = safe(() => person.firstName());
    const familyName = safe(() => person.lastName());
    const organizationName = safe(() => person.organization());
    const displayName = safe(() => person.name()) || [givenName, familyName].filter(Boolean).join(' ') || organizationName;
    return {
      identifier: safe(() => person.id()),
      fullName: displayName,
      givenName,
      familyName,
      organizationName,
      jobTitle: safe(() => person.jobTitle()),
      notes: safe(() => person.note()),
      emails: person.emails().map((item) => ({
        value: safe(() => item.value()),
        label: safe(() => item.label()),
      })).filter((item) => item.value),
      phones: person.phones().map((item) => ({
        value: safe(() => item.value()),
        label: safe(() => item.label()),
      })).filter((item) => item.value),
    };
  }).filter((person) => person.fullName));
}
