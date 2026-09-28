-- Additive role capabilities. No financial or historical rows are changed.
ALTER TABLE account_types ADD COLUMN code VARCHAR(50) NULL AFTER local_id;
ALTER TABLE account_types ADD COLUMN can_be_customer TINYINT(1) NOT NULL DEFAULT 0 AFTER code;
ALTER TABLE account_types ADD COLUMN can_be_supplier TINYINT(1) NOT NULL DEFAULT 0 AFTER can_be_customer;
CREATE UNIQUE INDEX uq_account_types_code ON account_types (org_id, code);
