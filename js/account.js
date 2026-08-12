// Account button + modal (globe page). Sign in / sign up / sign out and a
// live sync indicator. Hidden entirely when Supabase isn't configured.

(function () {
  const btn = document.getElementById("btn-account");
  const modal = document.getElementById("account-modal");
  const body = document.getElementById("account-body");

  if (!Store.cloud.enabled()) {
    btn.style.display = "none";
    return;
  }

  const SYNC_LABEL = {
    signedout: "", saving: "saving…", synced: "✓ synced", error: "⚠ sync error",
  };

  function renderButton() {
    const u = Store.cloud.user();
    btn.textContent = u ? u.email.split("@")[0] : "Sign in";
    btn.classList.toggle("signed-in", !!u);
  }

  function renderModal() {
    const u = Store.cloud.user();
    if (u) {
      const uname = Store.cloud.profile();
      body.innerHTML =
        `<p class="acct-line">Signed in as <b>${u.email}</b>${uname ? ` (@${uname})` : ""}</p>` +
        `<p class="acct-line muted" id="sync-line">${SYNC_LABEL[Store.cloud.state()] || ""}</p>` +
        `<p class="acct-line muted">Your map saves to the cloud automatically and follows you across devices.</p>` +
        `<button class="btn" id="btn-signout">Sign out</button>`;
      document.getElementById("btn-signout").onclick = async () => {
        await Store.cloud.signOut();
        close();
      };
    } else {
      body.innerHTML =
        `<p class="acct-line muted">Create an account to save your progress and sync across devices.</p>` +
        `<button class="btn google" id="btn-google">Continue with Google</button>` +
        `<div class="acct-divider">or with email</div>` +
        `<input type="email" id="acct-email" placeholder="email" autocomplete="email">` +
        `<input type="password" id="acct-password" placeholder="password (8+ characters)" autocomplete="current-password">` +
        `<div class="acct-error" id="acct-error"></div>` +
        `<div class="acct-actions">` +
        `<button class="btn primary" id="btn-signin">Sign in</button>` +
        `<button class="btn" id="btn-signup">Create account</button>` +
        `</div>`;
      const email = () => document.getElementById("acct-email").value.trim();
      const pw = () => document.getElementById("acct-password").value;
      const err = (m) => { document.getElementById("acct-error").textContent = m || ""; };
      const run = async (fn) => {
        err("");
        if (!email() || pw().length < 8) { err("Enter an email and a password of 8+ characters."); return; }
        const message = await fn(email(), pw());
        if (message) err(message);
        else close();
      };
      document.getElementById("btn-signin").onclick = () => run(Store.cloud.signIn);
      document.getElementById("btn-signup").onclick = () => run(Store.cloud.signUp);
      document.getElementById("btn-google").onclick = async () => {
        const message = await Store.cloud.signInGoogle();
        if (message) err(message); // e.g. provider not enabled in Supabase yet
      };
      document.getElementById("acct-password").addEventListener("keydown", (e) => {
        if (e.key === "Enter") run(Store.cloud.signIn);
      });
    }
  }

  function open() { renderModal(); modal.classList.add("open"); }
  function close() { modal.classList.remove("open"); }

  btn.onclick = open;
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.getElementById("account-close").onclick = close;

  Store.cloud.onSync(() => {
    renderButton();
    const line = document.getElementById("sync-line");
    if (line) line.textContent = SYNC_LABEL[Store.cloud.state()] || "";
    if (modal.classList.contains("open")) renderModal();
  });
  renderButton();
})();
