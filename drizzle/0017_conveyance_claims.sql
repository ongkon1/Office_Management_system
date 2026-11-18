-- BE-1110..BE-1133: durable conveyance claims on the shared approval chain.
-- Recovery: drizzle/recovery/0017_conveyance_claims.sql

CREATE TABLE conveyance_claims (
  id CHAR(36) PRIMARY KEY,
  reference VARCHAR(40) NOT NULL,
  submitter_user_id CHAR(36) NOT NULL,
  submitter_employee_id CHAR(36) NOT NULL,
  submitter_role ENUM('employee','team_lead') NOT NULL,
  assigned_team_lead_employee_id CHAR(36) NULL,
  business_name VARCHAR(240) NOT NULL,
  client_name VARCHAR(240) NOT NULL,
  visited_at_utc DATETIME(6) NOT NULL,
  visited_local_date DATE NOT NULL,
  visited_local_time TIME NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  travel_mode ENUM('self','uber','other') NOT NULL,
  travel_mode_description VARCHAR(240) NULL,
  amount DECIMAL(19,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  receipt_attachment_id CHAR(36) NULL,
  stage ENUM('team_lead_review','reviewer_review','decided') NOT NULL,
  outcome ENUM('approved','rejected','withdrawn') NULL,
  submitted_at_utc DATETIME(6) NOT NULL,
  submitted_local_date DATE NOT NULL,
  submitted_timezone VARCHAR(64) NOT NULL,
  decided_at_utc DATETIME(6) NULL,
  created_by_user_id CHAR(36) NOT NULL,
  updated_by_user_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_conveyance_reference(reference),
  UNIQUE KEY uq_conveyance_receipt(receipt_attachment_id),
  KEY ix_conveyance_submitter(submitter_user_id,submitted_at_utc),
  KEY ix_conveyance_team_lead(assigned_team_lead_employee_id,stage,submitted_at_utc),
  KEY ix_conveyance_stage(stage,submitted_at_utc),
  CONSTRAINT chk_conveyance_amount CHECK(amount >= 0),
  CONSTRAINT chk_conveyance_mode_description CHECK(
    (travel_mode='other' AND travel_mode_description IS NOT NULL AND CHAR_LENGTH(TRIM(travel_mode_description))>0)
    OR (travel_mode<>'other' AND travel_mode_description IS NULL)
  ),
  CONSTRAINT chk_conveyance_terminal CHECK(
    (stage='decided' AND outcome IS NOT NULL AND decided_at_utc IS NOT NULL)
    OR (stage<>'decided' AND outcome IS NULL AND decided_at_utc IS NULL)
  ),
  CONSTRAINT chk_conveyance_team_lead_submitter CHECK(submitter_role='employee' OR assigned_team_lead_employee_id IS NULL),
  CONSTRAINT fk_conveyance_submitter_user FOREIGN KEY(submitter_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_conveyance_submitter_employee FOREIGN KEY(submitter_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT fk_conveyance_team_lead FOREIGN KEY(assigned_team_lead_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT fk_conveyance_receipt FOREIGN KEY(receipt_attachment_id) REFERENCES attachments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_conveyance_created_by FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_conveyance_updated_by FOREIGN KEY(updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE conveyance_reviews (
  id CHAR(36) PRIMARY KEY,
  claim_id CHAR(36) NOT NULL,
  reviewer_user_id CHAR(36) NOT NULL,
  reviewer_employee_id CHAR(36) NOT NULL,
  reviewer_role ENUM('team_lead','hr_manager','finance_manager','super_admin') NOT NULL,
  stage ENUM('team_lead_review','reviewer_review') NOT NULL,
  outcome ENUM('approved','rejected') NOT NULL,
  reason VARCHAR(2000) NULL,
  decided_at_utc DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_conveyance_reviewer_role(claim_id,reviewer_role),
  KEY ix_conveyance_review_reviewer(reviewer_user_id,decided_at_utc),
  CONSTRAINT chk_conveyance_rejection_reason CHECK(outcome<>'rejected' OR reason IS NOT NULL),
  CONSTRAINT fk_conveyance_review_claim FOREIGN KEY(claim_id) REFERENCES conveyance_claims(id) ON DELETE RESTRICT,
  CONSTRAINT fk_conveyance_review_user FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_conveyance_review_employee FOREIGN KEY(reviewer_employee_id) REFERENCES employees(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TRIGGER conveyance_reviews_no_update BEFORE UPDATE ON conveyance_reviews
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='conveyance_reviews is append-only';
CREATE TRIGGER conveyance_reviews_no_delete BEFORE DELETE ON conveyance_reviews
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='conveyance_reviews is append-only';
