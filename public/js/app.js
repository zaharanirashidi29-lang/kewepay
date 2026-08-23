const app=document.getElementById("app");
const S={token:localStorage.getItem("kp_token")||"",user:null,page:"overview",flash:""};
async function api(path,opts={}){const headers={"Content-Type":"application/json",...(opts.headers||{})};if(S.token)headers.Authorization=`Bearer ${S.token}`;const res=await fetch(path,{...opts,headers});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||"Request failed");return data}
const money=n=>Number(n||0).toLocaleString()+" TZS";
const badge=st=>{const s=String(st||"").toUpperCase();return `<span class="badge ${s==="COMPLETED"?"ok":s==="FAILED"?"bad":"warn"}">${s||"PROCESSING"}</span>`};
function route(){const h=(location.hash||"#/").replace(/^#/,"")||"/";if(h.startsWith("/login"))return renderAuth("login");if(h.startsWith("/register"))return renderAuth("register");if(h.startsWith("/docs"))return renderDocsPublic();if(h.startsWith("/app"))return renderApp();return renderLanding()}

function renderLanding(){
  app.innerHTML=`
  <div class="lp">
    <nav class="lp-nav">
      <a class="lp-brand" href="#/"><img src="/assets/logo.png?v=3" alt=""/>KewePay</a>
      <div class="lp-actions">
        <a class="btn btn-ghost btn-sm" href="#/docs">API Docs</a>
        <a class="btn btn-ghost btn-sm" href="#/login">Log in</a>
        <a class="btn btn-brand btn-sm" href="#/register">Get started</a>
      </div>
    </nav>
    <section class="hero">
      <div>
        <div class="eyebrow">Tanzania payment gateway</div>
        <h1>Collect, withdraw & <span>get paid</span></h1>
        <p>KewePay is your business payment platform. Accept M-Pesa, Airtel, Mixx & Halotel — then withdraw to mobile money. Collect mobile money and manage your wallet in one place.</p>
        <div class="cta-row">
          <a class="btn btn-brand" href="#/register">Open account</a>
          <a class="btn btn-ghost" href="#/docs">Read API docs</a>
        </div>
        <div class="trust">
          <span class="pill">Deposit</span><span class="pill">Withdraw (min 100,000 TZS)</span><span class="pill">API keys</span><span class="pill">Webhooks</span>
        </div>
      </div>
      <div class="hero-visual">
        <img class="pc" src="/assets/pc.png?v=3" alt="KewePay dashboard"/>
        <img class="phone" src="/assets/phone.png?v=3" alt="KewePay mobile"/>
      </div>
    </section>
    <section class="section">
      <h2>Everything you need to get paid</h2>
      <p class="lead">Same experience style as modern TZ gateways — built for merchants, settled through Snippe.</p>
      <div class="grid3">
        <div class="feature"><div class="icon">↓</div><h3>Deposit / Collect</h3><p>Push USSD to any network and credit your KewePay wallet when the customer pays.</p></div>
        <div class="feature"><div class="icon">↑</div><h3>Withdraw</h3><p>Cash out to mobile money. Minimum withdrawal is 100,000 TZS.</p></div>
        <div class="feature"><div class="icon">API</div><h3>Developer API</h3><p>Create live keys, send collections from your app, and receive completion webhooks.</p></div>
      </div>
    </section>
    <div class="band">
      <div>
        <h2 style="margin:0 0 .4rem">Start collecting today</h2>
        <p class="muted" style="margin:0">Create your merchant account and get an API key in minutes.</p>
      </div>
      <a class="btn btn-brand" href="#/register">Create free account</a>
    </div>
    <footer class="footer"><span>© KewePay</span><span>Tanzania payment gateway</span></footer>
  </div>`}

function renderAuth(mode){
  const login=mode==="login";
  app.innerHTML=`
  <div class="auth">
    <div class="auth-main">
      <a class="lp-brand" href="#/"><img src="/assets/logo.png" alt="" style="width:28px;height:28px"/>KewePay</a>
      <form class="auth-card" id="f">
        <h1>${login?"Karibu tena":"Create account"}</h1>
        <p class="sub">${login?"Log in to manage deposits, withdrawals and API keys.":"Open your KewePay merchant account."}</p>
        ${login?"":`<div class="field"><label>Full name</label><input name="name" required/></div><div class="field"><label>Business name</label><input name="businessName" required/></div>`}
        <div class="field"><label>Email</label><input name="email" type="email" required/></div>
        <div class="field"><label>Password</label><input name="password" type="password" required minlength="8"/></div>
        <button class="btn btn-brand btn-block" type="submit">${login?"Log in":"Register"}</button>
        <div id="msg"></div>
        <p class="muted" style="margin-top:1rem">${login?`No account? <a href="#/register" style="color:var(--brand)">Register</a>`:`Have an account? <a href="#/login" style="color:var(--brand)">Log in</a>`}</p>
      </form>
    </div>
    <div class="auth-side">
      <h2>Buy, sell & get paid in Tanzania</h2>
      <p class="muted">Collect mobile money, track wallet balance, and withdraw from one dashboard.</p>
      <img src="/assets/pc.png?v=3" alt="KewePay" style="border-radius:18px;border:1px solid var(--line);margin-top:1.5rem"/>
    </div>
  </div>`;
  document.getElementById("f").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const msg=document.getElementById("msg");
    try{const body=login?{email:fd.get("email"),password:fd.get("password")}:{name:fd.get("name"),businessName:fd.get("businessName"),email:fd.get("email"),password:fd.get("password")};
      const data=await api(login?"/auth/login":"/auth/register",{method:"POST",body:JSON.stringify(body)});
      S.token=data.token;S.user=data.user;localStorage.setItem("kp_token",data.token);location.hash="#/app";
    }catch(err){msg.className="msg err";msg.textContent=err.message}}
}

async function renderApp(){
  if(!S.token){location.hash="#/login";return}
  app.innerHTML=`<div class="app"><aside class="sidebar" id="sb"></aside><div class="main"><div class="topbar" id="tb"></div><div class="content" id="ct">Loading…</div></div></div><div class="backdrop hidden" id="bd"></div>`;
  try{S.user=(await api("/auth/me")).user}catch{S.token="";localStorage.removeItem("kp_token");location.hash="#/login";return}
  paintShell();await paintPage();
}
function paintShell(){
  document.getElementById("sb").innerHTML=`
    <div class="side-brand"><img src="/assets/logo.png" alt=""/>KewePay</div>
    ${[["overview","Overview"],["deposit","Deposit"],["withdraw","Withdraw"],["payments","Payments"],["keys","API Keys"],["docs","API Docs"]].map(([id,l])=>`<button class="nav-item ${S.page===id?"active":""}" data-page="${id}">${l}</button>`).join("")}
    <div style="flex:1"></div><button class="nav-item" id="logout">Log out</button>`;
  document.getElementById("tb").innerHTML=`<div style="display:flex;gap:.6rem;align-items:center"><button class="menu-btn" id="menu">Menu</button><div><strong>${S.user.businessName||S.user.name}</strong><div class="muted" style="font-size:.8rem">${S.user.email}</div></div></div><span class="badge ok">${S.user.role}</span>`;
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=async()=>{S.page=b.dataset.page;paintShell();await paintPage()});
  document.getElementById("logout").onclick=()=>{S.token="";localStorage.removeItem("kp_token");location.hash="#/"};
  document.getElementById("menu").onclick=()=>{document.getElementById("sb").classList.add("open");document.getElementById("bd").classList.remove("hidden")};
  document.getElementById("bd").onclick=()=>{document.getElementById("sb").classList.remove("open");document.getElementById("bd").classList.add("hidden")};
}
async function paintPage(){const ct=document.getElementById("ct");if(S.page==="overview")return pageOverview(ct);if(S.page==="deposit")return pageDeposit(ct);if(S.page==="withdraw")return pageWithdraw(ct);if(S.page==="payments")return pagePayments(ct);if(S.page==="keys")return pageKeys(ct);if(S.page==="docs")return pageDocs(ct)}

