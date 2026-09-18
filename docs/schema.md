# Database schema

SQLite migrations live in `backend/src/migrations`. They run automatically whenever the backend or an import command opens the database.

## Core records

- `people`: one canonical row per person, including company, field/role, app-owned notes, and Apple sync identity. The original `title` column remains only as an empty legacy column for migration compatibility and is not exposed by the app.
- `contact_methods`: emails, phones, social profiles, messaging handles, and unstructured legacy contact descriptions.
- `affiliations` and `person_affiliations`: reusable tags such as UChicago, SPC, or Jane Street.
- `organizations` and `person_organizations`: structured company, school, fund, club, and community relationships for future use.
- `introductions`: directed edges. `from_person_id → to_person_id` means the first person introduced the user to the second.

## Audit and review records

- `sync_runs`: one summary record per Notion import or Apple Contacts sync.
- `sync_conflicts`: pending and resolved field conflicts or possible duplicates.
- `person_field_overrides`: per-person fields explicitly changed or cleared in the dashboard; Apple sync skips these fields.
- `import_rows`: every original CSV row as JSON, with its source filename, row number, run, and matched person.
- `schema_migrations`: applied migration versions.

Foreign keys and WAL mode are enabled whenever the app opens SQLite. Contact methods and introduction edges have uniqueness constraints so repeated syncs do not multiply identical records.
