UPDATE contact_methods
SET label = substr(label, 5, length(label) - 8)
WHERE substr(label, 1, 4) = '_$!<' AND substr(label, -4) = '>!$_';

UPDATE contact_methods
SET label = NULL
WHERE lower(trim(label)) = lower(trim(type));
