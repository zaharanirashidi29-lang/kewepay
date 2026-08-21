const app = document.getElementById("app");
const state = {
  token: localStorage.getItem("kp_token") || "",
  user: null,
  summary: null,
  payments: [],
  keys: [],
  flash: null
};

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const path = hash.split("?")[0];
  if (path === "/login") return renderLogin();
  if (path === "/register") return renderRegister();
  if (path === "/dashboard") return renderDashboard();
  if (path === "/docs") return renderDocs();
  return renderHome();
}

function nav(extra = "") {
  return `
    <div class="nav">
      <a class="brand" href="#/">Kewe<span>Pay</span></a>
      <div class="nav-actions">
        ${extra}
      </div>
    </div>
  `;
}

function renderHome() {
  app.innerHTML = `
    <section class="hero">
      ${nav(`
        <a class="btn btn-ghost" href="#/docs">Docs</a>
        <a class="btn btn-soft" href="#/login">Sign in</a>
        <a class="btn btn-primary" href="#/register">Create account</a>
      `)}
      <div class="hero-copy">
        <h1>KewePay</h1>
        <p>Your gateway. One API for M-Pesa, Airtel Money, Mixx by YAS and Halotel — settled through Snippe, controlled by you.</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="#/register">Start collecting</a>
          <a class="btn btn-ghost" href="#/docs">View API</a>
        </div>
      </div>
    </section>
    <section class="section">
      <h2>Built for control</h2>
      <p class="lead">Merchants use KewePay keys. You keep the platform. Snippe moves the money on the networks.</p>
      <div class="grid-3">
        <div class="feature">
          <h3>Your brand</h3>
          <p>Dashboard, API keys and webhooks under KewePay — UnlockVIP stays on its own backend.</p>
        </div>
        <div class="feature">
          <h3>Snippe rails</h3>
          <p>Every USSD collection is routed to Snippe. You set platform fees and merchant settings.</p>
        </div>
        <div class="feature">
          <h3>Merchant ready</h3>
          <p>Register, create live keys, push payments, and receive completion webhooks.</p>
        </div>
      </div>
    </section>
    <section class="section">
      <h2>Collect in minutes</h2>
      <p class="lead">POST a phone number and amount. Customer confirms on USSD.</p>
      <pre class="code-panel">curl -X POST https://your-kewepay.host/v1/payments \\
  -H "Authorization: Bearer kp_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "2557xxxxxxx",
    "amount": 3061,
    "customer": { "firstname": "Asha", "lastname": "Juma", "email": "asha@example.com" }
  }'</pre>
    </section>
    <footer class="site">KewePay · Powered by Snippe · Separate from UnlockVIP</footer>
  `;
}

function renderLogin() {
  app.innerHTML = `
    <div class="appbar">
      <a class="brand" href="#/">Kewe<span>Pay</span></a>
      <a href="#/register">Create account</a>
    </div>
    <form class="auth-card" id="login-form">
      <h1>Sign in</h1>
      <p>Access your KewePay dashboard.</p>
      <label>Email</label>
      <input name="email" type="email" required placeholder="you@business.co.tz" />
      <label>Password</label>
      <input name="password" type="password" required />
      <div class="stack">
        <button class="btn btn-dark" type="submit">Sign in</button>
      </div>
      <div id="msg"></div>
    </form>
  `;
  document.getElementById("login-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById("msg");
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") })
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem("kp_token", data.token);
      location.hash = "#/dashboard";
    } catch (err) {
      msg.className = "msg error";
      msg.textContent = err.message;
    }
  };
}

