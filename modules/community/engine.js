const THREADS_PER_PAGE = 20;
const POSTS_PER_PAGE = 12;
const POSTS_PER_TOKEN = 3;
const MIN_REWARD_LENGTH = 50;
const DAILY_TOKEN_LIMIT = 2;
const REWARD_COOLDOWN_MINUTES = 2;
const {
  sanitizeForumBody,
  forumPlainText
} = require("./content");

function pageNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function safeIdentifier(value) {
  const identifier = String(value || "");
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error("Invalid database identifier.");
  }
  return `\`${identifier}\``;
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

function profileKey(realmKey, accountId) {
  return `${realmKey || "main"}:${Number(accountId || 0)}`;
}

module.exports = function createCommunityEngine(tools) {
  const {
    mysql,
    dbConfig,
    getRealm,
    authDb,
    characterDb
  } = tools;

  async function forumDb() {
    return mysql.createConnection({
      ...dbConfig,
      database: "frozenthrone"
    });
  }

  function resolveRealm(realmRef) {
    if (realmRef && typeof realmRef === "object" && realmRef.key) {
      return getRealm(realmRef.key) || realmRef;
    }
    return getRealm(realmRef || "main") || getRealm("main");
  }

  async function securityLevel(realmRef, accountId) {
    if (!accountId) return 0;
    const realm = resolveRealm(realmRef);
    const accountColumn = safeIdentifier(realm.accessAccountColumn);
    const levelColumn = safeIdentifier(realm.accessLevelColumn);
    const connection = await authDb(realm);

    try {
      const [[row]] = await connection.execute(`
        SELECT COALESCE(MAX(${levelColumn}), 0) AS security_level
        FROM account_access
        WHERE ${accountColumn} = ?
          AND RealmID IN (-1, ?)
      `, [accountId, realm.realm_id]);
      return Number(row?.security_level || 0);
    } finally {
      await connection.end();
    }
  }

  async function loadProfiles(references, connection = null) {
    const unique = new Map();
    for (const reference of references || []) {
      const accountId = Number(reference?.accountId || 0);
      if (!accountId) continue;
      const realm = resolveRealm(reference.realmKey || "main");
      unique.set(profileKey(realm.key, accountId), {
        realm,
        accountId
      });
    }

    const profiles = new Map();
    for (const [key, reference] of unique) {
      profiles.set(key, {
        accountId: reference.accountId,
        realmKey: reference.realm.key,
        realmName: reference.realm.name,
        username: "Unknown",
        joinDate: null,
        securityLevel: 0,
        postCount: 0,
        character: null
      });
    }

    const groups = new Map();
    for (const reference of unique.values()) {
      if (!groups.has(reference.realm.key)) {
        groups.set(reference.realm.key, {
          realm: reference.realm,
          ids: []
        });
      }
      groups.get(reference.realm.key).ids.push(reference.accountId);
    }

    await Promise.all([...groups.values()].map(async ({ realm, ids }) => {
      const cleanIds = [...new Set(ids)].sort((a, b) => a - b);
      const idSql = placeholders(cleanIds);
      const accountColumn = safeIdentifier(realm.accessAccountColumn);
      const levelColumn = safeIdentifier(realm.accessLevelColumn);

      const authConnection = await authDb(realm);
      try {
        const [accounts] = await authConnection.execute(`
          SELECT id, username, joindate
          FROM account
          WHERE id IN (${idSql})
        `, cleanIds);

        const [accessRows] = await authConnection.execute(`
          SELECT ${accountColumn} AS account_id,
                 COALESCE(MAX(${levelColumn}), 0) AS security_level
          FROM account_access
          WHERE ${accountColumn} IN (${idSql})
            AND RealmID IN (-1, ?)
          GROUP BY ${accountColumn}
        `, [...cleanIds, realm.realm_id]);

        for (const account of accounts) {
          const profile = profiles.get(profileKey(realm.key, account.id));
          if (!profile) continue;
          profile.username = account.username || "Unknown";
          profile.joinDate = account.joindate || null;
        }

        for (const access of accessRows) {
          const profile = profiles.get(profileKey(realm.key, access.account_id));
          if (profile) profile.securityLevel = Number(access.security_level || 0);
        }
      } finally {
        await authConnection.end();
      }

      const characterConnection = await characterDb(realm);
      try {
        const [characters] = await characterConnection.execute(`
          SELECT
            c.account,
            c.guid,
            c.name,
            c.level,
            c.race,
            c.class,
            g.name AS guild_name
          FROM characters c
          LEFT JOIN guild_member membership ON membership.guid = c.guid
          LEFT JOIN guild g ON g.guildid = membership.guildid
          WHERE c.account IN (${idSql})
            AND c.guid = (
              SELECT c2.guid
              FROM characters c2
              WHERE c2.account = c.account
              ORDER BY c2.level DESC, c2.guid ASC
              LIMIT 1
            )
        `, cleanIds);

        for (const character of characters) {
          const profile = profiles.get(profileKey(realm.key, character.account));
          if (!profile) continue;
          profile.character = {
            guid: Number(character.guid),
            name: character.name,
            level: Number(character.level || 0),
            race: Number(character.race || 0),
            classId: Number(character.class || 0),
            guildName: character.guild_name || ""
          };
        }
      } finally {
        await characterConnection.end();
      }
    }));

    let ownedConnection = null;
    const forumConnection = connection || (ownedConnection = await forumDb());
    try {
      const clauses = [];
      const params = [];
      for (const { realm, ids } of groups.values()) {
        const cleanIds = [...new Set(ids)].sort((a, b) => a - b);
        clauses.push(`(realm_key = ? AND author_id IN (${placeholders(cleanIds)}))`);
        params.push(realm.key, ...cleanIds);
      }

      if (clauses.length) {
        const [counts] = await forumConnection.execute(`
          SELECT realm_key, author_id, COUNT(*) AS post_count
          FROM forum_posts
          WHERE ${clauses.join(" OR ")}
          GROUP BY realm_key, author_id
        `, params);

        for (const row of counts) {
          const profile = profiles.get(profileKey(row.realm_key, row.author_id));
          if (profile) profile.postCount = Number(row.post_count || 0);
        }
      }
    } finally {
      if (ownedConnection) await ownedConnection.end();
    }

    return profiles;
  }

  function attachProfile(row, profiles, prefix = "author") {
    const realmKey = row[`${prefix}_realm_key`] || row.realm_key || "main";
    const accountId = row[`${prefix}_id`] || row.author_id;
    return profiles.get(profileKey(realmKey, accountId)) || {
      accountId: Number(accountId || 0),
      realmKey,
      realmName: resolveRealm(realmKey)?.name || "FrozenThrone",
      username: "Unknown",
      joinDate: null,
      securityLevel: 0,
      postCount: 0,
      character: null
    };
  }

  async function rewardProgress(connection, realmRef, accountId) {
    if (!accountId) {
      return {
        progressPosts: 0,
        postsPerToken: POSTS_PER_TOKEN,
        dailyTokens: 0,
        dailyLimit: DAILY_TOKEN_LIMIT,
        totalQualifying: 0,
        tokensEarned: 0,
        walletTokens: 0
      };
    }

    const realm = resolveRealm(realmRef);
    const [[row]] = await connection.execute(`
      SELECT
        COALESCE(progress.progress_posts, 0) AS progress_posts,
        CASE
          WHEN progress.daily_date = CURDATE() THEN COALESCE(progress.daily_tokens, 0)
          ELSE 0
        END AS daily_tokens,
        COALESCE(progress.total_qualifying, 0) AS total_qualifying,
        COALESCE(progress.tokens_earned, 0) AS tokens_earned,
        COALESCE(wallet.vote_tokens, 0) AS wallet_tokens
      FROM (SELECT 1) seed
      LEFT JOIN forum_reward_progress progress
        ON progress.realm_key = ? AND progress.account_id = ?
      LEFT JOIN vote_accounts wallet
        ON wallet.realm_key = ? AND wallet.account_id = ?
    `, [realm.key, accountId, realm.key, accountId]);

    return {
      progressPosts: Number(row?.progress_posts || 0),
      postsPerToken: POSTS_PER_TOKEN,
      dailyTokens: Number(row?.daily_tokens || 0),
      dailyLimit: DAILY_TOKEN_LIMIT,
      totalQualifying: Number(row?.total_qualifying || 0),
      tokensEarned: Number(row?.tokens_earned || 0),
      walletTokens: Number(row?.wallet_tokens || 0)
    };
  }

  async function viewerContext(realmRef, user, connection = null) {
    if (!user?.id) return null;
    const realm = resolveRealm(realmRef);
    let ownedConnection = null;
    const forumConnection = connection || (ownedConnection = await forumDb());

    try {
      const profiles = await loadProfiles([{
        realmKey: realm.key,
        accountId: user.id
      }], forumConnection);
      const profile = attachProfile({
        author_realm_key: realm.key,
        author_id: user.id
      }, profiles);
      const reward = await rewardProgress(forumConnection, realm, user.id);
      return {
        profile,
        reward,
        canModerate: Number(profile.securityLevel || 0) >= 3
      };
    } finally {
      if (ownedConnection) await ownedConnection.end();
    }
  }

  async function forumIndex(realmRef, user) {
    const realm = resolveRealm(realmRef);
    const connection = await forumDb();

    try {
      const [boards] = await connection.execute(`
        SELECT
          c.id AS category_id,
          c.name AS category_name,
          c.description AS category_description,
          c.sort_order AS category_sort_order,
          b.id,
          b.name,
          b.description,
          b.icon,
          b.realm_id,
          b.sort_order,
          (SELECT COUNT(*) FROM forum_threads thread_count WHERE thread_count.board_id = b.id) AS thread_count,
          (
            SELECT COUNT(*)
            FROM forum_posts post_count
            JOIN forum_threads post_thread ON post_thread.id = post_count.thread_id
            WHERE post_thread.board_id = b.id
          ) AS post_count,
          latest_thread.id AS latest_thread_id,
          latest_thread.title AS latest_title,
          latest_thread.thread_type AS latest_thread_type,
          latest_post.created_at AS latest_updated_at,
          latest_post.author_id AS latest_author_id,
          latest_post.realm_key AS latest_author_realm_key
        FROM forum_boards b
        JOIN forum_categories c ON c.id = b.category_id
        LEFT JOIN forum_posts latest_post ON latest_post.id = (
          SELECT post_lookup.id
          FROM forum_posts post_lookup
          JOIN forum_threads thread_lookup ON thread_lookup.id = post_lookup.thread_id
          WHERE thread_lookup.board_id = b.id
          ORDER BY post_lookup.created_at DESC, post_lookup.id DESC
          LIMIT 1
        )
        LEFT JOIN forum_threads latest_thread ON latest_thread.id = latest_post.thread_id
        WHERE b.realm_id IN (0, ?)
        ORDER BY c.sort_order, c.id, b.sort_order, b.id
      `, [realm.realm_id]);

      const references = boards.map(board => ({
        realmKey: board.latest_author_realm_key,
        accountId: board.latest_author_id
      }));
      const profiles = await loadProfiles(references, connection);

      const categories = [];
      const categoryMap = new Map();
      for (const board of boards) {
        if (!categoryMap.has(board.category_id)) {
          const category = {
            id: Number(board.category_id),
            name: board.category_name,
            description: board.category_description || "",
            boards: []
          };
          categoryMap.set(board.category_id, category);
          categories.push(category);
        }

        categoryMap.get(board.category_id).boards.push({
          ...board,
          thread_count: Number(board.thread_count || 0),
          post_count: Number(board.post_count || 0),
          latestAuthor: board.latest_author_id
            ? attachProfile(board, profiles, "latest_author")
            : null
        });
      }

      return {
        realm,
        categories,
        totals: {
          boards: boards.length,
          threads: boards.reduce((sum, board) => sum + Number(board.thread_count || 0), 0),
          posts: boards.reduce((sum, board) => sum + Number(board.post_count || 0), 0)
        },
        viewer: await viewerContext(realm, user, connection)
      };
    } finally {
      await connection.end();
    }
  }

  async function boardPage(boardId, realmRef, requestedPage, user) {
    const realm = resolveRealm(realmRef);
    const connection = await forumDb();

    try {
      const [[board]] = await connection.execute(`
        SELECT b.*, c.name AS category_name, c.id AS category_id
        FROM forum_boards b
        JOIN forum_categories c ON c.id = b.category_id
        WHERE b.id = ? AND b.realm_id IN (0, ?)
      `, [boardId, realm.realm_id]);
      if (!board) return null;

      const [[countRow]] = await connection.execute(`
        SELECT COUNT(*) AS total
        FROM forum_threads
        WHERE board_id = ?
      `, [boardId]);

      const totalThreads = Number(countRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(totalThreads / THREADS_PER_PAGE));
      const page = Math.min(pageNumber(requestedPage), totalPages);
      const offset = (page - 1) * THREADS_PER_PAGE;

      const [threads] = await connection.execute(`
        SELECT
          t.*,
          first_post.body AS first_body,
          last_post.author_id AS last_author_id,
          last_post.realm_key AS last_author_realm_key,
          last_post.created_at AS last_post_at
        FROM forum_threads t
        LEFT JOIN forum_posts first_post ON first_post.id = (
          SELECT first_lookup.id
          FROM forum_posts first_lookup
          WHERE first_lookup.thread_id = t.id
          ORDER BY first_lookup.created_at ASC, first_lookup.id ASC
          LIMIT 1
        )
        LEFT JOIN forum_posts last_post ON last_post.id = (
          SELECT last_lookup.id
          FROM forum_posts last_lookup
          WHERE last_lookup.thread_id = t.id
          ORDER BY last_lookup.created_at DESC, last_lookup.id DESC
          LIMIT 1
        )
        WHERE t.board_id = ?
        ORDER BY t.pinned DESC,
                 FIELD(t.thread_type, 'urgent', 'announcement', 'important', 'sticky', 'normal'),
                 t.updated_at DESC,
                 t.id DESC
        LIMIT ${THREADS_PER_PAGE} OFFSET ${offset}
      `, [boardId]);

      const references = [];
      for (const thread of threads) {
        references.push({ realmKey: thread.realm_key, accountId: thread.author_id });
        references.push({ realmKey: thread.last_author_realm_key, accountId: thread.last_author_id });
      }
      const profiles = await loadProfiles(references, connection);

      const hydratedThreads = threads.map(thread => ({
        ...thread,
        replies: Number(thread.replies || 0),
        views: Number(thread.views || 0),
        author: attachProfile(thread, profiles),
        lastAuthor: thread.last_author_id
          ? attachProfile(thread, profiles, "last_author")
          : null
      }));

      const featured = hydratedThreads.filter(thread =>
        Number(thread.pinned)
        || ["urgent", "announcement", "important", "sticky"].includes(thread.thread_type)
      ).slice(0, 3);
      const featuredIds = new Set(featured.map(thread => Number(thread.id)));

      return {
        realm,
        board: {
          ...board,
          id: Number(board.id),
          realm_id: Number(board.realm_id || 0)
        },
        threads: hydratedThreads.filter(thread => !featuredIds.has(Number(thread.id))),
        featured,
        totalThreads,
        totalPages,
        page,
        viewer: await viewerContext(realm, user, connection)
      };
    } finally {
      await connection.end();
    }
  }

  async function threadPage(threadId, realmRef, requestedPage, user) {
    const realm = resolveRealm(realmRef);
    const connection = await forumDb();

    try {
      const [[thread]] = await connection.execute(`
        SELECT
          t.*,
          b.name AS board_name,
          b.description AS board_description,
          b.category_id,
          c.name AS category_name
        FROM forum_threads t
        JOIN forum_boards b ON b.id = t.board_id
        JOIN forum_categories c ON c.id = b.category_id
        WHERE t.id = ? AND b.realm_id IN (0, ?)
      `, [threadId, realm.realm_id]);
      if (!thread) return null;

      await connection.execute(`
        UPDATE forum_threads
        SET views = views + 1
        WHERE id = ?
      `, [threadId]);

      const [[countRow]] = await connection.execute(`
        SELECT COUNT(*) AS total
        FROM forum_posts
        WHERE thread_id = ?
      `, [threadId]);
      const totalPosts = Number(countRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(totalPosts / POSTS_PER_PAGE));
      const page = Math.min(pageNumber(requestedPage), totalPages);
      const offset = (page - 1) * POSTS_PER_PAGE;

      const [posts] = await connection.execute(`
        SELECT id, thread_id, author_id, realm_key, body, created_at, edited_at
        FROM forum_posts
        WHERE thread_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT ${POSTS_PER_PAGE} OFFSET ${offset}
      `, [threadId]);

      const references = [
        { realmKey: thread.realm_key, accountId: thread.author_id },
        ...posts.map(post => ({ realmKey: post.realm_key, accountId: post.author_id }))
      ];
      const profiles = await loadProfiles(references, connection);
      const viewer = await viewerContext(realm, user, connection);

      let moderationBoards = [];
      if (viewer?.canModerate) {
        const [boards] = await connection.execute(`
          SELECT id, name
          FROM forum_boards
          WHERE realm_id IN (0, ?)
          ORDER BY sort_order, id
        `, [realm.realm_id]);
        moderationBoards = boards;
      }

      return {
        realm,
        thread: {
          ...thread,
          views: Number(thread.views || 0) + 1,
          replies: Number(thread.replies || 0),
          author: attachProfile(thread, profiles)
        },
        posts: posts.map((post, index) => ({
          ...post,
          number: offset + index + 1,
          author: attachProfile(post, profiles)
        })),
        totalPosts,
        totalPages,
        page,
        viewer,
        moderationBoards
      };
    } finally {
      await connection.end();
    }
  }

  async function recordContribution(connection, {
    postId,
    threadId,
    accountId,
    realmRef,
    eventType,
    body
  }) {
    const realm = resolveRealm(realmRef);
    const bodyLength = [...forumPlainText(body)].length;

    const [[existing]] = await connection.execute(`
      SELECT post_id, qualified, reward_tokens, reason
      FROM forum_reward_events
      WHERE post_id = ?
      FOR UPDATE
    `, [postId]);
    if (existing) {
      const current = await rewardProgress(connection, realm, accountId);
      return {
        rewarded: Number(existing.reward_tokens || 0) > 0,
        qualified: Number(existing.qualified || 0) > 0,
        reason: existing.reason || "duplicate",
        ...current
      };
    }

    await connection.execute(`
      INSERT IGNORE INTO forum_reward_progress
        (realm_key, account_id, progress_posts, total_qualifying, tokens_earned,
         daily_date, daily_tokens, last_qualified_at)
      VALUES (?, ?, 0, 0, 0, CURDATE(), 0, NULL)
    `, [realm.key, accountId]);

    const [[progress]] = await connection.execute(`
      SELECT progress_posts, total_qualifying, tokens_earned,
             daily_date, daily_tokens, last_qualified_at,
             (daily_date = CURDATE()) AS is_today
      FROM forum_reward_progress
      WHERE realm_key = ? AND account_id = ?
      FOR UPDATE
    `, [realm.key, accountId]);

    if (!Number(progress?.is_today || 0)) {
      progress.daily_tokens = 0;
      await connection.execute(`
        UPDATE forum_reward_progress
        SET daily_date = CURDATE(), daily_tokens = 0
        WHERE realm_key = ? AND account_id = ?
      `, [realm.key, accountId]);
    }

    let qualified = bodyLength >= MIN_REWARD_LENGTH;
    let reason = qualified ? "qualified" : "too_short";

    if (qualified && Number(progress.daily_tokens || 0) >= DAILY_TOKEN_LIMIT) {
      qualified = false;
      reason = "daily_cap";
    }

    if (qualified) {
      const [[cooldown]] = await connection.execute(`
        SELECT post_id
        FROM forum_reward_events
        WHERE realm_key = ?
          AND account_id = ?
          AND qualified = 1
          AND created_at > DATE_SUB(NOW(), INTERVAL ${REWARD_COOLDOWN_MINUTES} MINUTE)
        ORDER BY created_at DESC
        LIMIT 1
      `, [realm.key, accountId]);
      if (cooldown) {
        qualified = false;
        reason = "cooldown";
      }
    }

    let rewardTokens = 0;
    if (qualified) {
      const nextProgress = Number(progress.progress_posts || 0) + 1;
      rewardTokens = nextProgress >= POSTS_PER_TOKEN ? 1 : 0;

      await connection.execute(`
        UPDATE forum_reward_progress
        SET progress_posts = ?,
            total_qualifying = total_qualifying + 1,
            tokens_earned = tokens_earned + ?,
            daily_date = CURDATE(),
            daily_tokens = daily_tokens + ?,
            last_qualified_at = NOW()
        WHERE realm_key = ? AND account_id = ?
      `, [
        rewardTokens ? 0 : nextProgress,
        rewardTokens,
        rewardTokens,
        realm.key,
        accountId
      ]);

      if (rewardTokens) {
        await connection.execute(`
          INSERT INTO vote_accounts
            (account_id, realm_key, lifetime_votes, vote_tokens, pending_gold,
             current_streak, last_vote_at)
          VALUES (?, ?, 0, 1, 0, 0, NULL)
          ON DUPLICATE KEY UPDATE vote_tokens = vote_tokens + 1
        `, [accountId, realm.key]);
        reason = "token_awarded";
      }
    }

    await connection.execute(`
      INSERT INTO forum_reward_events
        (post_id, thread_id, realm_key, account_id, event_type, body_length,
         qualified, reward_tokens, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      postId,
      threadId,
      realm.key,
      accountId,
      eventType,
      bodyLength,
      qualified ? 1 : 0,
      rewardTokens,
      reason
    ]);

    const current = await rewardProgress(connection, realm, accountId);
    return {
      rewarded: rewardTokens > 0,
      qualified,
      reason,
      ...current
    };
  }

  async function createThread({ boardId, title, body, threadType, realmRef, user }) {
    const realm = resolveRealm(realmRef);
    const connection = await forumDb();

    try {
      const cleanTitle = String(title || "").trim();
      const cleanBody = sanitizeForumBody(body);
      const bodyText = forumPlainText(cleanBody);
      if (cleanTitle.length < 4) throw new Error("Thread title is too short.");
      if (cleanTitle.length > 200) throw new Error("Thread title is too long.");
      if ([...bodyText].length < 20) throw new Error("Thread message is too short.");

      const level = await securityLevel(realm, user.id);
      const requestedType = ["normal", "sticky", "announcement", "important", "urgent"].includes(threadType)
        ? threadType
        : "normal";
      const safeType = level >= 3 ? requestedType : "normal";

      await connection.beginTransaction();
      const [[board]] = await connection.execute(`
        SELECT id
        FROM forum_boards
        WHERE id = ? AND realm_id IN (0, ?)
        FOR UPDATE
      `, [boardId, realm.realm_id]);
      if (!board) throw new Error("Forum board not found for this realm.");

      const [threadResult] = await connection.execute(`
        INSERT INTO forum_threads
          (board_id, author_id, realm_key, title, replies, pinned, locked,
           important, announcement, thread_type)
        VALUES (?, ?, ?, ?, 0, ?, 0, ?, ?, ?)
      `, [
        boardId,
        user.id,
        realm.key,
        cleanTitle,
        safeType === "sticky" ? 1 : 0,
        safeType === "important" ? 1 : 0,
        safeType === "announcement" ? 1 : 0,
        safeType
      ]);

      const threadId = Number(threadResult.insertId);
      const [postResult] = await connection.execute(`
        INSERT INTO forum_posts (thread_id, author_id, realm_key, body)
        VALUES (?, ?, ?, ?)
      `, [threadId, user.id, realm.key, cleanBody]);

      const reward = await recordContribution(connection, {
        postId: Number(postResult.insertId),
        threadId,
        accountId: user.id,
        realmRef: realm,
        eventType: "thread",
        body: cleanBody
      });

      await connection.commit();
      return { threadId, reward };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      await connection.end();
    }
  }

  async function createReply({ threadId, body, realmRef, user }) {
    const realm = resolveRealm(realmRef);
    const connection = await forumDb();

    try {
      const cleanBody = sanitizeForumBody(body);
      if ([...forumPlainText(cleanBody)].length < 10) throw new Error("Reply is too short.");

      await connection.beginTransaction();
      const [[thread]] = await connection.execute(`
        SELECT t.id, t.locked
        FROM forum_threads t
        JOIN forum_boards b ON b.id = t.board_id
        WHERE t.id = ? AND b.realm_id IN (0, ?)
        FOR UPDATE
      `, [threadId, realm.realm_id]);
      if (!thread) throw new Error("Thread not found for this realm.");
      if (Number(thread.locked)) throw new Error("This thread is locked.");

      const [postResult] = await connection.execute(`
        INSERT INTO forum_posts (thread_id, author_id, realm_key, body)
        VALUES (?, ?, ?, ?)
      `, [threadId, user.id, realm.key, cleanBody]);

      await connection.execute(`
        UPDATE forum_threads
        SET replies = replies + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [threadId]);

      const reward = await recordContribution(connection, {
        postId: Number(postResult.insertId),
        threadId,
        accountId: user.id,
        realmRef: realm,
        eventType: "reply",
        body: cleanBody
      });

      const [[countRow]] = await connection.execute(`
        SELECT COUNT(*) AS total
        FROM forum_posts
        WHERE thread_id = ?
      `, [threadId]);

      await connection.commit();
      return {
        postId: Number(postResult.insertId),
        page: Math.max(1, Math.ceil(Number(countRow.total || 1) / POSTS_PER_PAGE)),
        reward
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      await connection.end();
    }
  }

  async function moderateThread({ threadId, boardId, threadType, locked, realmRef }) {
    const realm = resolveRealm(realmRef);
    const connection = await forumDb();

    try {
      const safeType = ["normal", "sticky", "announcement", "important", "urgent"].includes(threadType)
        ? threadType
        : "normal";
      const [[board]] = await connection.execute(`
        SELECT id
        FROM forum_boards
        WHERE id = ? AND realm_id IN (0, ?)
      `, [boardId, realm.realm_id]);
      if (!board) throw new Error("Target board not found for this realm.");

      await connection.execute(`
        UPDATE forum_threads
        SET board_id = ?, thread_type = ?, pinned = ?, important = ?,
            announcement = ?, locked = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        boardId,
        safeType,
        safeType === "sticky" ? 1 : 0,
        safeType === "important" ? 1 : 0,
        safeType === "announcement" ? 1 : 0,
        Number(locked) ? 1 : 0,
        threadId
      ]);
    } finally {
      await connection.end();
    }
  }

  async function postEditor(postId, realmRef, user) {
    const realm = resolveRealm(realmRef);
    const connection = await forumDb();

    try {
      const [[post]] = await connection.execute(`
        SELECT
          p.id, p.thread_id, p.author_id, p.realm_key, p.body, p.created_at, p.edited_at,
          t.title, t.author_id AS thread_author_id, t.board_id, t.locked,
          b.name AS board_name
        FROM forum_posts p
        JOIN forum_threads t ON t.id = p.thread_id
        JOIN forum_boards b ON b.id = t.board_id
        WHERE p.id = ? AND b.realm_id IN (0, ?)
      `, [postId, realm.realm_id]);
      if (!post) return null;

      const [[firstPost]] = await connection.execute(`
        SELECT id
        FROM forum_posts
        WHERE thread_id = ?
        ORDER BY created_at, id
        LIMIT 1
      `, [post.thread_id]);

      const viewer = await viewerContext(realm, user, connection);
      const isAuthor = Number(post.author_id) === Number(user?.id)
        && String(post.realm_key || "main") === String(realm.key);
      const canModerate = Boolean(viewer?.canModerate);
      const isOriginal = Number(firstPost?.id) === Number(post.id);

      return {
        realm,
        post: {
          ...post,
          isOriginal,
          canEdit: isAuthor || canModerate,
          canDelete: !isOriginal && (isAuthor || canModerate),
          canDeleteThread: isOriginal && canModerate
        },
        viewer
      };
    } finally {
      await connection.end();
    }
  }

  async function editPost({ postId, title, body, realmRef, user }) {
    const realm = resolveRealm(realmRef);
    const connection = await forumDb();

    try {
      const cleanBody = sanitizeForumBody(body);
      if ([...forumPlainText(cleanBody)].length < 10) throw new Error("Post message is too short.");

      await connection.beginTransaction();
      const [[post]] = await connection.execute(`
        SELECT p.id, p.thread_id, p.author_id, p.realm_key, t.title
        FROM forum_posts p
        JOIN forum_threads t ON t.id = p.thread_id
        JOIN forum_boards b ON b.id = t.board_id
        WHERE p.id = ? AND b.realm_id IN (0, ?)
        FOR UPDATE
      `, [postId, realm.realm_id]);
      if (!post) throw new Error("Forum post not found.");

      const [[firstPost]] = await connection.execute(`
        SELECT id FROM forum_posts
        WHERE thread_id = ?
        ORDER BY created_at, id
        LIMIT 1
      `, [post.thread_id]);
      const isOriginal = Number(firstPost?.id) === Number(post.id);
      const level = await securityLevel(realm, user?.id);
      const isAuthor = Number(post.author_id) === Number(user?.id)
        && String(post.realm_key || "main") === String(realm.key);
      if (!isAuthor && level < 3) throw new Error("You do not have permission to edit this post.");

      await connection.execute(`
        UPDATE forum_posts
        SET body = ?, edited_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [cleanBody, postId]);

      if (isOriginal) {
        const cleanTitle = String(title || "").trim();
        if (cleanTitle.length < 4) throw new Error("Thread title is too short.");
        if (cleanTitle.length > 200) throw new Error("Thread title is too long.");
        await connection.execute(`UPDATE forum_threads SET title = ? WHERE id = ?`, [cleanTitle, post.thread_id]);
      }

      const [[position]] = await connection.execute(`
        SELECT COUNT(*) AS total
        FROM forum_posts current_post
        JOIN forum_posts target_post ON target_post.id = ?
        WHERE current_post.thread_id = target_post.thread_id
          AND (current_post.created_at < target_post.created_at
            OR (current_post.created_at = target_post.created_at AND current_post.id <= target_post.id))
      `, [postId]);

      await connection.commit();
      return {
        threadId: Number(post.thread_id),
        page: Math.max(1, Math.ceil(Number(position.total || 1) / POSTS_PER_PAGE))
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      await connection.end();
    }
  }

  async function deletePost({ postId, realmRef, user }) {
    const realm = resolveRealm(realmRef);
    const connection = await forumDb();

    try {
      await connection.beginTransaction();
      const [[post]] = await connection.execute(`
        SELECT p.id, p.thread_id, p.author_id, p.realm_key
        FROM forum_posts p
        JOIN forum_threads t ON t.id = p.thread_id
        JOIN forum_boards b ON b.id = t.board_id
        WHERE p.id = ? AND b.realm_id IN (0, ?)
        FOR UPDATE
      `, [postId, realm.realm_id]);
      if (!post) throw new Error("Forum post not found.");

      const [[firstPost]] = await connection.execute(`
        SELECT id FROM forum_posts
        WHERE thread_id = ?
        ORDER BY created_at, id
        LIMIT 1
      `, [post.thread_id]);
      if (Number(firstPost?.id) === Number(post.id)) {
        throw new Error("The original post cannot be removed by itself. A GM must delete the thread.");
      }

      const level = await securityLevel(realm, user?.id);
      const isAuthor = Number(post.author_id) === Number(user?.id)
        && String(post.realm_key || "main") === String(realm.key);
      if (!isAuthor && level < 3) throw new Error("You do not have permission to delete this reply.");

      await connection.execute(`DELETE FROM forum_posts WHERE id = ?`, [postId]);
      const [[stats]] = await connection.execute(`
        SELECT COUNT(*) AS total, MAX(created_at) AS latest_at
        FROM forum_posts
        WHERE thread_id = ?
      `, [post.thread_id]);
      await connection.execute(`
        UPDATE forum_threads
        SET replies = GREATEST(?, 0), updated_at = COALESCE(?, created_at)
        WHERE id = ?
      `, [Number(stats.total || 1) - 1, stats.latest_at, post.thread_id]);

      await connection.commit();
      return { threadId: Number(post.thread_id) };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      await connection.end();
    }
  }

  async function deleteThread({ threadId, realmRef, user }) {
    const realm = resolveRealm(realmRef);
    const connection = await forumDb();

    try {
      const level = await securityLevel(realm, user?.id);
      if (level < 3) throw new Error("GM permission is required to delete a thread.");

      await connection.beginTransaction();
      const [[thread]] = await connection.execute(`
        SELECT t.id, t.board_id
        FROM forum_threads t
        JOIN forum_boards b ON b.id = t.board_id
        WHERE t.id = ? AND b.realm_id IN (0, ?)
        FOR UPDATE
      `, [threadId, realm.realm_id]);
      if (!thread) throw new Error("Forum thread not found.");

      await connection.execute(`DELETE FROM forum_posts WHERE thread_id = ?`, [threadId]);
      await connection.execute(`DELETE FROM forum_threads WHERE id = ?`, [threadId]);
      await connection.commit();
      return { boardId: Number(thread.board_id) };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      await connection.end();
    }
  }

  return {
    THREADS_PER_PAGE,
    POSTS_PER_PAGE,
    POSTS_PER_TOKEN,
    MIN_REWARD_LENGTH,
    DAILY_TOKEN_LIMIT,
    forumIndex,
    boardPage,
    threadPage,
    viewerContext,
    securityLevel,
    createThread,
    createReply,
    moderateThread,
    postEditor,
    editPost,
    deletePost,
    deleteThread
  };
};
