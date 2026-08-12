// Compare button + modal: pick any two people from {you + your friends}
// and overlay their maps (blue = both, orange = A, green = B).

(function () {
  const btn = document.getElementById("btn-compare");
  const modal = document.getElementById("compare-modal");
  const body = document.getElementById("compare-body");

  if (!Store.cloud.enabled()) {
    btn.style.display = "none";
    return;
  }

  async function renderModal() {
    if (!Store.cloud.user()) {
      body.innerHTML = `<p class="acct-line muted">Sign in first to compare maps.</p>`;
      return;
    }
    if (!Store.cloud.profile()) {
      body.innerHTML = `<p class="acct-line muted">Pick a username in <b>Friends</b> first.</p>`;
      return;
    }

    body.innerHTML = `<p class="acct-line muted">Loading friends…</p>`;
    const { friends, error } = await Store.cloud.myFriends();
    if (error) {
      body.innerHTML = `<p class="acct-error">${error}</p>`;
      return;
    }
    if (!friends.length) {
      body.innerHTML = `<p class="acct-line muted">Add at least one friend (in <b>Friends</b>) to compare maps.</p>`;
      return;
    }

    // People = you + your friends; slot A defaults to you, slot B to the
    // first friend. Comparing two friends (without you) is allowed.
    const me = "@" + Store.cloud.profile();
    const people = [{ name: me, doc: null }] // null = my live data
      .concat(friends.map((f) => ({ name: "@" + f.username, doc: f.doc })));

    const options = (selected) => people
      .map((p, i) => `<option value="${i}" ${i === selected ? "selected" : ""}>${p.name}</option>`)
      .join("");
    body.innerHTML =
      `<div class="compare-pick"><label>Person 1</label><select id="cmp-a">${options(0)}</select></div>` +
      `<div class="compare-pick"><label>Person 2</label><select id="cmp-b">${options(1)}</select></div>` +
      `<div class="acct-error" id="cmp-error"></div>` +
      `<button class="btn primary" id="cmp-go">Compare</button>`;

    document.getElementById("cmp-go").onclick = () => {
      const a = people[+document.getElementById("cmp-a").value];
      const b = people[+document.getElementById("cmp-b").value];
      if (a === b) {
        document.getElementById("cmp-error").textContent = "Pick two different people.";
        return;
      }
      Store.compareWith(
        { name: a.name, doc: a.doc || Store.myDoc() },
        { name: b.name, doc: b.doc || Store.myDoc() },
      );
      close();
    };
  }

  function open() { modal.classList.add("open"); renderModal(); }
  function close() { modal.classList.remove("open"); }

  btn.onclick = open;
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.getElementById("compare-close").onclick = close;
  document.getElementById("compare-exit").onclick = () => Store.compareOff();
})();