function renderRegister() {
  app.innerHTML = `
    <div class="appbar">
      <a class="brand" href="#/">Kewe<span>Pay</span></a>
      <a href="#/login">Sign in</a>
    </div>
    <form class="auth-card" id="reg-form">
      <h1>Create merchant</h1>
      <p>Get API keys and start collecting.</p>
      <label>Full name</label>
      <input name="name" required />
      <label>Business name</label>
      <input name="businessName" required />
      <label>Email</label>
      <input name="email" type="email" required />
      <label>Password</label>
      <input name="password" type="password" minlength="8" required />
      <div class="stack">
        <button class="btn btn-dark" type="submit">Create account</button>
      </div>
      <div id="msg"></div>
    </form>
  `;
  document.getElementById("reg-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById("msg");
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          businessName: fd.get("businessName"),
          email: fd.get("email"),
          password: fd.get("password")
        })
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem("kp_token", data.token);
      location.hash = "#/dashboard";
    } catch (err) {
      msg.className = "msg error";
      msg.textContent = err.message;
    }
  };
}

function badge(status) {
  const s = String(status || "").toUpperCase();
  if (s === "COMPLETED") return '<span class="badge ok">COMPLETED</span>';
  if (s === "FAILED") return '<span class="badge bad">FAILED</span>';
  return '<span class="badge warn">PROCESSING</span>';
}

async function loadDashboardData() {
  const [me, summary, payments, keys] = await Promise.all([
    api("/auth/me"),
    api("/dashboard/summary"),
    api("/payments?limit=40"),
    api("/keys")
  ]);
  state.user = me.user;
  state.summary = summary.summary;
  state.payments = payments.payments || [];
  state.keys = keys.keys || [];
}

