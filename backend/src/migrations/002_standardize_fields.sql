-- Irvington High School appeared as two separate affiliation tags.
INSERT OR IGNORE INTO affiliations (name) VALUES ('Irvington');
INSERT OR IGNORE INTO person_affiliations (person_id, affiliation_id)
SELECT pa.person_id, canonical.id
FROM person_affiliations pa
JOIN affiliations old ON old.id = pa.affiliation_id
JOIN affiliations canonical ON canonical.name = 'Irvington' COLLATE NOCASE
WHERE old.name IN ('High School', 'Irvington High School') COLLATE NOCASE;
DELETE FROM person_affiliations
WHERE affiliation_id IN (SELECT id FROM affiliations WHERE name IN ('High School', 'Irvington High School') COLLATE NOCASE);
DELETE FROM affiliations WHERE name IN ('High School', 'Irvington High School') COLLATE NOCASE;

-- South Park Commons stays abbreviated as SPC.
INSERT OR IGNORE INTO affiliations (name) VALUES ('SPC');
INSERT OR IGNORE INTO person_affiliations (person_id, affiliation_id)
SELECT pa.person_id, canonical.id
FROM person_affiliations pa
JOIN affiliations old ON old.id = pa.affiliation_id
JOIN affiliations canonical ON canonical.name = 'SPC' COLLATE NOCASE
WHERE old.name = 'South Park Commons' COLLATE NOCASE;
DELETE FROM person_affiliations
WHERE affiliation_id IN (SELECT id FROM affiliations WHERE name = 'South Park Commons' COLLATE NOCASE);
DELETE FROM affiliations WHERE name = 'South Park Commons' COLLATE NOCASE;

-- Existing freeform SPC organization values are affiliations, not companies.
INSERT OR IGNORE INTO person_affiliations (person_id, affiliation_id)
SELECT p.id, a.id FROM people p JOIN affiliations a ON a.name = 'SPC' COLLATE NOCASE
WHERE lower(trim(p.company)) = 'spc' OR lower(trim(p.company)) LIKE 'spc %';
UPDATE people SET field = 'Head'
WHERE lower(trim(company)) = 'spc head' AND (field IS NULL OR trim(field) = '');
UPDATE people SET company = NULL
WHERE lower(trim(company)) = 'spc' OR lower(trim(company)) LIKE 'spc %';

-- Collapse the legacy title column into field. Known role aliases are expanded.
UPDATE people SET field = CASE
  WHEN lower(trim(title)) = 'sp' THEN 'Strat and Product'
  WHEN lower(trim(title)) IN ('quant trader', 'quantitative trader', 'qt') THEN 'Quant'
  WHEN field IS NULL OR trim(field) = '' THEN trim(title)
  ELSE field
END
WHERE title IS NOT NULL AND trim(title) != '';
UPDATE people SET title = NULL;

-- Preserve the role encoded after JS before canonicalizing the company.
UPDATE people SET field = CASE
  WHEN lower(trim(company)) IN ('js sp', 'jane street sp') THEN 'Strat and Product'
  WHEN lower(trim(company)) IN ('js qt', 'jane street/quant', 'jane street / quant') THEN 'Quant'
  WHEN lower(trim(company)) IN ('js funda', 'js fundamental') THEN 'Quant'
  WHEN lower(trim(company)) = 'js ml' THEN 'Machine Learning'
  WHEN lower(trim(company)) LIKE 'js swe%' THEN 'Software Engineering'
  WHEN lower(trim(company)) = 'js tdoe' THEN 'TDOE'
  ELSE field
END
WHERE field IS NULL OR trim(field) = '';

UPDATE people SET company = 'Jane Street'
WHERE lower(trim(company)) = 'js'
   OR lower(trim(company)) LIKE 'js %'
   OR lower(trim(company)) LIKE 'js/%'
   OR lower(trim(company)) LIKE 'jane street/%'
   OR lower(trim(company)) LIKE 'jane street /%'
   OR lower(trim(company)) = 'jane street sp';

UPDATE people SET field = 'Finance' WHERE lower(trim(field)) = 'finance';
