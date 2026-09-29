/* DeductBook admin page: account and household overview for operators listed in public.admins. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = iso => { if (!iso) return "never"; const d = new Date(iso); const days = (Date.now() - d.getTime()) / 864e5; return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) + (days < 1 ? " (today)" : days < 2 ? " (yesterday)" : " (" + Math.floor(days) + " days ago)"); };
  const mb = b => (Number(b || 0) / 1048576).toFixed(1) + " MB";
  const Cloud = window.Cloud;
  if (!Cloud || !Cloud.configured) { $("gate").innerHTML = "<p>Cloud mode is not configured on this site.</p>"; return; }

  async function load() {
    const user = Cloud.user();
    $("who").textContent = user ? user.email : "";
    $("signOut").hidden = !user;
    $("gate").hidden = !!user;
    if (!user) return;
    let users, households;
    try { [users, households] = await Promise.all([Cloud.rpc("admin_users"), Cloud.rpc("admin_households")]); }
    catch (e) { $("gate").hidden = false; $("gate").innerHTML = "<p>Couldn't load the overview: " + esc(e.message) + "</p>"; return; }
    if (!users || !users.length) { $("gate").hidden = false; $("gate").innerHTML = "<p>This account is not an administrator, so nothing is shown. Add it to <code>public.admins</code> in the database to grant access.</p>"; return; }
    const active7 = users.filter(u => u.last_sign_in_at && Date.now() - new Date(u.last_sign_in_at).getTime() < 7 * 864e5).length;
    $("usersSummary").textContent = users.length + " account" + (users.length === 1 ? "" : "s") + " · " + active7 + " signed in within 7 days";
    $("users").innerHTML = "<table><thead><tr><th>Email</th><th>Signed up</th><th>Last sign-in</th><th class=\"num\">Visits, 30 days</th><th class=\"num\">Households</th><th class=\"num\">Entries</th><th class=\"num\">Receipts</th></tr></thead><tbody>" +
      users.map(u => { const many = Number(u.sign_ins_30d) > 60; return "<tr><td>" + esc(u.email) + "</td><td>" + when(u.created_at) + "</td><td>" + when(u.last_sign_in_at) + "</td><td class=\"num" + (many ? " stale" : "") + "\">" + esc(u.sign_ins_30d) + (many ? " ⚠" : "") + "</td><td class=\"num\">" + esc(u.households) + "</td><td class=\"num\">" + esc(u.entries) + "</td><td class=\"num\">" + esc(u.receipts) + "</td></tr>"; }).join("") + "</tbody></table>";
    $("households").innerHTML = "<table><thead><tr><th>Household</th><th>Plan</th><th>Created</th><th>Members</th><th class=\"num\">Entries</th><th class=\"num\">Receipts</th><th class=\"num\">Storage</th><th>Last change</th></tr></thead><tbody>" +
      (households || []).map(h => "<tr><td>" + esc(h.name) + "</td><td>" + esc(h.plan_status) + "</td><td>" + when(h.created_at) + "</td><td>" + esc(h.members || "—") + "</td><td class=\"num\">" + esc(h.entries) + "</td><td class=\"num\">" + esc(h.receipts) + "</td><td class=\"num\">" + mb(h.storage_bytes) + "</td><td>" + when(h.last_change) + "</td></tr>").join("") + "</tbody></table>";
    $("usersCard").hidden = false; $("hhCard").hidden = false;
  }

  $("adGo").addEventListener("click", async () => {
    const email = $("adEmail").value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("adMsg").textContent = "Enter a valid email address."; return; }
    $("adGo").disabled = true;
    try {
      await Cloud.signInWithEmail(email);
      $("adMsg").innerHTML = 'Check your email for the sign-in code. <input id="adCode" type="text" inputmode="numeric" maxlength="10" placeholder="code" style="margin:0 6px;width:7em"> <button class="btn sm primary" id="adVerify" type="button">Sign in</button>';
      $("adVerify").addEventListener("click", async () => { try { await Cloud.verifyEmailCode(email, $("adCode").value); } catch (e) { alert(e.message); } });
    }
    catch (e) { $("adMsg").textContent = e.message; $("adGo").disabled = false; }
  });
  $("signOut").addEventListener("click", () => Cloud.signOut());
  $("refresh").addEventListener("click", load);
  Cloud.init({ onAuth: load }).then(load);
})();
