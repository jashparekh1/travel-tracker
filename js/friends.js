// Friends button + modal: pick a username, add friends by username, see
// their stats next to yours, and start/stop map comparison.

(function () {
  const btn = document.getElementById("btn-friends");
  const modal = document.getElementById("friends-modal");
  const body = document.getElementById("friends-body");

  if (!Store.cloud.enabled()) {
    btn.style.display = "none";
    return;
  }

  const statsLine = (c) => `🌍 ${c.countries} · 🇺🇸 ${c.states} · 🏞️ ${c.parks}`;

  async function renderModal() {
    if (!Store.cloud.user()) {
      body.innerHTML = `<p class="acct-line muted">Sign in first — friends live on your account.</p>`;
      return;
    }

    if (!Store.cloud.profile()) {
      body.innerHTML =
        `<p class="acct-line muted">Pick a username so friends can find you (this is what others see — never your email).</p>` +
        `<input id="uname-input" placeholder="username (3–20 chars, a–z 0–9 _)" maxlength="20">` +
        `<div class="acct-error" id="uname-error"></div>` +
        `<button class="btn primary" id="uname-save">Save username</button>`;
      document.getElementById("uname-save").onclick = async () => {
        const message = await Store.cloud.setUsername(document.getElementById("uname-input").value);
        if (message) document.getElementById("uname-error").textContent = message;
        else renderModal();
      };
      return;
    }

    body.innerHTML = `<p class="acct-line muted">Loading…</p>`;
    const { friends, error } = await Store.cloud.myFriends();
    if (error) {
      body.innerHTML = `<p class="acct-error">${error}</p>` +
        `<p class="acct-line muted">If this mentions a missing table, run supabase/friends.sql in the Supabase SQL editor.</p>`;
      return;
    }

    const mine = Store.counts();
    let html =
      `<p class="acct-line">You are <b>@${Store.cloud.profile()}</b> — share that with friends so they can add you.</p>` +
      `<div class="friend-row you"><span class="friend-name">you</span>` +
      `<span class="friend-stats">${statsLine({ countries: mine.countries, states: mine.states, parks: mine.parks })}</span></div>`;

    for (const f of friends) {
      const c = Store.cloud.countsFromDoc(f.doc);
      html +=
        `<div class="friend-row" data-id="${f.id}">` +
        `<span class="friend-name">@${f.username}</span>` +
        `<span class="friend-stats">${statsLine(c)}</span>` +
        `<button class="btn small remove-btn" title="Remove friend">✕</button>` +
        `</div>`;
    }
    if (!friends.length) {
      html += `<p class="acct-line muted">No friends yet — add one below.</p>`;
    }
    html +=
      `<div class="add-friend">` +
      `<input id="friend-input" placeholder="friend's username">` +
      `<button class="btn" id="friend-add">Add</button>` +
      `</div><div class="acct-error" id="friend-error"></div>`;
    body.innerHTML = html;

    body.querySelectorAll(".remove-btn").forEach((b) => {
      b.onclick = async () => {
        const row = b.closest(".friend-row");
        Store.compareOff();
        await Store.cloud.removeFriend(row.dataset.id);
        renderModal();
      };
    });
    document.getElementById("friend-add").onclick = async () => {
      const message = await Store.cloud.addFriend(document.getElementById("friend-input").value);
      if (message) document.getElementById("friend-error").textContent = message;
      else renderModal();
    };
    document.getElementById("friend-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("friend-add").click();
    });
  }

  function open() { modal.classList.add("open"); renderModal(); }
  function close() { modal.classList.remove("open"); }

  btn.onclick = open;
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.getElementById("friends-close").onclick = close;
})();