async function pageOverview(ct){
  ct.innerHTML="Loading…";
  const [sum,bal]=await Promise.all([api("/dashboard/summary"),api("/wallet/balance")]);
  ct.innerHTML=`<h1 class="h1">Overview</h1><p class="muted">Wallet, deposits and withdrawals.</p>
  ${S.flash?`<div class="msg ok">${S.flash}</div>`:""}
  <div class="stats">
    <div class="card stat"><div class="lbl">Wallet</div><div class="val">${money(bal.balance)}</div></div>
    <div class="card stat"><div class="lbl">Volume</div><div class="val">${money(sum.summary.volume)}</div></div>
    <div class="card stat"><div class="lbl">Completed</div><div class="val">${sum.summary.completed}</div></div>
    <div class="card stat"><div class="lbl">Processing</div><div class="val">${sum.summary.processing}</div></div>
  </div>
  <div class="toolbar">
    <button class="btn btn-brand btn-sm" id="goDep">Deposit</button>
    <button class="btn btn-ghost btn-sm" id="goWd">Withdraw</button>
  </div>
  <p class="muted">Min withdraw: <strong>${money(bal.min_withdraw)}</strong></p>`;
  S.flash="";document.getElementById("goDep").onclick=async()=>{S.page="deposit";paintShell();await paintPage()};
  document.getElementById("goWd").onclick=async()=>{S.page="withdraw";paintShell();await paintPage()};
}
async function pageDeposit(ct){
  ct.innerHTML=`<h1 class="h1">Deposit</h1><p class="muted">Send USSD push. Status follows Snippe live (pending → completed/failed).</p>
  <div class="grid2"><form class="card" id="dep">
    <div class="field"><label>Phone</label><input name="phone" placeholder="07XXXXXXXX" required/></div>
    <div class="field"><label>Amount</label><input name="amount" type="number" min="500" value="10000" required/></div>
    <div class="field"><label>First name</label><input name="firstname" value="Customer"/></div>
    <div class="field"><label>Last name</label><input name="lastname" value="User"/></div>
    <button class="btn btn-brand btn-block" type="submit">Send USSD</button><div id="msg"></div>
  </form><div class="card"><h3>How it works</h3><p class="muted">Customer confirms on phone → Snippe settles → KewePay status updates to the same Snippe result.</p></div></div>`;
  document.getElementById("dep").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const msg=document.getElementById("msg");
    try{
      const data=await api("/wallet/deposit",{method:"POST",body:JSON.stringify({phone:fd.get("phone"),amount:Number(fd.get("amount")),customer:{firstname:fd.get("firstname"),lastname:fd.get("lastname")}})});
      const ref=data.data.reference;
      msg.className="msg ok";msg.textContent=`Push sent · ${ref} · waiting for Snippe…`;
      for(let i=0;i<24;i++){
        await new Promise(r=>setTimeout(r,2500));
        const list=await api("/payments?limit=20");
        const row=(list.payments||[]).find(p=>p.reference===ref);
        if(!row) continue;
        const sn=row.snippe_status||"—";
        const st=row.status;
        msg.className=st==="failed"?"msg err":st==="completed"?"msg ok":"msg ok";
        msg.textContent=`${ref} · Kewe: ${st} · Snippe: ${sn}${row.failure_reason?" · "+row.failure_reason:""}`;
        if(st==="completed"||st==="failed") break;
      }
    }catch(err){msg.className="msg err";msg.textContent=err.message}
  }
}
async function pageWithdraw(ct){
  const bal=await api("/wallet/balance");
  ct.innerHTML=`<h1 class="h1">Withdraw</h1><p class="muted">Minimum <strong>${money(bal.min_withdraw)}</strong>. Available ${money(bal.balance)}</p>
  <div class="grid2"><form class="card" id="wd">
    <div class="field"><label>Phone</label><input name="phone" value="${bal.withdraw_phone||""}" required/></div>
    <div class="field"><label>Amount</label><input name="amount" type="number" min="${bal.min_withdraw}" required/></div>
    <div class="field"><label>Name</label><input name="recipientName" value="${S.user.businessName||S.user.name||""}"/></div>
    <button class="btn btn-brand btn-block" type="submit">Withdraw</button><div id="msg"></div>
  </form><div class="card" id="wdlist">Loading…</div></div>`;
  const list=await api("/wallet/withdrawals");
  document.getElementById("wdlist").innerHTML=`<h3>Recent</h3><div class="table-wrap"><table><thead><tr><th>Ref</th><th>Amount</th><th>Status</th></tr></thead><tbody>${(list.withdrawals||[]).map(w=>`<tr><td class="mono">${w.reference}</td><td>${money(w.amount)}</td><td>${badge(w.status)}</td></tr>`).join("")||"<tr><td colspan=3>None</td></tr>"}</tbody></table></div>`;
  document.getElementById("wd").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const msg=document.getElementById("msg");
    try{const data=await api("/wallet/withdraw",{method:"POST",body:JSON.stringify({phone:fd.get("phone"),amount:Number(fd.get("amount")),recipientName:fd.get("recipientName")})});
      msg.className="msg ok";msg.textContent=`${data.data.status} · ${data.data.reference}`;S.flash="Withdrawal submitted";S.page="overview";paintShell();await paintPage()}
    catch(err){msg.className="msg err";msg.textContent=err.message}}
}
async function pagePayments(ct){
  const data=await api("/payments?limit=50");
  ct.innerHTML=`<h1 class="h1">Payments</h1><div class="table-wrap"><table><thead><tr><th>Ref</th><th>Phone</th><th>Amount</th><th>Kewe</th><th>Snippe</th><th>Reason</th><th>Created</th></tr></thead>
  <tbody>${(data.payments||[]).map(p=>`<tr><td class="mono">${p.reference}</td><td>${p.phone}</td><td>${money(p.amount)}</td><td>${badge(p.status)}</td><td class="mono">${p.snippe_status||"—"}</td><td>${p.failure_reason||"—"}</td><td>${new Date(p.created_at||p.createdAt).toLocaleString()}</td></tr>`).join("")||"<tr><td colspan=7>None</td></tr>"}</tbody></table></div>`}
