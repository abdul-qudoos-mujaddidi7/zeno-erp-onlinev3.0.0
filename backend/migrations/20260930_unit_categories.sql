-- MySQL 8.0+ -- standalone migration that gives every product unit a category.
--
-- Why this migration is additive only
-- -----------------------------------
-- The database is live, so this file creates structures and nothing else:
--   * `unit_categories` is a new table and is skipped if it already exists;
--   * `product_units` gains a NULLABLE `unit_category_id`, so every existing
--     row and every existing INSERT statement keeps working untouched.
--
-- It deliberately does NOT insert a default category or backfill
-- `product_units`; those are data changes and are refused by
-- scripts/run-migration.js. Run scripts/backfill-unit-categories.js once after
-- this migration to put the existing units into a default "General" category.
--
-- `unit_category_id` stores the category's `local_id`, which is how
-- `product_units.subunit_id` already references another unit, and it is the
-- client/API identifier used everywhere else in this schema.
--
-- `(org_id, name)` is unique on purpose: the name is what identifies a
-- category to the user, and the unique key is also what lets the default
-- "General" category be created exactly once under concurrent callers.
CREATE TABLE unit_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  local_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_unit_categories_local (org_id, local_id),
  UNIQUE KEY uq_unit_categories_name (org_id, name),
  KEY ix_unit_categories_status (org_id, status, name)
) ENGINE=InnoDB;

ALTER TABLE product_units
  ADD COLUMN unit_category_id BIGINT UNSIGNED NULL AFTER code;

CREATE INDEX ix_product_units_category ON product_units (org_id, unit_category_id);
