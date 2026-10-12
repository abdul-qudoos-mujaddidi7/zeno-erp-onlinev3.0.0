-- Dedicated platform authentication only. No ERP/business tables are changed.
-- All related account, role and permission IDs are INT UNSIGNED.
CREATE TABLE platform_admin_accounts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  is_active TINYINT UNSIGNED NOT NULL DEFAULT 1,
  auth_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id), UNIQUE KEY uq_platform_admin_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_admin_roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  is_active TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id), UNIQUE KEY uq_platform_admin_role_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_admin_permissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY uq_platform_admin_permission_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_admin_account_roles (
  account_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (account_id, role_id), KEY idx_platform_account_role (role_id),
  CONSTRAINT fk_platform_account_role_account FOREIGN KEY (account_id) REFERENCES platform_admin_accounts(id),
  CONSTRAINT fk_platform_account_role_role FOREIGN KEY (role_id) REFERENCES platform_admin_roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_admin_role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id), KEY idx_platform_role_permission (permission_id),
  CONSTRAINT fk_platform_role_permission_role FOREIGN KEY (role_id) REFERENCES platform_admin_roles(id),
  CONSTRAINT fk_platform_role_permission_permission FOREIGN KEY (permission_id) REFERENCES platform_admin_permissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hashes identify throttle buckets without storing raw usernames or client IPs.
CREATE TABLE platform_admin_login_limits (
  bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  window_start DATETIME(3) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key), KEY idx_platform_limit_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historical actor IDs deliberately survive account lifecycle changes.
CREATE TABLE platform_admin_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_admin_id INT UNSIGNED NULL,
  target_admin_id INT UNSIGNED NULL,
  event VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  outcome VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  origin VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  subject_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  detail_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id), KEY idx_platform_audit_created (created_at),
  KEY idx_platform_audit_target (target_admin_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