async function pageKeys(ct){
  const data=await api("/keys");
  ct.innerHTML=`<h1 class="h1">API Keys</h1><div class="toolbar"><button class="btn btn-brand btn-sm" id="newk">Create key</button></div><div id="box"></div>
  <div class="field"><label>Webhook URL</label><input id="hook" value="${S.user.webhookUrl||""}"/></div>
  <button class="btn btn-ghost btn-sm" id="saveh">Save webhook</button>
  <div class="table-wrap" style="margin-top:1rem"><table><thead><tr><th>Name</th><th>Prefix</th><th>Last used</th><th></th></tr></thead>
  <tbody>${(data.keys||[]).map(k=>`<tr><td>${k.name}</td><td class="mono">${k.prefix}…</td><td>${k.lastUsedAt?new Date(k.lastUsedAt).toLocaleString():"—"}</td>
  <td><button class="btn btn-ghost btn-sm" data-rev="${k.id}">Revoke</button></td></tr>`).join("")||"<tr><td colspan=4>None</td></tr>"}</tbody></table></div>`;
  document.getElementById("newk").onclick=async()=>{const r=await api("/keys",{method:"POST",body:JSON.stringify({name:"Live"})});document.getElementById("box").innerHTML=`<div class="reveal"><strong>Copy now</strong><br/>${r.key.secret}</div>`};
  document.getElementById("saveh").onclick=async()=>{await api("/auth/me",{method:"PATCH",body:JSON.stringify({webhookUrl:document.getElementById("hook").value})});S.flash="Saved";await renderApp()};
  document.querySelectorAll("[data-rev]").forEach(b=>b.onclick=async()=>{if(!confirm("Revoke?"))return;await api(`/keys/${b.dataset.rev}`,{method:"DELETE"});await pageKeys(ct)});
}
function docsHtml(){return `<div class="docs"><h1 class="h1">API Documentation</h1>
<p class="muted">KewePay merchant API — collections & withdrawals via Snippe.</p>
<h2>Auth</h2><pre class="code">Authorization: Bearer kp_live_xxx</pre>
<h2>Collect / deposit</h2><pre class="code">POST /v1/payments
{"phone":"2557...","amount":10000,"customer":{"firstname":"Asha","lastname":"Juma","email":"a@x.com"}}</pre>
<h2>Get payment</h2><pre class="code">GET /v1/payments/{reference}</pre>
<h2>Wallet deposit</h2><pre class="code">POST /wallet/deposit
{"phone":"07...","amount":5000}</pre>
<h2>Withdraw (min 100,000 TZS)</h2><pre class="code">POST /wallet/withdraw
{"phone":"07...","amount":100000,"recipientName":"Shop"}</pre>
<h2>Balance</h2><pre class="code">GET /wallet/balance</pre>
<h2>Webhook</h2><pre class="code">{"event":"payment.completed","data":{"reference":"KPD...","status":"completed","amount":10000}}</pre>
</div>`}
function pageDocs(ct){ct.innerHTML=docsHtml()}
function renderDocsPublic(){app.innerHTML=`<nav class="lp-nav"><a class="lp-brand" href="#/"><img src="/assets/logo.png" alt=""/>KewePay</a><a class="btn btn-brand btn-sm" href="#/login">Log in</a></nav><div class="content">${docsHtml()}</div>`}
window.addEventListener("hashchange",route);route();
