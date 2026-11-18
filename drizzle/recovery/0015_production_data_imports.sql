-- Recovery is allowed only before any import batch has become authoritative.
-- Back up the database and confirm no imported record is in business use.
DROP TABLE import_mutations;
DROP TABLE import_crosswalks;
DROP TABLE import_approvals;
DROP TABLE import_rows;
DROP TABLE import_batches;

