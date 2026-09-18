# Sync behavior

## Apple Contacts

The backend invokes `scripts/apple-contacts.js` through macOS's built-in automation interface. It emits only local JSON to the backend process and reads name, organization, role, notes, emails, and phone numbers for every contact.

Matching order:

1. Previously stored Apple contact identifier.
2. Exact normalized email or phone number.
3. Exact normalized full name.
4. Similar name (Dice score of at least 0.86), which creates a separate person plus a possible-duplicate review item.
5. No match, which creates a new person.

Emails and phones are additive, with phone shown first whenever one is available. Company and field/role fill empty app fields; differing non-empty companies become review items. Recognized Apple Notes keywords can add affiliations or fill company, field/role, and meeting context. App notes and existing relationship metadata are never replaced.

## Dashboard overrides

Dashboard saves compare the submitted record to its previous state and record overrides per field. Overrides include company, field/role, meeting context, notes, affiliations, email methods, phone methods, and other contact methods. Clearing a field also counts as an explicit override.

On later Apple syncs, an overridden field is skipped entirely: it is not filled, re-added, or sent back to the review queue because Apple has an older value. Email and phone are tracked separately, so editing a phone does not prevent a new Apple email from syncing. The ledger is stored in `person_field_overrides`.

This is deliberately one-way: the app does not write Rolodex notes or metadata back into Apple Contacts. That preserves Apple Contacts as a low-friction capture source without risking unexpected system-address-book mutations.

## Notion

Multiple CSVs can be supplied in one run. Rows are matched by normalized name. Distinct affiliations and contact values are unioned, and distinct notes are retained together. Conflicting company or field values remain unchanged until reviewed.

Every non-empty named row is stored verbatim in `import_rows` and also associated with the person's raw source data. The original CSV files are therefore not required during normal use.

`Introduced me to:` creates a directed edge from the row's person to each listed person. Parenthetical text such as `Name (how they are relevant)` becomes context on that edge rather than part of the person's name.

## Review actions

- **Merge people** moves contact methods, affiliations, introduction edges, import links, and safe missing fields into the selected existing person.
- **Keep separate** confirms a fuzzy match represents two people.
- **Use incoming** applies a conflicting company or field value.
- **Keep in Rolodex** keeps the existing value.
- **Ignore** resolves the review item without changing either value.
