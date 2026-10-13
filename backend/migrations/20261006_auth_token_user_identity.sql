ALTER TABLE auth_tokens ADD COLUMN user_pk INT NULL;
CREATE INDEX idx_auth_tokens_user_pk ON auth_tokens (user_pk);
