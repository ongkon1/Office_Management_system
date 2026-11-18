-- BE-1001..BE-1006: durable requisitions and append-only review history.
-- Recovery: drizzle/recovery/0016_requisitions.sql

CREATE TABLE requisitions (
  id CHAR(36) PRIMARY KEY,
  reference VARCHAR(40) NOT NULL,
  submitter_user_id CHAR(36) NOT NULL,
  submitter_employee_id CHAR(36) NOT NULL,
  submitter_role ENUM('employee','team_lead') NOT NULL,
  kind ENUM('in_house','new') NOT NULL,
  assigned_team_lead_employee_id CHAR(36) NULL,
  item_name VARCHAR(240) NOT NULL,
  purpose VARCHAR(1000) NOT NULL,
  urgency VARCHAR(80) NOT NULL,
  approximate_amount DECIMAL(19,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  stage ENUM('team_lead_review','reviewer_review','decided') NOT NULL,
  outcome ENUM('approved','rejected','withdrawn') NULL,
  submitted_at_utc DATETIME(6) NOT NULL,
  submitted_local_date DATE NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  decided_at_utc DATETIME(6) NULL,
  created_by_user_id CHAR(36) NOT NULL,
  updated_by_user_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_requisition_reference(reference),
  KEY ix_requisition_submitter(submitter_user_id,submitted_at_utc),
  KEY ix_requisition_team_lead(assigned_team_lead_employee_id,stage,submitted_at_utc),
  KEY ix_requisition_stage(stage,submitted_at_utc),
  CONSTRAINT chk_requisition_amount CHECK(approximate_amount >= 0),
  CONSTRAINT chk_requisition_terminal CHECK(
    (stage='decided' AND outcome IS NOT NULL AND decided_at_utc IS NOT NULL)
    OR (stage<>'decided' AND outcome IS NULL AND decided_at_utc IS NULL)
  ),
  CONSTRAINT chk_requisition_team_lead_submitter CHECK(submitter_role='employee' OR assigned_team_lead_employee_id IS NULL),
  CONSTRAINT fk_requisition_submitter_user FOREIGN KEY(submitter_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_requisition_submitter_employee FOREIGN KEY(submitter_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT fk_requisition_team_lead FOREIGN KEY(assigned_team_lead_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT fk_requisition_created_by FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_requisition_updated_by FOREIGN KEY(updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE requisition_in_house_details (
  requisition_id CHAR(36) PRIMARY KEY,
  last_recover_date DATE NOT NULL,
  model_name VARCHAR(240) NOT NULL,
  CONSTRAINT fk_requisition_in_house FOREIGN KEY(requisition_id) REFERENCES requisitions(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE requisition_new_details (
  requisition_id CHAR(36) PRIMARY KEY,
  model_name VARCHAR(240) NOT NULL,
  CONSTRAINT fk_requisition_new FOREIGN KEY(requisition_id) REFERENCES requisitions(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TRIGGER requisition_in_house_kind_guard
BEFORE INSERT ON requisition_in_house_details
FOR EACH ROW
BEGIN
  IF (SELECT kind FROM requisitions WHERE id=NEW.requisition_id) <> 'in_house' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='In-house details require an in-house requisition';
  END IF;
  IF EXISTS(SELECT 1 FROM requisition_new_details WHERE requisition_id=NEW.requisition_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A requisition has exactly one detail variant';
  END IF;
END;

CREATE TRIGGER requisition_new_kind_guard
BEFORE INSERT ON requisition_new_details
FOR EACH ROW
BEGIN
  IF (SELECT kind FROM requisitions WHERE id=NEW.requisition_id) <> 'new' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New-item details require a new requisition';
  END IF;
  IF EXISTS(SELECT 1 FROM requisition_in_house_details WHERE requisition_id=NEW.requisition_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A requisition has exactly one detail variant';
  END IF;
END;

CREATE TABLE requisition_reviews (
  id CHAR(36) PRIMARY KEY,
  requisition_id CHAR(36) NOT NULL,
  reviewer_user_id CHAR(36) NOT NULL,
  reviewer_employee_id CHAR(36) NOT NULL,
  reviewer_role ENUM('team_lead','hr_manager','finance_manager','super_admin') NOT NULL,
  stage ENUM('team_lead_review','reviewer_review') NOT NULL,
  outcome ENUM('approved','rejected') NOT NULL,
  reason VARCHAR(2000) NULL,
  decided_at_utc DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_requisition_reviewer_role(requisition_id,reviewer_role),
  KEY ix_requisition_review_reviewer(reviewer_user_id,decided_at_utc),
  CONSTRAINT chk_requisition_rejection_reason CHECK(outcome<>'rejected' OR reason IS NOT NULL),
  CONSTRAINT fk_requisition_review_record FOREIGN KEY(requisition_id) REFERENCES requisitions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_requisition_review_user FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_requisition_review_employee FOREIGN KEY(reviewer_employee_id) REFERENCES employees(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TRIGGER requisition_reviews_no_update BEFORE UPDATE ON requisition_reviews
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='requisition_reviews is append-only';
CREATE TRIGGER requisition_reviews_no_delete BEFORE DELETE ON requisition_reviews
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='requisition_reviews is append-only';

