require("dotenv").config();

const mysql = require("mysql2/promise");

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

const dryRun = process.argv.includes("--check");
let changes = 0;

async function tableExists(connection, tableName) {
  const [[row]] = await connection.execute(`
    SELECT COUNT(*) AS total
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'frozenthrone'
      AND TABLE_NAME = ?
  `, [tableName]);
  return Number(row.total) > 0;
}

async function columnExists(connection, tableName, columnName) {
  const [[row]] = await connection.execute(`
    SELECT COUNT(*) AS total
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'frozenthrone'
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
  `, [tableName, columnName]);
  return Number(row.total) > 0;
}

async function indexExists(connection, tableName, indexName) {
  const [[row]] = await connection.execute(`
    SELECT COUNT(*) AS total
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'frozenthrone'
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
  `, [tableName, indexName]);
  return Number(row.total) > 0;
}

async function apply(connection, label, sql) {
  changes += 1;
  if (dryRun) {
    console.log(`NEEDED: ${label}`);
    return;
  }
  await connection.query(sql);
  console.log(`APPLIED: ${label}`);
}

async function main() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    for (const requiredTable of [
      "forum_categories",
      "forum_boards",
      "forum_threads",
      "forum_posts",
      "vote_accounts"
    ]) {
      if (!await tableExists(connection, requiredTable)) {
        throw new Error(`Required table frozenthrone.${requiredTable} does not exist.`);
      }
    }

    if (!await columnExists(connection, "forum_threads", "realm_key")) {
      await apply(connection, "forum_threads.realm_key", `
        ALTER TABLE frozenthrone.forum_threads
        ADD COLUMN realm_key VARCHAR(32) NOT NULL DEFAULT 'main' AFTER author_id
      `);
    }

    if (!await indexExists(connection, "forum_threads", "idx_forum_threads_realm_author")) {
      await apply(connection, "forum_threads realm/author index", `
        ALTER TABLE frozenthrone.forum_threads
        ADD INDEX idx_forum_threads_realm_author (realm_key, author_id, updated_at)
      `);
    }

    if (!await columnExists(connection, "forum_posts", "realm_key")) {
      await apply(connection, "forum_posts.realm_key", `
        ALTER TABLE frozenthrone.forum_posts
        ADD COLUMN realm_key VARCHAR(32) NOT NULL DEFAULT 'main' AFTER author_id
      `);
    }

    if (!await indexExists(connection, "forum_posts", "idx_forum_posts_realm_author")) {
      await apply(connection, "forum_posts realm/author index", `
        ALTER TABLE frozenthrone.forum_posts
        ADD INDEX idx_forum_posts_realm_author (realm_key, author_id, created_at)
      `);
    }

    if (!await indexExists(connection, "forum_boards", "idx_forum_boards_realm_sort")) {
      await apply(connection, "forum boards realm/sort index", `
        ALTER TABLE frozenthrone.forum_boards
        ADD INDEX idx_forum_boards_realm_sort (realm_id, category_id, sort_order)
      `);
    }

    if (!await tableExists(connection, "forum_reward_progress")) {
      await apply(connection, "forum_reward_progress table", `
        CREATE TABLE frozenthrone.forum_reward_progress (
          realm_key VARCHAR(32) NOT NULL,
          account_id INT NOT NULL,
          progress_posts TINYINT UNSIGNED NOT NULL DEFAULT 0,
          total_qualifying INT UNSIGNED NOT NULL DEFAULT 0,
          tokens_earned INT UNSIGNED NOT NULL DEFAULT 0,
          daily_date DATE NULL,
          daily_tokens TINYINT UNSIGNED NOT NULL DEFAULT 0,
          last_qualified_at TIMESTAMP NULL DEFAULT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (realm_key, account_id),
          INDEX idx_forum_reward_progress_account (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (!await tableExists(connection, "forum_reward_events")) {
      await apply(connection, "forum_reward_events table", `
        CREATE TABLE frozenthrone.forum_reward_events (
          post_id BIGINT UNSIGNED NOT NULL,
          thread_id BIGINT UNSIGNED NOT NULL,
          realm_key VARCHAR(32) NOT NULL,
          account_id INT NOT NULL,
          event_type VARCHAR(16) NOT NULL,
          body_length INT UNSIGNED NOT NULL DEFAULT 0,
          qualified TINYINT(1) NOT NULL DEFAULT 0,
          reward_tokens TINYINT UNSIGNED NOT NULL DEFAULT 0,
          reason VARCHAR(32) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (post_id),
          INDEX idx_forum_reward_events_account (realm_key, account_id, created_at),
          INDEX idx_forum_reward_events_thread (thread_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (dryRun) {
      console.log(`CHECK COMPLETE: ${changes} change${changes === 1 ? "" : "s"} needed; no database changes were made.`);
    } else {
      console.log(`MIGRATION COMPLETE: ${changes} schema change${changes === 1 ? "" : "s"} applied.`);
    }
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("FORUM MIGRATION FAILED:", error.message);
  process.exitCode = 1;
});
