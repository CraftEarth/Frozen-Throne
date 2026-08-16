const path = require("path");
const createCommunityEngine = require("./engine");

module.exports = function registerCommunityRoutes(app, tools) {
  const {
    render,
    esc,
    requireLogin,
    requireGM
  } = tools;
  const engine = tools.communityEngine || createCommunityEngine(tools);

  const classDetails = {
    1: { name: "Warrior", icon: "⚔" },
    2: { name: "Paladin", icon: "✦" },
    3: { name: "Hunter", icon: "➹" },
    4: { name: "Rogue", icon: "◆" },
    5: { name: "Priest", icon: "☀" },
    6: { name: "Death Knight", icon: "☠" },
    7: { name: "Shaman", icon: "ϟ" },
    8: { name: "Mage", icon: "✧" },
    9: { name: "Warlock", icon: "◈" },
    11: { name: "Druid", icon: "❧" }
  };

  const raceNames = {
    1: "Human",
    2: "Orc",
    3: "Dwarf",
    4: "Night Elf",
    5: "Undead",
    6: "Tauren",
    7: "Gnome",
    8: "Troll",
    10: "Blood Elf",
    11: "Draenei"
  };

  const typeDetails = {
    normal: { label: "Discussion", icon: "💬" },
    sticky: { label: "Pinned", icon: "📌" },
    announcement: { label: "Announcement", icon: "📣" },
    important: { label: "Important", icon: "⭐" },
    urgent: { label: "Urgent", icon: "🚨" }
  };

  function niceDate(value, fallback = "Recently") {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function joinedDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric"
    });
  }

  function count(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  function typeOf(value) {
    return typeDetails[value] || typeDetails.normal;
  }

  function classOf(value) {
    return classDetails[Number(value)] || { name: "Adventurer", icon: "❄" };
  }

  function excerpt(value, maximum = 150) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "Open this discussion to read the latest community updates.";
    return text.length > maximum ? `${text.slice(0, maximum - 1).trim()}…` : text;
  }

  function rewardQuery(reward) {
    if (!reward) return "";
    if (reward.rewarded) return "?forumReward=earned";
    if (reward.reason === "too_short") return "?forumReward=too-short";
    if (reward.reason === "cooldown") return "?forumReward=cooldown";
    if (reward.reason === "daily_cap") return "?forumReward=daily-cap";
    return reward.qualified ? "?forumReward=progress" : "";
  }

  function forumPage(content) {
    return `
      <link rel="stylesheet" href="/forums/community.css?v=1">
      <main class="forum-page">
        ${content}
      </main>
    `;
  }

  function errorPage(title, message) {
    return forumPage(`
      <section class="container forum-error-card">
        <span class="forum-kicker">FrozenThrone Community</span>
        <h1>${esc(title)}</h1>
        <p>${esc(message)}</p>
        <a class="btn" href="/forums">Return to Forums</a>
      </section>
    `);
  }

  function breadcrumbs(items) {
    return `
      <nav class="forum-breadcrumbs" aria-label="Forum breadcrumb">
        ${items.map((item, index) => item.href
          ? `<a href="${esc(item.href)}">${esc(item.label)}</a><span aria-hidden="true">›</span>`
          : `<strong aria-current="page">${esc(item.label)}</strong>${index < items.length - 1 ? `<span aria-hidden="true">›</span>` : ""}`
        ).join("")}
      </nav>
    `;
  }

  function threadBadge(thread) {
    const type = typeOf(thread.thread_type);
    return `<span class="forum-thread-badge type-${esc(thread.thread_type || "normal")}">${type.icon} ${esc(type.label)}</span>`;
  }

  function profileBadges(profile) {
    if (!profile) return "";
    const badges = [];
    const level = Number(profile.securityLevel || 0);
    const posts = Number(profile.postCount || 0);

    if (profile.realmKey === "main" && Number(profile.accountId) === 3) {
      badges.push(["founder", "Founder"]);
    }
    if (level >= 3) badges.push(["staff", "Game Master"]);
    else if (level >= 1) badges.push(["moderator", "Moderator"]);

    badges.push([
      profile.realmKey === "shadowmourne" ? "realm-shadow" : "realm-main",
      profile.realmName || (profile.realmKey === "shadowmourne" ? "Shadowmourne" : "FrozenThrone")
    ]);

    if (posts >= 100) badges.push(["legend", "Forum Legend"]);
    else if (posts >= 50) badges.push(["veteran", "Veteran"]);
    else if (posts >= 10) badges.push(["contributor", "Contributor"]);
    else if (posts >= 1) badges.push(["newcomer", "Newcomer"]);

    return badges.map(([kind, label]) =>
      `<span class="forum-badge ${kind}">${esc(label)}</span>`
    ).join("");
  }

  function profileAvatar(profile, large = false) {
    const character = profile?.character;
    const details = classOf(character?.classId);
    const fallback = String(profile?.username || "?").slice(0, 1).toUpperCase();
    return `
      <span class="forum-avatar${large ? " forum-avatar-large" : ""} class-${esc(character?.classId || 0)}" aria-hidden="true">
        ${character ? details.icon : esc(fallback)}
      </span>
    `;
  }

  function characterCard(profile) {
    const character = profile?.character;
    if (!character) return "";
    const classInfo = classOf(character.classId);
    return `
      <div class="forum-character class-${esc(character.classId)}">
        <a href="/armory/${esc(profile.realmKey)}/${esc(character.guid)}">${esc(character.name)}</a>
        <span>Level ${esc(character.level)} ${esc(raceNames[character.race] || "Unknown")} ${esc(classInfo.name)}</span>
        ${character.guildName ? `<small>&lt;${esc(character.guildName)}&gt;</small>` : ""}
      </div>
    `;
  }

  function rewardPanel(viewer, compact = false) {
    if (!viewer?.reward) return "";
    const reward = viewer.reward;
    const progress = Number(reward.progressPosts || 0);
    const segments = Array.from({ length: reward.postsPerToken }, (_, index) =>
      `<span class="${index < progress ? "filled" : ""}"></span>`
    ).join("");

    return `
      <aside class="forum-reward-panel${compact ? " compact" : ""}">
        <div class="forum-reward-icon">🪙</div>
        <div class="forum-reward-copy">
          <span>Community Reward</span>
          <strong>${esc(progress)} / ${esc(reward.postsPerToken)} qualifying contributions</strong>
          <div class="forum-reward-meter" aria-label="${esc(progress)} of ${esc(reward.postsPerToken)} contributions completed">${segments}</div>
          ${compact ? "" : `<small>Posts of 50+ characters qualify. Maximum ${esc(reward.dailyLimit)} Vote Tokens per day.</small>`}
        </div>
        <div class="forum-reward-wallet">
          <span>Wallet</span>
          <strong>${esc(count(reward.walletTokens))}</strong>
          <small>Vote Tokens</small>
        </div>
      </aside>
    `;
  }

  function rewardNotice(code) {
    const notices = {
      earned: ["reward", "🪙 Vote Token earned!", "Your third qualifying contribution credited one Vote Token to this realm's wallet."],
      progress: ["progress", "Contribution counted", "Your forum reward progress moved one step closer to the next Vote Token."],
      "too-short": ["neutral", "Post published", "This post was under 50 characters, so it did not advance forum reward progress."],
      cooldown: ["neutral", "Post published", "The post was saved, but the two-minute reward cooldown prevented progress farming."],
      "daily-cap": ["neutral", "Daily reward limit reached", "The post was saved. Forum rewards resume tomorrow after today's two-token limit."]
    };
    const notice = notices[code];
    if (!notice) return "";
    return `
      <div class="forum-notice ${notice[0]}" role="status">
        <strong>${notice[1]}</strong>
        <span>${notice[2]}</span>
      </div>
    `;
  }

  function pagination(baseUrl, page, totalPages) {
    if (totalPages <= 1) return "";
    const links = [];
    if (page > 1) links.push(`<a href="${esc(baseUrl)}?page=${page - 1}">← Previous</a>`);
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let current = start; current <= end; current += 1) {
      links.push(current === page
        ? `<strong aria-current="page">${current}</strong>`
        : `<a href="${esc(baseUrl)}?page=${current}">${current}</a>`);
    }
    if (page < totalPages) links.push(`<a href="${esc(baseUrl)}?page=${page + 1}">Next →</a>`);
    return `<nav class="forum-pagination" aria-label="Forum pages">${links.join("")}</nav>`;
  }

  function boardRow(board) {
    const latest = board.latest_thread_id
      ? `
        <a href="/forums/thread/${esc(board.latest_thread_id)}" class="forum-last-post-link">
          ${esc(board.latest_title)}
        </a>
        <span>by ${esc(board.latestAuthor?.username || "Unknown")}</span>
        <small>${esc(niceDate(board.latest_updated_at))}</small>
      `
      : `<span class="forum-empty-copy">No discussions yet</span>`;

    return `
      <article class="forum-board-row">
        <a class="forum-board-icon" href="/forums/board/${esc(board.id)}" aria-label="Open ${esc(board.name)}">
          ${esc(board.icon || "💬")}
        </a>
        <div class="forum-board-copy">
          <a href="/forums/board/${esc(board.id)}">${esc(board.name)}</a>
          <p>${esc(board.description || "Community discussion and realm updates.")}</p>
          ${Number(board.realm_id || 0) ? `<span class="forum-scope">Realm-specific</span>` : `<span class="forum-scope global">All realms</span>`}
        </div>
        <div class="forum-board-counts">
          <span><strong>${esc(count(board.thread_count))}</strong><small>Threads</small></span>
          <span><strong>${esc(count(board.post_count))}</strong><small>Posts</small></span>
        </div>
        <div class="forum-board-latest">${latest}</div>
      </article>
    `;
  }

  function featuredThread(thread) {
    const type = typeOf(thread.thread_type);
    return `
      <a class="forum-featured-thread type-${esc(thread.thread_type || "normal")}" href="/forums/thread/${esc(thread.id)}">
        <span class="forum-featured-icon">${type.icon}</span>
        <span class="forum-featured-copy">
          <small>${esc(type.label)}</small>
          <strong>${esc(thread.title)}</strong>
          <span>${esc(excerpt(thread.first_body, 115))}</span>
          <em>by ${esc(thread.author.username)} · ${esc(niceDate(thread.updated_at))}</em>
        </span>
      </a>
    `;
  }

  function threadRow(thread) {
    const type = typeOf(thread.thread_type);
    return `
      <article class="forum-thread-row type-${esc(thread.thread_type || "normal")}${Number(thread.locked) ? " locked" : ""}">
        <a class="forum-thread-icon" href="/forums/thread/${esc(thread.id)}" aria-label="Open ${esc(thread.title)}">
          ${Number(thread.locked) ? "🔒" : type.icon}
        </a>
        <div class="forum-thread-copy">
          <div class="forum-thread-title-line">
            ${threadBadge(thread)}
            ${Number(thread.locked) ? `<span class="forum-thread-badge locked">Locked</span>` : ""}
          </div>
          <a class="forum-thread-title" href="/forums/thread/${esc(thread.id)}">${esc(thread.title)}</a>
          <p>${esc(excerpt(thread.first_body))}</p>
          <small>Started by <strong>${esc(thread.author.username)}</strong> · ${esc(niceDate(thread.created_at))}</small>
        </div>
        <div class="forum-thread-stats">
          <span><strong>${esc(count(thread.replies))}</strong><small>Replies</small></span>
          <span><strong>${esc(count(thread.views))}</strong><small>Views</small></span>
        </div>
        <div class="forum-thread-last">
          ${thread.lastAuthor ? `
            ${profileAvatar(thread.lastAuthor)}
            <span><strong>${esc(thread.lastAuthor.username)}</strong><small>${esc(niceDate(thread.last_post_at))}</small></span>
          ` : `<span class="forum-empty-copy">No activity yet</span>`}
        </div>
      </article>
    `;
  }

  function postCard(post, thread) {
    const profile = post.author;
    const character = profile.character;
    return `
      <article class="forum-post-card class-${esc(character?.classId || 0)}" id="post-${esc(post.id)}">
        <aside class="forum-author-panel">
          ${profileAvatar(profile, true)}
          <a class="forum-author-name" href="${character ? `/armory/${esc(profile.realmKey)}/${esc(character.guid)}` : "#"}">${esc(profile.username)}</a>
          <span class="forum-author-title">${Number(profile.securityLevel) >= 3 ? "FrozenThrone Staff" : Number(profile.securityLevel) >= 1 ? "Community Moderator" : "Adventurer"}</span>
          <div class="forum-badges">${profileBadges(profile)}</div>
          ${characterCard(profile)}
          <dl class="forum-author-stats">
            <div><dt>Posts</dt><dd>${esc(count(profile.postCount))}</dd></div>
            <div><dt>Joined</dt><dd>${esc(joinedDate(profile.joinDate))}</dd></div>
          </dl>
        </aside>
        <div class="forum-post-content">
          <header class="forum-post-head">
            <span>${post.number === 1 ? "Original post" : `Reply #${post.number - 1}`}</span>
            <a href="#post-${esc(post.id)}">${esc(niceDate(post.created_at))} · #${esc(post.number)}</a>
          </header>
          <div class="forum-post-body">${esc(post.body).replace(/\n/g, "<br>")}</div>
          <footer class="forum-post-actions">
            ${Number(thread.locked) ? `<span>🔒 Thread locked</span>` : `<a href="#forum-reply">Reply to discussion</a>`}
          </footer>
        </div>
      </article>
    `;
  }

  app.get("/forums/community.css", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.sendFile(path.join(__dirname, "community.css"));
  });

  app.get("/forums", async (req, res) => {
    try {
      const data = await engine.forumIndex(req.activeRealm, req.user);
      const categories = data.categories.map(category => `
        <section class="forum-category">
          <header class="forum-category-head">
            <div>
              <span>Forum Category</span>
              <h2>${esc(category.name)}</h2>
            </div>
            <p>${esc(category.description || "Explore community discussions and realm updates.")}</p>
          </header>
          <div class="forum-board-list">
            ${category.boards.map(boardRow).join("")}
          </div>
        </section>
      `).join("");

      render(req, res, `${data.realm.name} Community Forums`, forumPage(`
        <section class="forum-hero">
          <div class="container forum-hero-inner">
            <div>
              <span class="forum-kicker">${esc(data.realm.name)} Community</span>
              <h1>Community Forums</h1>
              <p>Realm news, player guides, guild recruitment, support, and conversations from across Northrend.</p>
              <div class="forum-hero-actions">
                ${req.user
                  ? `<a class="btn" href="#forum-categories">Browse Discussions</a><a class="btn secondary" href="/account">My Account</a>`
                  : `<a class="btn" href="/login?next=/forums">Login to Post</a><a class="btn secondary" href="/register">Join the Realm</a>`}
              </div>
            </div>
            <dl class="forum-hero-stats">
              <div><dt>Boards</dt><dd>${esc(count(data.totals.boards))}</dd></div>
              <div><dt>Threads</dt><dd>${esc(count(data.totals.threads))}</dd></div>
              <div><dt>Posts</dt><dd>${esc(count(data.totals.posts))}</dd></div>
            </dl>
          </div>
        </section>

        <div class="container forum-content" id="forum-categories">
          ${rewardPanel(data.viewer)}
          ${categories || `<section class="forum-empty-state"><h2>No forum boards yet</h2><p>Forum categories will appear here.</p></section>`}
        </div>
      `), {
        seo: {
          description: `Join the ${data.realm.name} WotLK community forums for announcements, guilds, guides, support, and player discussion.`,
          url: "https://frozenthrone.co/forums"
        }
      });
    } catch (error) {
      console.error("forum index failed", error);
      render(req, res, "Forum Error", errorPage("The forums could not load", error.message));
    }
  });

  app.get("/forums/board/:id", async (req, res) => {
    try {
      const data = await engine.boardPage(Number(req.params.id), req.activeRealm, req.query.page, req.user);
      if (!data) {
        res.status(404);
        return render(req, res, "Board Not Found", errorPage("Board not found", "This board is unavailable for the selected realm."));
      }

      render(req, res, `${data.board.name} Forum`, forumPage(`
        <section class="container forum-board-page">
          ${breadcrumbs([
            { label: "Forums", href: "/forums" },
            { label: data.board.category_name, href: "/forums" },
            { label: data.board.name }
          ])}

          <header class="forum-board-hero">
            <span class="forum-board-hero-icon">${esc(data.board.icon || "💬")}</span>
            <div>
              <span class="forum-kicker">${esc(data.realm.name)} · ${esc(data.board.category_name)}</span>
              <h1>${esc(data.board.name)}</h1>
              <p>${esc(data.board.description || "Community discussions and the latest realm conversations.")}</p>
            </div>
            <dl>
              <div><dt>Threads</dt><dd>${esc(count(data.totalThreads))}</dd></div>
              <div><dt>Page</dt><dd>${esc(data.page)} / ${esc(data.totalPages)}</dd></div>
            </dl>
          </header>

          ${rewardPanel(data.viewer, true)}

          ${data.featured.length ? `
            <section class="forum-featured-section">
              <header><span>Featured</span><h2>Important Discussions</h2></header>
              <div class="forum-featured-grid">${data.featured.map(featuredThread).join("")}</div>
            </section>
          ` : ""}

          <section class="forum-thread-section">
            <header class="forum-thread-toolbar">
              <div><span>Discussion Board</span><h2>All Threads</h2></div>
              ${req.user
                ? `<a class="btn" href="/forums/board/${esc(data.board.id)}/new">+ New Thread</a>`
                : `<a class="btn" href="/login?next=/forums/board/${esc(data.board.id)}">Login to Post</a>`}
            </header>
            <div class="forum-thread-column-head" aria-hidden="true">
              <span>Topic</span><span>Replies / Views</span><span>Last Activity</span>
            </div>
            <div class="forum-thread-list">
              ${data.threads.map(threadRow).join("") || `<div class="forum-empty-state"><h3>No regular discussions yet</h3><p>Create a new thread and begin the conversation.</p></div>`}
            </div>
          </section>

          ${pagination(`/forums/board/${data.board.id}`, data.page, data.totalPages)}
        </section>
      `));
    } catch (error) {
      console.error("forum board failed", error);
      render(req, res, "Forum Error", errorPage("The board could not load", error.message));
    }
  });

  app.get("/forums/board/:id/new", requireLogin, async (req, res) => {
    try {
      const data = await engine.boardPage(Number(req.params.id), req.activeRealm, 1, req.user);
      if (!data) {
        res.status(404);
        return render(req, res, "Board Not Found", errorPage("Board not found", "This board is unavailable for the selected realm."));
      }

      render(req, res, `New Thread in ${data.board.name}`, forumPage(`
        <section class="container forum-compose-page">
          ${breadcrumbs([
            { label: "Forums", href: "/forums" },
            { label: data.board.name, href: `/forums/board/${data.board.id}` },
            { label: "New Thread" }
          ])}
          <header class="forum-compose-head">
            <span class="forum-kicker">Start a Discussion</span>
            <h1>New Thread</h1>
            <p>Posting in <strong>${esc(data.board.name)}</strong> as ${esc(data.viewer.profile.username)} on ${esc(data.realm.name)}.</p>
          </header>
          ${rewardPanel(data.viewer)}
          <form class="forum-compose-card" method="POST" action="/forums/board/${esc(data.board.id)}/new">
            <label for="forum-title">Thread title</label>
            <input id="forum-title" name="title" required minlength="4" maxlength="200" placeholder="Give your discussion a clear title">

            ${data.viewer.canModerate ? `
              <label for="forum-thread-type">Thread type</label>
              <select id="forum-thread-type" name="thread_type">
                <option value="normal">Normal Discussion</option>
                <option value="sticky">Pinned</option>
                <option value="announcement">Announcement</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            ` : `<input type="hidden" name="thread_type" value="normal">`}

            <label for="forum-message">Message</label>
            <textarea id="forum-message" name="body" rows="14" required minlength="20" placeholder="Share your thoughts with the community..."></textarea>
            <p class="forum-field-help">Messages of at least 50 characters advance your Vote Token reward progress.</p>

            <div class="forum-form-actions">
              <button class="btn" type="submit">Create Thread</button>
              <a class="btn secondary" href="/forums/board/${esc(data.board.id)}">Cancel</a>
            </div>
          </form>
        </section>
      `));
    } catch (error) {
      console.error("new forum thread page failed", error);
      render(req, res, "Forum Error", errorPage("The editor could not load", error.message));
    }
  });

  app.post("/forums/board/:id/new", requireLogin, async (req, res) => {
    try {
      const result = await engine.createThread({
        boardId: Number(req.params.id),
        title: req.body.title,
        body: req.body.body,
        threadType: req.body.thread_type,
        realmRef: req.activeRealm,
        user: req.user
      });
      res.redirect(`/forums/thread/${result.threadId}${rewardQuery(result.reward)}`);
    } catch (error) {
      console.error("create forum thread failed", error);
      render(req, res, "Forum Error", errorPage("The thread was not created", error.message));
    }
  });

  app.get("/forums/thread/:id", async (req, res) => {
    try {
      const data = await engine.threadPage(Number(req.params.id), req.activeRealm, req.query.page, req.user);
      if (!data) {
        res.status(404);
        return render(req, res, "Thread Not Found", errorPage("Thread not found", "This discussion is unavailable for the selected realm."));
      }

      const threadType = typeOf(data.thread.thread_type);
      const posts = data.posts.map(post => postCard(post, data.thread)).join("");
      const moderation = data.viewer?.canModerate ? `
        <details class="forum-moderation">
          <summary>GM Thread Tools</summary>
          <form method="POST" action="/forums/thread/${esc(data.thread.id)}/moderate">
            <label>Thread type
              <select name="thread_type">
                ${Object.entries(typeDetails).map(([value, details]) =>
                  `<option value="${esc(value)}" ${data.thread.thread_type === value ? "selected" : ""}>${details.icon} ${esc(details.label)}</option>`
                ).join("")}
              </select>
            </label>
            <label>Move to board
              <select name="board_id">
                ${data.moderationBoards.map(board =>
                  `<option value="${esc(board.id)}" ${Number(board.id) === Number(data.thread.board_id) ? "selected" : ""}>${esc(board.name)}</option>`
                ).join("")}
              </select>
            </label>
            <label>Thread status
              <select name="locked">
                <option value="0" ${Number(data.thread.locked) ? "" : "selected"}>Unlocked</option>
                <option value="1" ${Number(data.thread.locked) ? "selected" : ""}>Locked</option>
              </select>
            </label>
            <button class="btn" type="submit">Save Thread Tools</button>
          </form>
        </details>
      ` : "";

      const composer = Number(data.thread.locked)
        ? `<section class="forum-locked-notice"><strong>🔒 This discussion is locked.</strong><span>New replies are no longer being accepted.</span></section>`
        : req.user
          ? `
            <section class="forum-reply-section" id="forum-reply">
              <header><span>Join the Discussion</span><h2>Post a Reply</h2></header>
              ${rewardPanel(data.viewer, true)}
              <form method="POST" action="/forums/thread/${esc(data.thread.id)}/reply">
                <label for="forum-reply-body">Reply as ${esc(data.viewer.profile.username)}</label>
                <textarea id="forum-reply-body" name="body" rows="9" required minlength="10" placeholder="Write your reply..."></textarea>
                <div class="forum-reply-footer">
                  <small>50+ characters qualify toward your next Vote Token.</small>
                  <button class="btn" type="submit">Post Reply</button>
                </div>
              </form>
            </section>
          `
          : `<section class="forum-login-notice"><strong>Want to join this discussion?</strong><a class="btn" href="/login?next=/forums/thread/${esc(data.thread.id)}">Login to Reply</a></section>`;

      render(req, res, data.thread.title, forumPage(`
        <section class="container forum-thread-page">
          ${breadcrumbs([
            { label: "Forums", href: "/forums" },
            { label: data.thread.board_name, href: `/forums/board/${data.thread.board_id}` },
            { label: data.thread.title }
          ])}

          ${rewardNotice(req.query.forumReward)}

          <header class="forum-topic-head type-${esc(data.thread.thread_type || "normal")}">
            <div class="forum-topic-icon">${Number(data.thread.locked) ? "🔒" : threadType.icon}</div>
            <div>
              <div class="forum-topic-badges">${threadBadge(data.thread)}${Number(data.thread.locked) ? `<span class="forum-thread-badge locked">Locked</span>` : ""}</div>
              <h1>${esc(data.thread.title)}</h1>
              <p>Started by <strong>${esc(data.thread.author.username)}</strong> in <a href="/forums/board/${esc(data.thread.board_id)}">${esc(data.thread.board_name)}</a></p>
            </div>
            <dl>
              <div><dt>Replies</dt><dd>${esc(count(data.thread.replies))}</dd></div>
              <div><dt>Views</dt><dd>${esc(count(data.thread.views))}</dd></div>
            </dl>
          </header>

          ${pagination(`/forums/thread/${data.thread.id}`, data.page, data.totalPages)}
          <div class="forum-post-list">${posts || `<div class="forum-empty-state"><p>No posts found.</p></div>`}</div>
          ${pagination(`/forums/thread/${data.thread.id}`, data.page, data.totalPages)}
          ${moderation}
          ${composer}
          <div class="forum-bottom-nav"><a class="btn secondary" href="/forums/board/${esc(data.thread.board_id)}">← Back to ${esc(data.thread.board_name)}</a></div>
        </section>
      `), {
        seo: {
          description: excerpt(data.posts[0]?.body || data.thread.title, 155),
          url: `https://frozenthrone.co/forums/thread/${data.thread.id}`
        }
      });
    } catch (error) {
      console.error("forum thread failed", error);
      render(req, res, "Forum Error", errorPage("The discussion could not load", error.message));
    }
  });

  app.post("/forums/thread/:id/reply", requireLogin, async (req, res) => {
    try {
      const result = await engine.createReply({
        threadId: Number(req.params.id),
        body: req.body.body,
        realmRef: req.activeRealm,
        user: req.user
      });
      const query = rewardQuery(result.reward);
      const separator = query ? "&" : "?";
      res.redirect(`/forums/thread/${req.params.id}${query}${separator}page=${result.page}#post-${result.postId}`);
    } catch (error) {
      console.error("forum reply failed", error);
      render(req, res, "Forum Error", errorPage("The reply was not posted", error.message));
    }
  });

  app.post("/forums/thread/:id/moderate", requireGM, async (req, res) => {
    try {
      await engine.moderateThread({
        threadId: Number(req.params.id),
        boardId: Number(req.body.board_id),
        threadType: req.body.thread_type,
        locked: req.body.locked,
        realmRef: req.activeRealm
      });
      res.redirect(`/forums/thread/${req.params.id}`);
    } catch (error) {
      console.error("forum moderation failed", error);
      render(req, res, "Moderation Error", errorPage("The thread was not updated", error.message));
    }
  });
};
