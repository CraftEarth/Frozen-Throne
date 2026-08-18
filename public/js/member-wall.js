(() => {
  const wall = document.querySelector("[data-member-wall]");
  if (!wall) return;

  const list = wall.querySelector("[data-wall-list]");
  const form = wall.querySelector("[data-wall-form]");
  const messageInput = wall.querySelector("[data-wall-message]");
  const count = wall.querySelector("[data-wall-count]");
  const feedback = wall.querySelector("[data-wall-feedback]");
  const submit = wall.querySelector("[data-wall-submit]");
  const mode = wall.dataset.wallMode || "site";
  const limit = mode === "account" ? 10 : 4;

  const realmNames = {
    main: "FrozenThrone",
    shadowmourne: "Shadowmourne"
  };

  function setFeedback(message, isError = false) {
    if (!feedback) return;

    feedback.textContent = message || "";
    feedback.classList.toggle("error", Boolean(isError));
  }

  function formatDate(value) {
    if (!value) return "Just now";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently";

    const elapsed = Date.now() - date.getTime();
    const minutes = Math.floor(elapsed / 60000);
    const hours = Math.floor(elapsed / 3600000);
    const days = Math.floor(elapsed / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear()
        ? "numeric"
        : undefined
    });
  }

  function createMessage(message) {
    const article = document.createElement("article");
    article.className = "member-wall-message";

    if (message.pinned) {
      article.classList.add("pinned");
    }

    const identity = document.createElement("div");
    identity.className = "member-wall-identity";

    const avatar = document.createElement("span");
    avatar.className = "member-wall-avatar";
    avatar.textContent = String(message.username || "?")
      .slice(0, 1)
      .toUpperCase();

    const member = document.createElement("div");

    const username = document.createElement("a");
    username.className = "member-wall-profile-link";
    username.href = message.profileSlug
      ? `/members/${encodeURIComponent(message.profileSlug)}`
      : "/members";
    username.textContent = message.username || "FrozenThrone Member";

    const meta = document.createElement("span");
    meta.textContent =
      `${realmNames[message.realmKey] || message.realmKey} · ${formatDate(message.createdAt)}`;

    member.append(username, meta);
    identity.append(avatar, member);

    const body = document.createElement("p");
    body.textContent = message.body || "";

    article.append(identity, body);

    if (message.pinned) {
      const pinned = document.createElement("span");
      pinned.className = "member-wall-pinned";
      pinned.textContent = "Pinned";
      article.append(pinned);
    }

    return article;
  }

  function renderEmpty() {
    list.replaceChildren();

    const empty = document.createElement("div");
    empty.className = "member-wall-empty";

    const icon = document.createElement("span");
    icon.textContent = "❄";

    const heading = document.createElement("strong");
    heading.textContent = "Waiting on a message…";

    const description = document.createElement("p");
    description.textContent =
      wall.dataset.wallAuth === "1"
        ? "The Tavern is quiet. Be the first member to leave a message."
        : "No member has written on the Tavern wall yet.";

    empty.append(icon, heading, description);
    list.append(empty);

    if (count) count.textContent = "No messages yet";
  }

  function renderMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      renderEmpty();
      return;
    }

    list.replaceChildren();

    messages.forEach(message => {
      list.append(createMessage(message));
    });

    if (count) {
      count.textContent =
        `${messages.length} recent message${messages.length === 1 ? "" : "s"}`;
    }
  }

  async function loadMessages() {
    try {
      const response = await fetch(
        `/api/member-wall?limit=${limit}`,
        {
          credentials: "same-origin",
          headers: { Accept: "application/json" }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "The Tavern wall could not be loaded.");
      }

      renderMessages(data.messages);
    } catch (error) {
      list.replaceChildren();

      const failed = document.createElement("div");
      failed.className = "member-wall-empty failed";

      const heading = document.createElement("strong");
      heading.textContent = "Tavern wall unavailable";

      const description = document.createElement("p");
      description.textContent = error.message;

      failed.append(heading, description);
      list.append(failed);
    }
  }

  if (messageInput && count) {
    const updateCharacterCount = () => {
      count.textContent = `${messageInput.value.length}/300`;
    };

    messageInput.addEventListener("input", updateCharacterCount);
    updateCharacterCount();
  }

  if (form) {
    form.addEventListener("submit", async event => {
      event.preventDefault();

      const message = String(messageInput?.value || "").trim();
      if (!message) return;

      submit.disabled = true;
      submit.textContent = "Posting…";
      setFeedback("");

      try {
        const response = await fetch("/api/member-wall", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            _csrf: wall.dataset.wallCsrf || "",
            message
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Message could not be posted.");
        }

        form.reset();
        setFeedback("Your message was added to the Tavern wall.");
        await loadMessages();
      } catch (error) {
        setFeedback(error.message, true);
      } finally {
        submit.disabled = false;
        submit.textContent = "Post Message";
      }
    });
  }

  loadMessages();
})();
