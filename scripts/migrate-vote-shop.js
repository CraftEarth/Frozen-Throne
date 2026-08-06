require("dotenv").config();

const mysql = require("mysql2/promise");

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

const dryRun = process.argv.includes("--check");
let changes = 0;

async function tableExists(conn, tableName) {
  const [[row]] = await conn.execute(`
    SELECT COUNT(*) AS total
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'frozenthrone'
      AND TABLE_NAME = ?
  `, [tableName]);
  return Number(row.total) > 0;
}

async function columnExists(conn, tableName, columnName) {
  const [[row]] = await conn.execute(`
    SELECT COUNT(*) AS total
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'frozenthrone'
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
  `, [tableName, columnName]);
  return Number(row.total) > 0;
}

async function indexExists(conn, tableName, indexName) {
  const [[row]] = await conn.execute(`
    SELECT COUNT(*) AS total
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'frozenthrone'
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
  `, [tableName, indexName]);
  return Number(row.total) > 0;
}

async function primaryKeyColumns(conn, tableName) {
  const [rows] = await conn.execute(`
    SELECT COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'frozenthrone'
      AND TABLE_NAME = ?
      AND CONSTRAINT_NAME = 'PRIMARY'
    ORDER BY ORDINAL_POSITION
  `, [tableName]);
  return rows.map(row => row.COLUMN_NAME);
}

async function run(conn, label, sql) {
  changes += 1;
  if (dryRun) {
    console.log(`NEEDED: ${label}`);
    return;
  }
  await conn.query(sql);
  console.log(`APPLIED: ${label}`);
}

async function main() {
  const conn = await mysql.createConnection(dbConfig);
  let pendingGoldAdded = false;

  try {
    if (!await columnExists(conn, "vote_accounts", "realm_key")) {
      await run(conn, "vote_accounts.realm_key", `
        ALTER TABLE frozenthrone.vote_accounts
        ADD COLUMN realm_key VARCHAR(32) NOT NULL DEFAULT 'main' AFTER account_id
      `);
    }

    if (!await columnExists(conn, "vote_accounts", "pending_gold")) {
      pendingGoldAdded = true;
      await run(conn, "vote_accounts.pending_gold", `
        ALTER TABLE frozenthrone.vote_accounts
        ADD COLUMN pending_gold INT NOT NULL DEFAULT 0 AFTER vote_tokens
      `);
    }

    const primaryKey = await primaryKeyColumns(conn, "vote_accounts");
    if (primaryKey.join(",") !== "realm_key,account_id") {
      await run(conn, "realm-safe vote_accounts primary key", `
        ALTER TABLE frozenthrone.vote_accounts
        DROP PRIMARY KEY,
        ADD PRIMARY KEY (realm_key, account_id)
      `);
    }

    if (!await indexExists(conn, "vote_accounts", "idx_vote_accounts_account")) {
      await run(conn, "vote_accounts account index", `
        ALTER TABLE frozenthrone.vote_accounts
        ADD INDEX idx_vote_accounts_account (account_id)
      `);
    }

    if (!await columnExists(conn, "vote_logs", "realm_key")) {
      await run(conn, "vote_logs.realm_key", `
        ALTER TABLE frozenthrone.vote_logs
        ADD COLUMN realm_key VARCHAR(32) NOT NULL DEFAULT 'main' AFTER account_id
      `);
    }

    if (!await indexExists(conn, "vote_logs", "idx_vote_logs_realm_account")) {
      await run(conn, "vote_logs realm/account index", `
        ALTER TABLE frozenthrone.vote_logs
        ADD INDEX idx_vote_logs_realm_account (realm_key, account_id, created_at)
      `);
    }

    if (!await columnExists(conn, "vote_callback_debug", "request_ip")) {
      await run(conn, "vote_callback_debug.request_ip", `
        ALTER TABLE frozenthrone.vote_callback_debug
        ADD COLUMN request_ip VARCHAR(64) NULL AFTER ip
      `);
    }

    if (!await columnExists(conn, "vote_callback_debug", "result")) {
      await run(conn, "vote_callback_debug.result", `
        ALTER TABLE frozenthrone.vote_callback_debug
        ADD COLUMN result VARCHAR(40) NULL AFTER request_ip
      `);
    }

    if (!await tableExists(conn, "vote_intents")) {
      await run(conn, "vote_intents table", `
        CREATE TABLE frozenthrone.vote_intents (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        realm_key VARCHAR(32) NOT NULL,
        account_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        site VARCHAR(50) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        consumed_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (id),
        INDEX idx_vote_intents_lookup (site, username, consumed_at, created_at),
        INDEX idx_vote_intents_account (realm_key, account_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (!await tableExists(conn, "shop_purchases")) {
      await run(conn, "shop_purchases table", `
        CREATE TABLE frozenthrone.shop_purchases (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        idempotency_key CHAR(64) NOT NULL,
        realm_key VARCHAR(32) NOT NULL,
        account_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        character_guid INT UNSIGNED NOT NULL,
        character_name VARCHAR(50) NOT NULL,
        sku VARCHAR(80) NOT NULL,
        item_entry INT UNSIGNED NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        quantity INT UNSIGNED NOT NULL DEFAULT 1,
        token_cost INT UNSIGNED NOT NULL,
        mail_id INT UNSIGNED NOT NULL,
        item_guid INT UNSIGNED NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'delivered',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_shop_purchase_idempotency (idempotency_key),
        INDEX idx_shop_purchase_account (realm_key, account_id, created_at),
        INDEX idx_shop_purchase_character (realm_key, character_guid, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (pendingGoldAdded && !dryRun) {
      await conn.query(`
        UPDATE frozenthrone.vote_accounts wallet
        LEFT JOIN (
          SELECT realm_key, account_id, COALESCE(SUM(reward_gold), 0) AS earned_gold
          FROM frozenthrone.vote_logs
          GROUP BY realm_key, account_id
        ) earned
          ON earned.realm_key = wallet.realm_key
         AND earned.account_id = wallet.account_id
        SET wallet.pending_gold = COALESCE(earned.earned_gold, 0)
      `);
      console.log("APPLIED: existing earned gold moved into pending balances");
    } else if (pendingGoldAdded) {
      console.log("NEEDED: backfill existing earned gold into pending balances");
    }

    if (dryRun) {
      console.log(`CHECK COMPLETE: ${changes} change${changes === 1 ? "" : "s"} needed; no database changes were made.`);
    } else {
      console.log(`MIGRATION COMPLETE: ${changes} schema change${changes === 1 ? "" : "s"} applied.`);
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("MIGRATION FAILED:", err.message);
  process.exitCode = 1;
});
