-- "Recently updated" should follow real edits, not sync bookkeeping.
--
-- Every Apple Contacts sync writes last_synced_from_contacts_at and
-- raw_source_data for each contact it sees, whether or not anything about that
-- person changed. The original trigger fired on any column, so a sync stamped
-- the whole table with one timestamp. Sorting by updated_at then produced a
-- single tie broken by the secondary sort, and the list came back alphabetical.
--
-- Scoping the trigger to the columns a person's details actually live in leaves
-- apple_contact_id, last_synced_from_contacts_at, and raw_source_data as silent
-- bookkeeping writes. Changes that live in other tables -- emails, phones, and
-- affiliations -- are stamped explicitly by the sync instead.

DROP TRIGGER IF EXISTS people_updated_at;

CREATE TRIGGER people_updated_at
AFTER UPDATE OF full_name, preferred_name, company, field, context, notes ON people
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE people SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
