require("dotenv").config();

const mysql = require("mysql2/promise");

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

const dryRun = process.argv.includes("--check");

async function main() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [[table]] = await connection.execute(`
      SELECT COUNT(*) AS total
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = 'frozenthrone' AND TABLE_NAME = 'forum_posts'
    `);
    if (!Number(table.total)) throw new Error("Required table frozenthrone.forum_posts does not exist.");

    const [[column]] = await connection.execute(`
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'frozenthrone'
        AND TABLE_NAME = 'forum_posts'
        AND COLUMN_NAME = 'edited_at'
    `);

    if (Number(column.total)) {
      console.log("FORUM EDITOR MIGRATION COMPLETE: forum_posts.edited_at already exists.");
      return;
    }

    if (dryRun) {
      console.log("NEEDED: forum_posts.edited_at");
      return;
    }

    await connection.query(`
      ALTER TABLE frozenthrone.forum_posts
      ADD COLUMN edited_at TIMESTAMP NULL DEFAULT NULL AFTER created_at
    `);
    console.log("FORUM EDITOR MIGRATION COMPLETE: added forum_posts.edited_at.");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("FORUM EDITOR MIGRATION FAILED:", error.message);
  process.exitCode = 1;
});
