#!/usr/bin/env node
require("dotenv").config();

const mysql = require("mysql2/promise");
const { SHOP_ITEMS, SHOP_CATEGORIES } = require("../modules/shop/catalog");

function slugify(value) {
  return String(value || "category")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: false
  });

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS frozenthrone CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS frozenthrone.shop_categories (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        slug VARCHAR(80) NOT NULL,
        name VARCHAR(100) NOT NULL,
        sort_order INT NOT NULL DEFAULT 99,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_shop_category_slug (slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS frozenthrone.shop_catalog_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        sku VARCHAR(80) NOT NULL,
        item_entry INT UNSIGNED NOT NULL,
        name_override VARCHAR(255) NOT NULL DEFAULT '',
        description VARCHAR(500) NOT NULL DEFAULT '',
        quantity INT UNSIGNED NOT NULL DEFAULT 1,
        token_cost INT UNSIGNED NOT NULL DEFAULT 1,
        category_id INT UNSIGNED NOT NULL,
        realm_key VARCHAR(32) NOT NULL DEFAULT 'all',
        active TINYINT(1) NOT NULL DEFAULT 1,
        featured TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 99,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_shop_catalog_sku (sku),
        INDEX idx_shop_catalog_realm (realm_key, active, category_id, sort_order),
        CONSTRAINT fk_shop_catalog_category FOREIGN KEY (category_id) REFERENCES shop_categories(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS frozenthrone.admin_audit_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        actor_account_id INT UNSIGNED NOT NULL DEFAULT 0,
        actor_username VARCHAR(80) NOT NULL,
        actor_realm_key VARCHAR(32) NOT NULL,
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(80) NOT NULL,
        target_key VARCHAR(160) NOT NULL,
        details_json JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_admin_audit_created (created_at),
        INDEX idx_admin_audit_actor (actor_username, created_at),
        INDEX idx_admin_audit_target (target_type, target_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS frozenthrone.admin_point_adjustments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        realm_key VARCHAR(32) NOT NULL,
        account_id INT UNSIGNED NOT NULL,
        account_username VARCHAR(80) NOT NULL,
        balance_before INT UNSIGNED NOT NULL,
        adjustment INT NOT NULL,
        balance_after INT UNSIGNED NOT NULL,
        reason VARCHAR(500) NOT NULL,
        actor_account_id INT UNSIGNED NOT NULL,
        actor_username VARCHAR(80) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_point_adjustment_target (realm_key, account_id, created_at),
        INDEX idx_point_adjustment_actor (actor_username, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    for (let index = 0; index < SHOP_CATEGORIES.length; index += 1) {
      const name = SHOP_CATEGORIES[index];
      await conn.execute(`
        INSERT INTO frozenthrone.shop_categories (slug, name, sort_order, active)
        VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE name = VALUES(name)
      `, [slugify(name), name, (index + 1) * 10]);
    }

    const [categoryRows] = await conn.query(`SELECT id, name FROM frozenthrone.shop_categories`);
    const categoryIds = new Map(categoryRows.map(row => [row.name, row.id]));

    for (let index = 0; index < SHOP_ITEMS.length; index += 1) {
      const item = SHOP_ITEMS[index];
      const categoryId = categoryIds.get(item.category);
      if (!categoryId) throw new Error(`Missing seeded category: ${item.category}`);
      await conn.execute(`
        INSERT INTO frozenthrone.shop_catalog_items
          (sku, item_entry, name_override, description, quantity, token_cost, category_id, realm_key, active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'all', 1, ?)
        ON DUPLICATE KEY UPDATE
          item_entry = VALUES(item_entry),
          name_override = VALUES(name_override),
          description = VALUES(description),
          quantity = VALUES(quantity),
          token_cost = VALUES(token_cost),
          category_id = VALUES(category_id)
      `, [item.sku, item.entry, item.name || "", item.description || "", item.quantity || 1, item.tokenCost, categoryId, (index + 1) * 10]);
    }

    console.log(`Admin Control Center migration complete. Seeded ${SHOP_CATEGORIES.length} categories and ${SHOP_ITEMS.length} shop rewards.`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Admin Control Center migration failed:", err);
  process.exitCode = 1;
});
