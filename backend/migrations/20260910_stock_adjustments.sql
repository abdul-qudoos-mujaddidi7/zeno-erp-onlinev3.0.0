-- MySQL 8.0+ -- standalone migration for the stock-adjustment feature.
-- `products.quantity` is this application's current_qty equivalent. The
-- before/after columns create a durable audit trail without changing wastes.
CREATE TABLE stock_adjustments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  adjustment_type ENUM('increase', 'decrease') NOT NULL,
  qty DECIMAL(15,3) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  note TEXT NULL,
  status ENUM('pending', 'approved') NOT NULL DEFAULT 'approved',
  before_qty DECIMAL(15,3) NOT NULL,
  after_qty DECIMAL(15,3) NOT NULL,
  before_warehouse_qty DECIMAL(15,3) NOT NULL,
  after_warehouse_qty DECIMAL(15,3) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  approved_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_stock_adjustments_list (org_id, created_at),
  KEY ix_stock_adjustments_product (org_id, product_id, created_at),
  KEY ix_stock_adjustments_warehouse (org_id, warehouse_id, created_at),
  CONSTRAINT chk_stock_adjustment_qty CHECK (qty > 0)
) ENGINE=InnoDB;
