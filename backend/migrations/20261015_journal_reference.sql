-- Add a free-form reference value to journal entries.
-- The column is nullable so existing journal rows and integrations remain valid.
ALTER TABLE journals
  ADD COLUMN `reference` VARCHAR(255) NULL AFTER `date`;