function renderDashboard() {
  if (!state.token) {
    location.hash = "#/login";
    return;
  }
  app.innerHTML = `
    <div class="appbar">
      <a class="brand" href="#/dashboard">Kewe<span>Pay</span></a>
      <div class="nav-actions">
        <a href="#/docs">Docs</a>
        <button class="btn btn-soft" id="logout" style="color:#12332f;border-color:var(--line)">Log out</button>
      </div>
    </div>
    <div class="panel" id="dash">Loading dashboard…</div>
  `;
  document.getElementById("logout").onclick = () => {
    state.token = "";
    localStorage.removeItem("kp_token");
    location.hash = "#/";
  };

  loadDashboardData()
    .then(() => {
      const s = state.summary;
      const u = state.user;
      document.getElementById("dash").innerHTML = `
        <h1 style="font-family:var(--font-display);letter-spacing:-0.03em;margin:0 0 .3rem">
          ${u.businessName || u.name}
        </h1>
        <p style="color:var(--muted);margin:0 0 1rem">${u.email} · ${u.role}</p>
        ${state.flash ? `<div class="msg ok">${state.flash}</div>` : ""}
        <div class="stats">
          <div class="stat"><div class="label">Volume</div><div class="value">${Number(s.volume).toLocaleString()} TZS</div></div>
          <div class="stat"><div class="label">Completed</div><div class="value">${s.completed}</div></div>
          <div class="stat"><div class="label">Processing</div><div class="value">${s.processing}</div></div>
          <div class="stat"><div class="label">Platform fees</div><div class="value">${Number(s.fees).toLocaleString()} TZS</div></div>
        </div>
        ${u.role === "admin" && s.snippe_balance != null ? `<p class="mono">Snippe available balance: ${s.snippe_balance} TZS</p>` : ""}

        <div class="toolbar">
          <button class="btn btn-dark" id="new-key">Create API key</button>
          <button class="btn btn-primary" id="save-hook">Save webhook URL</button>
        </div>
        <label>Merchant webhook URL</label>
        <input id="webhookUrl" value="${u.webhookUrl || ""}" placeholder="https://your-app.com/webhooks/kewepay" />
        <div id="key-box"></div>

        <h2 style="font-family:var(--font-display);margin:2rem 0 .8rem;font-size:1.4rem">API keys</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Prefix</th><th>Last used</th><th></th></tr></thead>
            <tbody>
              ${state.keys
                .map(
                  (k) => `<tr>
                  <td>${k.name}</td>
                  <td class="mono">${k.prefix}…</td>
                  <td>${k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}</td>
                  <td><button data-revoke="${k.id}" class="btn btn-soft" style="color:#12332f;border:1px solid var(--line);padding:.4rem .8rem">Revoke</button></td>
                </tr>`
                )
                .join("") || `<tr><td colspan="4">No keys yet</td></tr>`}
            </tbody>
          </table>
        </div>

        <h2 style="font-family:var(--font-display);margin:2rem 0 .8rem;font-size:1.4rem">Recent payments</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Reference</th><th>Phone</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              ${state.payments
                .map(
                  (p) => `<tr>
                  <td class="mono">${p.reference}</td>
                  <td>${p.phone}</td>
                  <td>${Number(p.amount).toLocaleString()} ${p.currency || "TZS"}</td>
                  <td>${badge(p.status)}</td>
                  <td>${new Date(p.createdAt).toLocaleString()}</td>
                </tr>`
                )
                .join("") || `<tr><td colspan="5">No payments yet</td></tr>`}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById("new-key").onclick = async () => {
        try {
          const data = await api("/keys", { method: "POST", body: JSON.stringify({ name: "Live" }) });
          document.getElementById("key-box").innerHTML = `
            <div class="reveal-key">
              <strong>Copy now — shown once</strong><br/>${data.key.secret}
            </div>`;
          state.flash = "API key created";
          await loadDashboardData();
          renderDashboard();
        } catch (err) {
          alert(err.message);
        }
      };

      document.getElementById("save-hook").onclick = async () => {
        try {
          await api("/auth/me", {
            method: "PATCH",
            body: JSON.stringify({ webhookUrl: document.getElementById("webhookUrl").value })
          });
          state.flash = "Webhook URL saved";
          renderDashboard();
        } catch (err) {
          alert(err.message);
        }
      };

      document.querySelectorAll("[data-revoke]").forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm("Revoke this key?")) return;
          await api(`/keys/${btn.dataset.revoke}`, { method: "DELETE" });
          state.flash = "Key revoked";
          renderDashboard();
        };
      });
    })
    .catch((err) => {
      state.token = "";
      localStorage.removeItem("kp_token");
      alert(err.message);
      location.hash = "#/login";
    });
}

function renderDocs() {
  app.innerHTML = `
    <div class="appbar">
      <a class="brand" href="#/">Kewe<span>Pay</span></a>
      <a class="btn btn-dark" href="#/register">Get API key</a>
    </div>
    <div class="panel">
      <h1 style="font-family:var(--font-display);letter-spacing:-0.03em">API docs</h1>
      <p style="color:var(--muted);max-width:40rem">KewePay exposes a merchant API. Under the hood every collection is created on Snippe. UnlockVIP keeps using its own backend.</p>

      <h2 style="font-family:var(--font-display);font-size:1.3rem;margin-top:2rem">Create payment</h2>
      <pre class="code-panel">POST /v1/payments
Authorization: Bearer kp_live_xxx

{
  "phone": "255712345678",
  "amount": 3061,
  "reference": "ORD123",
  "customer": {
    "firstname": "Asha",
    "lastname": "Juma",
    "email": "asha@example.com"
  },
  "webhook_url": "https://your-app.com/hooks",
  "metadata": { "order_id": "VIP-1" }
}</pre>

      <h2 style="font-family:var(--font-display);font-size:1.3rem;margin-top:2rem">Get payment</h2>
      <pre class="code-panel">GET /v1/payments/{reference}
Authorization: Bearer kp_live_xxx</pre>

      <h2 style="font-family:var(--font-display);font-size:1.3rem;margin-top:2rem">Merchant webhook</h2>
      <pre class="code-panel">{
  "event": "payment.completed",
  "data": {
    "reference": "ORD123",
    "status": "completed",
    "amount": 3061,
    "platform_fee": 31,
    "net_amount": 3030
  }
}</pre>
    </div>
  `;
}

window.addEventListener("hashchange", route);
route();
