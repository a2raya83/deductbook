// Giving Ledger — application
(function () {
  const $ = id => document.getElementById(id);
  const { evaluate, yearSummary, isCountable, money, num, isBlank } = window.Rules;
  const KINDS = window.KINDS, EXP = window.EXPENSE_CATEGORIES, RULES = window.RULES;
  const CFG = window.SITE_CONFIG || {};
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = d => { if (!d) return "—"; const [y, m, dd] = d.split("-"); return `${m}/${dd}/${y}`; };
  const yearOf = e => (e.date || "").slice(0, 4);
  const thisYear = String(new Date().getFullYear());

  // Sample mode is entered via #sample and left by opening app.html without it (a plain link from the banner).
  const SAMPLE_MODE = location.hash === "#sample";
  try { if (!SAMPLE_MODE) sessionStorage.removeItem("gl_sample_mode"); } catch (e) {}
  if (SAMPLE_MODE) { window.Store.useNamespace("sample"); try { sessionStorage.setItem("gl_sample_mode", "1"); } catch (e) {} }
  let cloudMode = false;                 // true when signed in and a household ledger is open
  const Cloud = (!SAMPLE_MODE && window.Cloud) || { configured: false };
  const Files = () => cloudMode ? Cloud.files : window.Store;   // receipt backend: household storage or this browser
  const readOnly = () => cloudMode && !Cloud.canWrite();
  let state = window.Store.loadState();
  let receiptsCache = [];        // all receipt records (blobs in device mode, signed urls in cloud mode)
  let objectUrls = [];
  let editingId = null;
  let editingBase = null;        // cloud mode: server version the open draft was loaded from
  let originalReceiptIds = [];   // receipts the entry had when editing began
  let pendingReceiptIds = [];    // receipts currently shown in the form
  let stagedRemovals = [];       // original receipts the user removed; deleted only on Save
  let currentKind = "cash";
  let currentView = "ledger";
  let year = state.settings.year || thisYear;

  /* ---------- helpers ---------- */
  function toast(msg, long) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), long ? 5000 : 2400); }
  // Returns true when the state was actually written. Every caller that reports success must check it.
  function persist() {
    state.settings.year = year;
    if (cloudMode) {
      if (readOnly()) { toast("This ledger is read-only for you.", true); return false; }
      try { localStorage.setItem("gl_year", year); } catch (e) {}
      Cloud.sync(state.entries);            // optimistic: the status pill reports saving / saved / failed
      return true;
    }
    const ok = window.Store.saveState(state);
    if (!ok) toast("Couldn't save: browser storage is blocked or full. Your change is NOT stored — export a backup and free up space.", true);
    return ok;
  }
  function freeUrls() { objectUrls.forEach(u => URL.revokeObjectURL(u)); objectUrls = []; }
  function urlFor(rec) { if (rec.url) return rec.url; const u = URL.createObjectURL(rec.blob); objectUrls.push(u); return u; }
  // Short label for a non-image attachment: PDF, DOC, XLS, CSV, TXT, EML or FILE.
  function fileLabel(rec) { const n = (rec.name || "").toLowerCase(); const t = rec.type || ""; if (t === "application/pdf" || n.endsWith(".pdf")) return "PDF"; if (/\.docx?$/.test(n) || /msword|wordprocessingml/.test(t)) return "DOC"; if (/\.xlsx?$/.test(n) || /spreadsheetml|ms-excel/.test(t)) return "XLS"; if (n.endsWith(".csv")) return "CSV"; if (n.endsWith(".txt") || t === "text/plain") return "TXT"; if (n.endsWith(".eml")) return "EML"; return "FILE"; }
  // Open an attachment: images in the viewer; other files in a new tab (or as a download that keeps the original file
  // name), fetched as a blob in cloud mode so the address bar never shows the storage host or an opaque object id.
  async function openReceipt(r) {
    if (r.type.startsWith("image/")) { modal(`<img src="${urlFor(r)}" alt="${esc(r.name)}"><div class="actions"><button class="btn" data-close type="button">Close</button></div>`, { wide: true }); return; }
    // PDFs open in our own viewer page (real file name in the tab, deductbook.com in the address bar). The tab is
    // opened synchronously, inside the click, so browsers don't treat it as a pop-up once the download finishes.
    const isPdf = fileLabel(r) === "PDF";
    const w = isPdf ? window.open("about:blank", "_blank") : null;
    if (isPdf && !w) { toast("Pop-up blocked. Allow pop-ups for this site to open files.", true); return; }
    let blob = r.blob;
    if (!blob) { try { blob = await Files().fetchBlob(r); } catch (e) { if (w) w.close(); toast("Couldn't open " + r.name + ": " + e.message, true); return; } }
    const u = URL.createObjectURL(blob); objectUrls.push(u);
    if (isPdf) { w.location = "viewer.html#" + new URLSearchParams({ name: r.name || "Attachment", src: u, type: "application/pdf" }).toString(); return; }
    const link = document.createElement("a"); link.href = u; link.download = r.name || "attachment"; document.body.appendChild(link); link.click(); link.remove();
  }
  async function refreshReceipts() { try { receiptsCache = await Files().listReceipts(); } catch (e) { receiptsCache = []; toast(cloudMode ? "Couldn't load receipts from the household ledger: " + e.message : "Receipt storage is unavailable in this browser; files can't be shown.", true); } }
  const receiptsFor = e => (e.receiptIds || []).map(id => receiptsCache.find(r => r.id === id)).filter(Boolean);
  // Delete a receipt file only if no entry still references it (a conflict copy and its original share files).
  async function releaseReceipt(id) {
    if (state.entries.some(e => (e.receiptIds || []).includes(id))) return false;
    await Files().deleteReceipt(id).catch(() => {}); return true;
  }
  const ev = e => evaluate(e, { files: receiptsFor(e).length });
  const summarize = entries => yearSummary(entries, { filesFor: e => receiptsFor(e).length });
  function inYear(e) { return year === "all" || yearOf(e) === year; }
  const visibleEntries = () => state.entries.filter(inYear);
  // Entries that count: everything visible except unresolved import conflict copies.
  const countableEntries = () => visibleEntries().filter(isCountable);
  const conflictNote = () => { const n = visibleEntries().filter(e => !isCountable(e)).length; return n ? ` ${n} unresolved import conflict${n > 1 ? "s" : ""} left out.` : ""; };
  function copyText(text) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); return ok;
    });
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type }); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function modal(html, opts = {}) {
    const root = $("modalRoot");
    root.innerHTML = `<div class="modal-back" id="modalBack"><div class="modal ${opts.wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div></div>`;
    const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); };
    const onKey = ev => { if (ev.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    $("modalBack").addEventListener("click", ev => { if (ev.target.id === "modalBack") close(); });
    root.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
    return close;
  }
  const describe = e => {
    if (e.kind === "noncash") { const items = e.items || []; return items.length ? items.map(i => `${num(i.qty || 1) > 1 ? i.qty + "× " : ""}${i.desc || i.category || "item"}`).join(", ") : (e.notes || "Goods"); }
    if (e.kind === "stock") return e.stock && e.stock.ticker ? e.stock.ticker : "Securities";
    if (e.kind === "mileage") return `${num(e.miles)} mi${e.purpose ? " · " + e.purpose : ""}`;
    if (e.kind === "expense") return `${(EXP[e.expenseCategory] || EXP.other).label}${e.expenseDesc ? " · " + e.expenseDesc : ""}`;
    return e.method ? ({ card: "Card", check: "Check" + (e.checkNo ? " #" + e.checkNo : ""), online: "Online", bank: "Bank transfer", payroll: "Payroll", text: "Text gift", cash: "Cash", other: "" }[e.method] || "") : "";
  };
  // Documentation status, named after what is actually missing so the badge is an instruction.
  const docsLabel = r => { const f = r.flags.find(x => x.level === "docs") || {}; const t = (f.text || "").toLowerCase(); return /acknowledgment/.test(t) ? "Acknowledgment needed" : /receipt|record on file|bank record/.test(t) ? "Receipt needed" : /basis/.test(t) ? "Cost basis needed" : /organization/.test(t) ? "Organization missing" : /appraisal/.test(t) ? "Appraisal needed" : /1098-C/.test(t) ? "Form 1098-C needed" : "Documentation needed"; };
  const statusBadge = r => r.status === "stop" ? `<span class="badge stop">Not eligible</span>` : r.status === "docs" ? `<span class="badge docs">${docsLabel(r)}</span>` : `<span class="badge ok">Records OK</span>`;
  const yearLabel = () => year === "all" ? "all years" : year;

  /* ---------- year picker ---------- */
  function renderYearPicker() {
    const sel = $("yearFilter");
    const years = new Set(state.entries.map(yearOf).filter(Boolean)); years.add(thisYear);
    const list = [...years].sort().reverse();
    sel.innerHTML = list.map(y => `<option value="${y}">${y}</option>`).join("") + `<option value="all">All years</option>`;
    sel.value = list.includes(year) || year === "all" ? year : thisYear; year = sel.value;
  }
  $("yearFilter").addEventListener("change", () => { year = $("yearFilter").value; persist(); renderAll(); });

  /* ---------- views / tabs ---------- */
  function showView(v) {
    currentView = v;
    document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.view === v)));
    ["overview", "ledger", "guide", "receipts", "summary", "rules"].forEach(id => { $("view-" + id).hidden = id !== v; });
    if (v === "ledger") { mountForm("formMount", ["cash", "noncash", "stock", "mileage", "expense"]); syncFormSlot(); }
    if (v === "overview") renderOverview();
    if (!SAMPLE_MODE && location.hash !== "#" + v) history.replaceState(null, "", "#" + v);   // the sample ledger keeps #sample so a reload stays in it
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => showView(t.dataset.view)));
  window.addEventListener("hashchange", () => {
    // Entering or leaving the sample ledger switches storage, so it needs a real reload.
    if (location.hash === "#sample" || (SAMPLE_MODE && location.hash !== "#sample" && !location.hash.startsWith("#invite"))) { location.reload(); return; }
    const v = location.hash.slice(1); if ($("view-" + v)) { showView(v); return; }
    // An invitation link opened in a tab that already has the app loaded is just a hash change:
    // handle it the same way a fresh load would.
    const im = location.hash.match(/invite=([a-f0-9]+)/);
    if (im && Cloud.configured) { try { sessionStorage.setItem("gl_invite", im[1]); } catch (e) {} if (Cloud.user()) afterSignIn(Cloud.user()); else accountModal(); }
  });

  /* ---------- entry form ---------- */
  const form = $("entryForm");
  let allowedKinds = ["cash", "noncash", "stock", "mileage", "expense"];
  // The donation list leads; the form opens through Add donation or Edit. While the ledger is empty it stays open.
  let formOpen = false;
  let firstUse = false;   // a brand-new, empty ledger: the first donation form leads, the dashboard follows the first save
  function maybeFirstUse() {
    const explicit = location.hash && location.hash !== "#overview" && location.hash !== "#";
    if (SAMPLE_MODE || explicit || state.entries.length || (Cloud.configured && Cloud.user())) return;
    firstUse = true; showView("ledger"); openForm(false);
    $("formTitle").textContent = "Add your first donation"; $("firstDemo").hidden = false;
  }
  // After the first save on a device without an account: one clear choice, once.
  function offerCloudSave() {
    if (!Cloud.configured || Cloud.user() || state.settings.saveOfferShown) return;
    state.settings.saveOfferShown = true; persist();
    const close = modal(`<h3>Saved in this browser</h3><p class="small">Your first donation is stored on this device. Sign in to keep it across devices and share the ledger with your household; the entry comes with you.</p>
      <div class="actions"><button class="btn primary" id="offerSignIn" type="button">Save across devices</button><button class="btn" data-close type="button">Continue on this device</button></div>`);
    $("offerSignIn").addEventListener("click", () => { close(); accountModal(); });
  }
  const formForced = () => !state.entries.some(isCountable);
  function syncFormSlot() { $("ledgerFormSlot").hidden = !(formOpen || formForced()); $("ledgerAdd").hidden = formOpen || formForced(); }
  function openForm(scroll = true) { formOpen = true; syncFormSlot(); if (scroll) setTimeout(() => $("ledgerFormSlot").scrollIntoView({ behavior: "smooth", block: "start" }), 30); }
  function closeForm() { formOpen = false; syncFormSlot(); }
  function mountForm(slotId, kinds) {
    allowedKinds = kinds;
    if (form.parentElement !== $(slotId)) $(slotId).appendChild(form);
    if (!kinds.includes(currentKind) && !editingId) setKind(kinds[0]);
    renderKindPicker();
  }
  function renderKindPicker() {
    $("kindPicker").innerHTML = allowedKinds.map(k => `<button type="button" data-kind="${k}" aria-pressed="${k === currentKind}">${KINDS[k].label}</button>`).join("");
    $("kindPicker").querySelectorAll("button").forEach(b => b.addEventListener("click", () => setKind(b.dataset.kind)));
  }
  function setKind(k) {
    currentKind = k;
    form.querySelectorAll("[data-kinds]").forEach(el => { el.hidden = !el.dataset.kinds.split(" ").includes(k); });
    if (k === "noncash" && !$("itemRows").children.length) addItemRow();
    renderKindPicker(); updateExpenseVisibility(); updateInsight();
  }
  function updateExpenseVisibility() {
    const cat = $("f_expenseCategory").value;
    form.querySelectorAll("[data-cats]").forEach(el => { if (currentKind === "expense") el.hidden = !el.dataset.cats.split(" ").includes(cat); });
    $("expenseHint").textContent = (EXP[cat] || EXP.other).note;
  }
  $("f_expenseCategory").innerHTML = Object.entries(EXP).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("f_expenseCategory").addEventListener("change", () => { updateExpenseVisibility(); updateInsight(); });
  $("f_howValued").innerHTML = window.FMV_METHODS.map(m => `<option>${esc(m)}</option>`).join("");

  // Non-cash item rows. A row created from the value guide remembers its low/high range so the
  // condition picker can move the value: excellent → high, good → midpoint, fair → low.
  const catOptions = () => `<option value="">Category</option>` + window.FMV_GUIDE.map(g => `<option>${esc(g.cat)}</option>`).join("") + (window.FMV_EXTRA_CATEGORIES || []).map(c => `<option>${esc(c)}</option>`).join("") + `<option>Other</option>`;
  const condOptions = sel => window.FMV_CONDITIONS.map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${l.split(" — ")[0]}</option>`).join("");
  const valueForCondition = (cond, lo, hi) => cond === "excellent" ? hi : cond === "fair" ? lo : (lo + hi) / 2;
  // "Salvation Army guide, checked 2026-09-28" for exports and the deduction check
  const sourceLabel = key => { const s = key && window.FMV_SOURCES && window.FMV_SOURCES[key]; return s ? `${s.short}${key === "EST" ? "" : " guide"}, checked ${s.checked}` : ""; };
  function addItemRow(it = {}) {
    const row = document.createElement("div"); row.className = "item-row";
    if (!isBlank(it.lo) && !isBlank(it.hi)) { row.dataset.lo = it.lo; row.dataset.hi = it.hi; if (it.source) row.dataset.source = it.source; }
    row.innerHTML = `<label class="cell desc-cell"><span>Description</span><input class="desc" type="text" placeholder="Description (e.g. men's wool overcoat)" value="${esc(it.desc)}"></label>
      <label class="cell"><span>Category</span><select class="cat">${catOptions()}</select></label>
      <label class="cell"><span>Condition</span><select class="cond">${condOptions(it.condition || "good")}</select></label>
      <label class="cell"><span>Qty</span><input class="qty" type="number" min="1" step="1" value="${Math.max(1, Math.round(num(it.qty) || 1))}"></label>
      <label class="cell"><span>Value each</span><input class="unit" type="number" min="0" step="0.01" placeholder="0.00" value="${it.unitValue != null && it.unitValue !== "" ? esc(it.unitValue) : ""}"></label>
      <span class="total num" aria-label="Line total">$0.00</span>
      <button type="button" class="icon-btn" title="Remove item" aria-label="Remove item">×</button>`;
    row.querySelector(".cat").value = it.category || "";
    row.querySelector(".icon-btn").addEventListener("click", () => { row.remove(); recalcItems(); updateInsight(); });
    row.querySelector(".cond").addEventListener("change", () => {
      if (row.dataset.lo != null) { row.querySelector(".unit").value = valueForCondition(row.querySelector(".cond").value, num(row.dataset.lo), num(row.dataset.hi)).toFixed(2); recalcItems(); updateInsight(); }
    });
    $("itemRows").appendChild(row); recalcItems();
    return row;
  }
  function readItems() {
    return [...$("itemRows").querySelectorAll(".item-row")].map(r => ({
      desc: r.querySelector(".desc").value.trim(), category: r.querySelector(".cat").value, condition: r.querySelector(".cond").value,
      qty: Math.max(1, Math.round(num(r.querySelector(".qty").value) || 1)), unitValue: num(r.querySelector(".unit").value),
      lo: r.dataset.lo != null ? num(r.dataset.lo) : null, hi: r.dataset.hi != null ? num(r.dataset.hi) : null, source: r.dataset.source || null
    })).filter(i => i.desc || i.unitValue);
  }
  function recalcItems() {
    let t = 0;
    $("itemRows").querySelectorAll(".item-row").forEach(r => { const v = (num(r.querySelector(".qty").value) || 1) * num(r.querySelector(".unit").value); r.querySelector(".total").textContent = money(v); t += v; });
    $("itemsTotal").textContent = money(t);
  }
  $("itemRows").addEventListener("input", () => { recalcItems(); updateInsight(); });
  $("addItemBtn").addEventListener("click", () => { addItemRow().querySelector(".desc").focus(); });
  $("openGuideBtn").addEventListener("click", () => showView("guide"));

  // Collect the form into an entry object
  function readForm() {
    const e = {
      id: editingId || window.Store.uid(), kind: currentKind, date: $("f_date").value, donor: $("f_donor").value.trim(), org: $("f_org").value.trim(),
      notes: $("f_notes").value.trim(), ackReceived: $("f_ack").checked, hasReceiptDecl: $("f_hasReceipt").checked, receiptIds: pendingReceiptIds.slice()
    };
    const prior = editingId ? state.entries.find(x => x.id === editingId) : null;
    if (prior && prior.conflictOf) e.conflictOf = prior.conflictOf;   // only Keep this / Keep mine resolves a conflict
    if (currentKind === "cash") Object.assign(e, { amount: num($("f_amount_cash").value), method: $("f_method").value, checkNo: $("f_checkNo").value.trim(), benefit: num($("f_benefit").value), bankRecord: $("f_bankRecord").checked });
    if (currentKind === "noncash") Object.assign(e, { items: readItems(), amount: 0, benefit: num($("f_benefit").value), howValued: $("f_howValued").value, acquired: $("f_acquired").value.trim(), vehicle: $("f_vehicle").checked, appraised: $("f_appraised").checked });
    if (currentKind === "stock") Object.assign(e, { amount: num($("f_amount_stock").value), stock: { ticker: $("f_ticker").value.trim(), costBasis: $("f_costBasis").value === "" ? null : num($("f_costBasis").value), longTerm: $("f_longTerm").checked } });
    if (currentKind === "mileage") Object.assign(e, { miles: num($("f_miles").value), parkingTolls: num($("f_parkingTolls").value), route: $("f_route").value.trim(), purpose: $("f_purpose").value.trim(), rate: RULES.MILEAGE_RATE });
    if (currentKind === "expense") Object.assign(e, { amount: num($("f_amount_expense").value), expenseCategory: $("f_expenseCategory").value, expenseDesc: $("f_expenseDesc").value.trim(), reimbursed: $("f_reimbursed").checked, awayOvernight: $("f_awayOvernight").checked, personalPleasure: $("f_personalPleasure").checked, companions: $("f_companions").checked, uniformNoGeneralUse: $("f_uniformNoGeneralUse").checked, delegate: $("f_delegate").checked });
    return e;
  }
  async function fillForm(e) {
    await resetForm(false);
    editingId = e.id; editingBase = cloudMode ? Cloud.baseFor(e.id) : null; setKind(e.kind);
    $("f_date").value = e.date || ""; $("f_donor").value = e.donor || ""; $("f_org").value = e.org || ""; $("f_notes").value = e.notes || ""; $("moreDetails").open = !!(e.notes || e.checkNo); $("f_ack").checked = !!e.ackReceived; $("f_hasReceipt").checked = !!e.hasReceiptDecl;
    originalReceiptIds = (e.receiptIds || []).slice(); pendingReceiptIds = originalReceiptIds.slice(); stagedRemovals = [];
    if (e.kind === "cash") { $("f_amount_cash").value = e.amount || ""; $("f_method").value = e.method || "card"; $("f_checkNo").value = e.checkNo || ""; $("f_benefit").value = e.benefit || ""; $("f_bankRecord").checked = e.bankRecord !== false; }
    if (e.kind === "noncash") { $("itemRows").innerHTML = ""; (e.items || []).forEach(addItemRow); if (!(e.items || []).length) addItemRow(); $("f_benefit").value = e.benefit || ""; $("f_howValued").value = e.howValued || window.FMV_METHODS[0]; $("f_acquired").value = e.acquired || ""; $("f_vehicle").checked = !!e.vehicle; $("f_appraised").checked = !!e.appraised; }
    if (e.kind === "stock") { $("f_amount_stock").value = e.amount || ""; $("f_ticker").value = (e.stock || {}).ticker || ""; $("f_costBasis").value = isBlank((e.stock || {}).costBasis) ? "" : e.stock.costBasis; $("f_longTerm").checked = (e.stock || {}).longTerm !== false; }
    if (e.kind === "mileage") { $("f_miles").value = e.miles || ""; $("f_parkingTolls").value = e.parkingTolls || ""; $("f_route").value = e.route || ""; $("f_purpose").value = e.purpose || ""; }
    if (e.kind === "expense") { $("f_amount_expense").value = e.amount || ""; $("f_expenseCategory").value = e.expenseCategory || "other"; $("f_expenseDesc").value = e.expenseDesc || ""; $("f_reimbursed").checked = !!e.reimbursed; $("f_awayOvernight").checked = !!e.awayOvernight; $("f_personalPleasure").checked = !!e.personalPleasure; $("f_companions").checked = !!e.companions; $("f_uniformNoGeneralUse").checked = !!e.uniformNoGeneralUse; $("f_delegate").checked = !!e.delegate; updateExpenseVisibility(); }
    $("formTitle").textContent = e.conflictOf ? "Edit imported copy (import conflict)" : "Edit donation"; $("cancelEdit").hidden = false; $("saveBtn").textContent = "Save changes"; openForm(false);
    if (e.conflictOf) $("saveHint").textContent = "This is the imported copy of a conflict. It stays uncounted until you choose Keep this or Keep mine in the ledger.";
    renderThumbs(); updateInsight();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // Clearing or cancelling: files uploaded during this form session (and not part of the saved entry)
  // are deleted; staged removals are forgotten so the saved entry keeps its attachments.
  async function resetForm(keepDate = true) {
    const d = $("f_date").value;
    const orphans = pendingReceiptIds.filter(id => !originalReceiptIds.includes(id));
    for (const id of orphans) await releaseReceipt(id);
    if (orphans.length) await refreshReceipts();
    form.reset(); editingId = null; editingBase = null; pendingReceiptIds = []; originalReceiptIds = []; stagedRemovals = [];
    $("f_date").value = keepDate && d ? d : new Date().toISOString().slice(0, 10);
    $("f_bankRecord").checked = true; $("f_longTerm").checked = true;
    $("itemRows").innerHTML = ""; if (currentKind === "noncash") addItemRow();
    $("formTitle").textContent = firstUse ? "Add your first donation" : "Record a donation"; $("cancelEdit").hidden = true; $("saveBtn").textContent = "Save donation"; $("saveHint").textContent = ""; $("moreDetails").open = false;
    recalcItems(); renderThumbs(); updateExpenseVisibility(); updateInsight();
  }
  $("resetBtn").addEventListener("click", () => resetForm());
  $("cancelEdit").addEventListener("click", async () => { await resetForm(); closeForm(); });
  $("ledgerAdd").addEventListener("click", async () => { if (editingId) await resetForm(); openForm(); $("f_org").focus(); });
  form.addEventListener("input", updateInsight);
  form.addEventListener("change", updateInsight);

  function updateInsight() {
    const e = readForm(); const r = evaluate(e, { files: pendingReceiptIds.filter(id => receiptsCache.some(x => x.id === id)).length });
    // The acknowledgment question appears once the gift reaches $250; the rules keep evaluating whatever is stored.
    const ackLabel = $("f_ack").closest("label"); if (ackLabel) ackLabel.hidden = !(r.gross >= RULES.ACK_THRESHOLD || e.ackReceived);
    const blank = !e.org && r.gross === 0 && !num(e.miles) && !(e.items || []).some(it => it.desc);
    const headline = blank ? "Enter the donation details to see an estimate." : r.status === "stop" ? "Not eligible as entered" : r.status === "docs" ? "Eligible — records needed before filing" : "Eligible, records complete";
    if (!blank && currentKind === "noncash") { const srcs = [...new Set((e.items || []).map(it => it.source).filter(Boolean))]; if (srcs.length) r.flags.push({ level: "info", text: "Guide values from: " + srcs.map(sourceLabel).join("; ") + ". Ranges are starting points, not appraisals: choose a value supported by the item's condition and resale evidence." }); }
    const flags = blank ? [{ level: "info", text: currentKind === "mileage" ? "Log the miles and the purpose of the trip. The charitable rate is 14¢ per mile." : "As you fill in the gift, the checker lists the records the IRS expects and any reductions that apply." }] : r.flags.length ? r.flags : [{ level: "info", text: "Nothing further needed." }];
    $("insight").innerHTML = `<div class="eyebrow">Deduction check</div>
      <div class="verdict ${blank ? "" : r.status}">${blank ? "—" : money(r.deductible)}</div>
      <p class="small" style="margin-bottom:10px">${headline}${!blank && r.gross !== r.deductible ? ` · recorded value ${money(r.gross)}` : ""}</p>
      <div class="flags">${flags.map(f => `<div class="flag ${f.level}"><span>${f.text}</span></div>`).join("")}</div>`;
  }

  // Receipts in the form
  async function handleFiles(files) {
    if (!files || !files.length) return;
    $("saveHint").textContent = "Processing files…";
    let stored = 0;
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { toast(`${f.name} is over 10 MB, so it was skipped. Photos are compressed automatically; for a scan, export it at a lower resolution.`, true); continue; }
      try { const rec = await Files().addReceipt(f, editingId); pendingReceiptIds.push(rec.id); stored++; }
      catch (e) { toast(cloudMode ? `Couldn't upload ${f.name}: ${e.message}` : `Couldn't store ${f.name} — receipt storage may be blocked in this browser.`, true); }
    }
    await refreshReceipts(); renderThumbs(); updateInsight(); $("saveHint").textContent = "";
    if (stored && !$("f_ack").checked) $("saveHint").textContent = "Tip: if one of these is the charity's acknowledgment letter, tick the box above.";
    if (stored && !editingId) $("saveHint").textContent += " Files are attached when you save.";
  }
  $("f_files").addEventListener("change", ev => { handleFiles([...ev.target.files]); ev.target.value = ""; });
  const dz = $("dropZone");
  dz.addEventListener("dragover", ev => { ev.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", ev => { ev.preventDefault(); dz.classList.remove("over"); handleFiles([...ev.dataTransfer.files]); });
  function renderThumbs() {
    const recs = pendingReceiptIds.map(id => receiptsCache.find(r => r.id === id) || { id, missing: true, name: "file missing", type: "" });
    $("thumbs").innerHTML = recs.map(r => `<div class="thumb" data-id="${esc(r.id)}">${r.missing ? `<span>File missing<br>(not restored)</span>` : r.type.startsWith("image/") ? `<img src="${urlFor(r)}" alt="">` : `<span>${fileLabel(r)}<br>${esc(r.name.slice(0, 18))}</span>`}<button type="button" class="rm" title="Remove" aria-label="Remove receipt">×</button></div>`).join("");
    $("thumbs").querySelectorAll(".rm").forEach(b => b.addEventListener("click", async () => {
      const id = b.parentElement.dataset.id; pendingReceiptIds = pendingReceiptIds.filter(x => x !== id);
      if (originalReceiptIds.includes(id)) { stagedRemovals.push(id); $("saveHint").textContent = "Receipt will be removed when you save. Cancel to keep it."; }
      else { await releaseReceipt(id); await refreshReceipts(); }
      renderThumbs(); updateInsight();
    }));
  }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (readOnly()) { $("saveHint").textContent = "You have read-only access to this ledger."; return; }
    const e = readForm();
    const problems = [];
    const y = Number((e.date || "").slice(0, 4));
    if (!e.date || isNaN(Date.parse(e.date))) problems.push("a valid date");
    else if (y < 2000 || y > Number(thisYear) + 1) problems.push("a date between 2000 and next year");
    if (["cash", "noncash", "stock"].includes(e.kind) && !e.org) problems.push("the organization");
    if (e.kind === "cash" && !(e.amount > 0)) problems.push("an amount greater than zero");
    if (e.kind === "noncash" && !(e.items.length && window.Rules.itemsTotal(e) > 0)) problems.push("at least one item with a value");
    if (e.kind === "noncash" && e.items.some(i => !i.desc)) problems.push("a description for every item");
    if (e.kind === "stock" && !(e.amount > 0)) problems.push("the market value");
    if (e.kind === "mileage" && !(e.miles > 0 || e.parkingTolls > 0)) problems.push("miles or parking/tolls");
    if (e.kind === "expense" && !(e.amount > 0)) problems.push("an amount greater than zero");
    if (num(e.benefit) > window.Rules.grossValue(e) && ["cash", "noncash"].includes(e.kind)) problems.push("a value received that isn't more than the gift itself");
    if (problems.length) { $("saveHint").textContent = "Please add " + problems.join(", ") + "."; return; }

    if (cloudMode && editingId && editingBase && Cloud.changedSince(e.id, editingBase)) {
      // Someone else saved this entry while the form was open. Their version stays; this draft is kept
      // as an import-conflict copy for the user to compare, exactly like a merge conflict.
      const copy = Object.assign({}, e, { id: window.Store.uid(), conflictOf: e.id, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
      state.entries.push(copy);
      if (!persist()) { state.entries.pop(); $("saveHint").textContent = "Not saved. Try again."; return; }
      await Files().attachReceipts(copy.receiptIds, copy.id).catch(() => {});
      originalReceiptIds = []; stagedRemovals = []; pendingReceiptIds = [];
      await refreshReceipts(); await resetForm(); renderAll();
      toast("This entry was changed on another device while you were editing. Your version was kept as an import conflict — choose which to keep in the ledger.", true);
      return;
    }
    const idx = state.entries.findIndex(x => x.id === e.id);
    const now = new Date().toISOString();
    e.updatedAt = now; e.createdAt = idx >= 0 ? state.entries[idx].createdAt : now;
    const previous = idx >= 0 ? state.entries[idx] : null;
    if (idx >= 0) state.entries[idx] = e; else state.entries.push(e);
    if (!persist()) { if (previous) state.entries[idx] = previous; else state.entries.pop(); $("saveHint").textContent = "Not saved. Your entry is still in the form — export a backup or free up storage, then try again."; return; }
    // Saved. Now finalize receipts: attach current ones, delete staged removals.
    await Files().attachReceipts(e.receiptIds, e.id).catch(() => toast("Saved, but receipt links couldn't be updated.", true));
    for (const id of stagedRemovals) await releaseReceipt(id);
    originalReceiptIds = pendingReceiptIds.slice(); stagedRemovals = [];
    await refreshReceipts();
    if (yearOf(e) !== year && year !== "all") year = yearOf(e);
    persist(); const k = e.kind; const wasFirst = firstUse; firstUse = false; await resetForm(); setKind(k); closeForm(); renderAll();
    if (wasFirst) { $("firstDemo").hidden = true; showView("overview"); offerCloudSave(); }
    const r = ev2(e);
    toast(idx >= 0 ? "Entry updated" : r.status === "stop" ? "Saved — not eligible as entered (see status)" : r.status === "docs" ? "Saved — documentation still needed" : "Donation saved");
  });
  const ev2 = e => ev(e);

  /* ---------- tables ---------- */
  function entryRow(e) {
    const r = ev(e); const recs = receiptsFor(e); const lost = (e.receiptIds || []).length - recs.length;
    return `<tr class="entry" data-id="${esc(e.id)}">
      <td class="num" style="white-space:nowrap">${fmtDate(e.date)}</td>
      <td><div class="org">${esc(e.org || (e.kind === "mileage" || e.kind === "expense" ? "(volunteering)" : "—"))}</div><div class="sub">${esc(describe(e))}${e.notes && e.kind !== "noncash" ? " · " + esc(e.notes) : ""}</div></td>
      <td>${esc(e.donor || "—")}</td>
      <td><span class="pill k-${e.kind}">${KINDS[e.kind].short}</span></td>
      <td>${e.conflictOf ? `<span class="badge conflict">Import conflict</span> <span class="small muted">not counted</span> ` : ""}${statusBadge(r)}${recs.length ? ` <span class="small muted">📎${recs.length}</span>` : ""}${lost > 0 ? ` <span class="badge warn" title="Receipt file not found in this browser">${lost} file${lost > 1 ? "s" : ""} missing</span>` : ""}</td>
      <td class="r num"><b>${money(r.deductible)}</b>${r.gross !== r.deductible ? `<div class="sub">recorded ${money(r.gross)}</div>` : ""}</td>
      <td><div class="row-actions">${readOnly() ? "" : (e.conflictOf ? `<button class="btn sm" data-act="keep" type="button" title="Keep this imported copy and delete your version">Keep this</button><button class="btn sm" data-act="discard" type="button" title="Delete this imported copy, keep your version">Keep mine</button>` : "") + `<button class="btn sm" data-act="edit" type="button">Edit</button><button class="btn sm danger" data-act="del" type="button">Delete</button>`}</div></td>
    </tr>`;
  }
  function renderTable(container, entries, emptyHtml) {
    if (!entries.length) { container.innerHTML = `<div class="empty">${emptyHtml}</div>`; return; }
    const sorted = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
    container.innerHTML = `<table><thead><tr><th>Date</th><th>Organization</th><th>Given by</th><th>Type</th><th>Status</th><th class="r">Deductible</th><th></th></tr></thead><tbody>${sorted.map(entryRow).join("")}</tbody></table>`;
    container.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
      const id = b.closest("tr").dataset.id; const e = state.entries.find(x => x.id === id); if (!e) return;
      if (b.dataset.act === "edit") { showView("ledger"); fillForm(e); }
      else if (b.dataset.act === "keep" || b.dataset.act === "discard") resolveConflict(e, b.dataset.act === "keep");
      else if (b.dataset.confirm) deleteEntry(e);
      else { b.dataset.confirm = "1"; b.textContent = "Confirm delete"; setTimeout(() => { delete b.dataset.confirm; b.textContent = "Delete"; }, 3500); }
    }));
  }
  // keepImported: true → the imported copy replaces the local version; false → the imported copy is discarded.
  async function resolveConflict(copy, keepImported) {
    const before = state.entries;
    const other = state.entries.find(x => x.id === copy.conflictOf);
    const loser = keepImported ? other : copy;
    state.entries = state.entries.filter(x => x !== loser).map(x => { if (x === copy && keepImported) { const k = Object.assign({}, x); delete k.conflictOf; if (other) k.id = other.id; return k; } return x; });
    if (!keepImported) { /* nothing else to change */ }
    if (!persist()) { state.entries = before; return; }
    if (loser) for (const id of loser.receiptIds || []) await releaseReceipt(id);
    await refreshReceipts(); renderAll(); toast(keepImported ? "Imported version kept" : "Your version kept");
  }
  async function deleteEntry(e) {
    const before = state.entries;
    state.entries = state.entries.filter(x => x.id !== e.id);
    if (!persist()) { state.entries = before; return; }
    for (const id of e.receiptIds || []) await releaseReceipt(id);
    await refreshReceipts(); if (editingId === e.id) await resetForm(); renderAll(); toast("Entry deleted");
  }

  function renderLedger() {
    const vis = visibleEntries();
    const s = summarize(vis);
    const cnt = vis.filter(isCountable);
    const attention = s.needsRecords;
    $("ledgerStats").hidden = !cnt.length;   // nothing to total yet: the form leads
    $("ledgerStats").innerHTML = `
      <div class="stat hero"><div class="label">Estimated deduction before limits · ${yearLabel()}</div><div class="value">${money(s.deductible)}</div><div class="sub">${cnt.length} entr${cnt.length === 1 ? "y" : "ies"}${s.conflicts ? ` · ${s.conflicts} conflict${s.conflicts > 1 ? "s" : ""} not counted` : ""} · recorded ${money(s.gross)}${s.needsDocs ? ` · ${money(s.needsDocs)} still needs records` : ""}${s.notEligible ? ` · ${money(s.notEligible)} not eligible, excluded` : ""}</div></div>
      <div class="stat"><div class="label">Cash gifts</div><div class="value">${money(s.cash)}</div><div class="sub">Schedule A line 11</div></div>
      <div class="stat"><div class="label">Goods &amp; stock</div><div class="value">${money(s.noncash)}</div><div class="sub">${s.noncash > RULES.FORM_8283_THRESHOLD ? "Form 8283 required" : "Schedule A line 12"}</div></div>
      <div class="stat"><div class="label">Volunteer costs</div><div class="value">${money(s.volunteer)}</div><div class="sub">Mileage + expenses</div></div>
      <div class="stat ${attention ? "attention" : ""}"><div class="label">Records needed</div><div class="value">${attention}</div><div class="sub">${attention ? (s.needsAck ? s.needsAck + " acknowledgment" + (s.needsAck > 1 ? "s" : "") + (attention > s.needsAck ? ", " + (attention - s.needsAck) + " other" : "") : "See the status column") : "All required records on file"}${s.notEligibleCount ? ` · ${s.notEligibleCount} not eligible` : ""}</div></div>`;
    syncFormSlot();
    const conflicts = state.entries.filter(e => e.conflictOf);
    $("conflictBanner").hidden = !conflicts.length;
    if (conflicts.length) $("conflictBanner").innerHTML = `<b>${conflicts.length} imported entr${conflicts.length === 1 ? "y differs" : "ies differ"} from your version.</b><span>Both copies were kept. The imported copy (marked “Import conflict”) is not counted in totals, forms or exports until you choose Keep this or Keep mine.</span>`;
    const order = ["cash", "noncash", "stock", "mileage", "expense"];
    const total = order.reduce((t, k) => t + s.byKind[k], 0);
    $("breakdown").innerHTML = total ? `<div class="eyebrow">Where the deduction comes from</div>
      <div class="bar" role="img" aria-label="Deduction breakdown by gift type">${order.filter(k => s.byKind[k] > 0).map(k => `<span class="c${KINDS[k].color}" style="flex:${s.byKind[k]}" title="${KINDS[k].label}: ${money(s.byKind[k])}"></span>`).join("")}</div>
      <div class="legend">${order.filter(k => s.byKind[k] > 0).map(k => `<span class="key"><span class="swatch c${KINDS[k].color}"></span>${KINDS[k].label} <b class="num">${money(s.byKind[k])}</b> <span class="muted">${Math.round(s.byKind[k] / total * 100)}%</span></span>`).join("")}</div>`
      : `<div class="eyebrow">Where the deduction comes from</div><p class="small muted">Once you log gifts, this shows how cash, goods, stock and volunteer costs add up.</p>`;
    const q = $("searchBox").value.trim().toLowerCase(); const kf = $("kindFilter").value; const df = $("donorFilter").value;
    const donors = [...new Set(state.entries.map(e => e.donor).filter(Boolean))].sort();
    const orgs = [...new Set(state.entries.map(e => e.org).filter(Boolean))].sort();
    $("donorList").innerHTML = donors.map(d => `<option value="${esc(d)}">`).join(""); $("orgList").innerHTML = orgs.map(o => `<option value="${esc(o)}">`).join("");
    if ($("kindFilter").options.length === 1) $("kindFilter").innerHTML += order.map(k => `<option value="${k}">${KINDS[k].label}</option>`).join("");
    const prevD = $("donorFilter").value; $("donorFilter").innerHTML = `<option value="">Everyone</option>` + donors.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join(""); $("donorFilter").value = prevD;
    const rows = vis.filter(e => (!kf || e.kind === kf) && (!df || e.donor === df) && (!q || [e.org, e.donor, e.notes, describe(e)].join(" ").toLowerCase().includes(q)));
    renderTable($("ledgerTable"), rows, vis.length ? `<h3>No entries match those filters.</h3>` : `<h3>No gifts logged for ${yearLabel()} yet.</h3><p>Record your first gift above, or <button class="btn sm" type="button" id="loadSamplesInline">load sample entries</button> to see how the ledger works.</p>`);
    const ls = $("loadSamplesInline"); if (ls) ls.addEventListener("click", loadSamples);
    $("countLedger").textContent = vis.length;
  }
  ["searchBox", "kindFilter", "donorFilter"].forEach(id => $(id).addEventListener("input", renderLedger));

  function renderOverview() {
    const vis = visibleEntries(); const cnt = vis.filter(isCountable); const s = summarize(vis);
    const user = Cloud.configured ? Cloud.user() : null;
    if (!cnt.length) {
      $("overviewHero").innerHTML = `<div class="eyebrow">${yearLabel()}</div>
        <div class="big" style="font-size:1.7rem">Your donation record starts here.</div>
        <div class="caption">Add a gift as it happens, attach the receipt, and the tax summary builds itself. Money, goods, stock, mileage and volunteer costs all count.</div>
        <div class="actions"><button class="btn primary" type="button" data-go="ledger">Add donation</button>${SAMPLE_MODE ? "" : `<a class="btn" href="app.html#sample">Explore a sample ledger</a>`}</div>`;
    } else {
      $("overviewHero").innerHTML = `<div class="eyebrow">Recorded donation value · ${yearLabel()}</div>
        <div class="big">${money(s.gross)}</div>
        <div class="caption">${cnt.length} donation${cnt.length === 1 ? "" : "s"} recorded</div>
        <div class="row" style="margin-top:8px"><span>Estimated deduction <b>${money(s.deductible)}</b></span>${s.needsDocs ? `<span>of which <b>${money(s.needsDocs)}</b> still needs documentation</span>` : ""}${s.notEligible ? `<span><b>${money(s.notEligible)}</b> not eligible</span>` : ""}</div>
        <div class="caption" style="font-size:0.78rem">Estimate after reductions such as value received in return and cost-basis limits, before AGI limits and the 0.5% floor. Not tax advice.</div>
        <div class="row"><span>Cash <b>${money(s.cash)}</b></span><span>Goods &amp; stock <b>${money(s.noncash)}</b></span><span>Volunteer costs <b>${money(s.volunteer)}</b></span></div>
        <div class="actions"><button class="btn primary" type="button" data-go="ledger">Add donation</button><button class="btn" type="button" data-go="summary">View tax summary</button></div>`;
    }
    // needs attention: the specific record that's missing, with the action that fixes it
    const attention = cnt.map(e => ({ e, r: ev(e) })).filter(x => x.r.status !== "ok").sort((a, b) => b.r.gross - a.r.gross);
    const conflicts = vis.filter(e => !isCountable(e)).length;
    $("overviewAttention").innerHTML = `<div class="card-head" style="margin-bottom:10px"><div><h3>Needs attention</h3><p>${attention.length || conflicts ? "Fix these before you file." : cnt.length ? "No documentation issues flagged." : "Issues with records will show up here."}</p></div></div>
      <div class="attention-list">${conflicts ? `<div class="attention-item"><div class="what"><b>${conflicts} import conflict${conflicts > 1 ? "s" : ""}</b><span>Both versions kept; choose one in Donations</span></div><button class="btn sm" type="button" data-go="ledger">Review</button></div>` : ""}
      ${attention.slice(0, 5).map(({ e, r }) => `<div class="attention-item"><div class="what"><b>${esc(e.org || describe(e))} · ${money(r.status === "stop" ? r.gross : r.deductible)}</b><span>${r.status === "stop" ? "Not eligible, excluded from the estimate: " + esc((r.flags.find(f => f.level === "stop") || {}).text || "").split(".")[0].toLowerCase() : docsLabel(r)}</span></div><button class="btn sm" type="button" data-edit="${esc(e.id)}">${r.status === "stop" ? "Review" : "Add record"}</button></div>`).join("")}
      ${attention.length > 5 ? `<p class="small muted">and ${attention.length - 5} more in Donations</p>` : ""}
      ${!attention.length && !conflicts ? `<div class="flag ${cnt.length ? "ok" : "info"}"><span>${cnt.length ? `No documentation issues flagged for ${yearLabel()}.` : "Each donation is checked against the IRS record-keeping rules as you add it."}</span></div>` : ""}</div>`;
    // next steps: what to do now
    const steps = [];
    if (!cnt.length) steps.push(["Record your first donation", "Money, goods, stock or a volunteer cost. Takes a minute.", "ledger"]);
    const needRec = attention.filter(x => x.r.status === "docs").length, notElig = attention.length - needRec;
    if (needRec) steps.push([`Get the missing records for ${needRec} donation${needRec > 1 ? "s" : ""}`, "Acknowledgment letters and receipts, while the charity can still send them.", "ledger"]);
    if (notElig) steps.push([`Review ${notElig} donation${notElig > 1 ? "s" : ""} not eligible as entered`, "Excluded from the estimate. Edit the entry if the details are wrong.", "ledger"]);
    if (cnt.length && !attention.length) steps.push(["Attach receipts you haven't yet", "Photos travel with the backup and the household ledger.", "receipts"]);
    steps.push(["Export the tax summary for your preparer", "Totals, filing checklist and a CSV of every donation.", "summary"]);
    $("overviewNext").innerHTML = `<div class="card-head" style="margin-bottom:10px"><div><h3>Next steps</h3></div></div><div class="next-steps">${steps.slice(0, 3).map(([t, d, go], i) => `<button class="next-step" type="button" data-go="${go}" style="text-align:left;cursor:pointer"><span class="n">${i + 1}</span><span class="t">${t}<span>${d}</span></span></button>`).join("")}</div>`;
    // recent donations with receipt thumbnails
    const recent = [...cnt].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5);
    $("overviewRecent").innerHTML = `<div class="card-head" style="margin-bottom:6px"><div><h3>Recent donations</h3></div><button class="btn sm link" type="button" data-go="ledger">All donations</button></div>
      <div class="recent">${recent.length ? recent.map(e => { const recs = receiptsFor(e); const img = recs.find(r => r.type.startsWith("image/")); const r = ev(e); return `<div class="recent-item"><div class="thumb-sm">${img ? `<img src="${urlFor(img)}" alt="">` : recs.length ? "PDF" : "—"}</div><div class="who"><b>${esc(e.org || describe(e))}</b><span>${fmtDate(e.date)} · ${esc(describe(e)).slice(0, 60)}${recs.length ? " · receipt attached" : ""}</span></div><div class="amt">${money(r.deductible)}</div></div>`; }).join("") : `<p class="small muted">No donations recorded for ${yearLabel()} yet.</p>`}</div>`;
    $("view-overview").querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { if (b.dataset.go === "signin") { accountModal(); return; } showView(b.dataset.go); if (b.dataset.go === "ledger" && b.textContent.trim() === "Add donation") openForm(); }));
    $("view-overview").querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => { const e = state.entries.find(x => x.id === b.dataset.edit); if (e) { showView("ledger"); fillForm(e); } }));
  }
  /* ---------- value guide ---------- */
  $("guideCat").innerHTML += window.FMV_GUIDE.map(g => `<option>${esc(g.cat)}</option>`).join("");
  function renderGuide() {
    const q = $("guideSearch").value.trim().toLowerCase(); const c = $("guideCat").value;
    const rows = [];
    window.FMV_GUIDE.forEach((g, gi) => { if (c && g.cat !== c) return; g.items.forEach(([name, lo, hi, src], ii) => { if (!q || (name + " " + g.cat).toLowerCase().includes(q)) rows.push({ name, cat: g.cat, lo, hi, src: src || "EST", key: gi + ":" + ii }); }); });
    $("guideRows").innerHTML = rows.length ? rows.map(r => `<tr><td>${esc(r.name)}</td><td class="muted small">${esc(r.cat)}</td><td class="r num range">${money(r.lo)}</td><td class="r num range">${money(r.hi)}</td><td class="small"><span class="src src-${r.src === "EST" ? "est" : "guide"}" title="${esc((window.FMV_SOURCES[r.src] || {}).name || "")}">${esc((window.FMV_SOURCES[r.src] || {}).short || r.src)}</span></td><td class="r"><button class="btn sm" type="button" data-use="${r.key}">Use</button></td></tr>`).join("") : `<tr><td colspan="6" class="empty">Nothing matches. Try a broader word, or value the item from comparable online listings.</td></tr>`;
    $("guideRows").querySelectorAll("[data-use]").forEach(b => b.addEventListener("click", async () => {
      const [gi, ii] = b.dataset.use.split(":").map(Number); const g = window.FMV_GUIDE[gi]; const [name, lo, hi, src] = g.items[ii];
      showView("ledger"); if (editingId && currentKind !== "noncash") await resetForm(); setKind("noncash");
      const rows = [...$("itemRows").querySelectorAll(".item-row")]; const last = rows[rows.length - 1];
      const blank = last && !last.querySelector(".desc").value && !num(last.querySelector(".unit").value);
      if (blank) last.remove();
      addItemRow({ desc: name, category: g.cat, condition: "good", qty: 1, unitValue: valueForCondition("good", lo, hi).toFixed(2), lo, hi, source: src || "EST" });
      recalcItems(); updateInsight(); $("f_howValued").value = window.FMV_METHODS[0];
      openForm(); toast(`Added “${name}” at the good-condition value — change the condition to adjust`);
    }));
  }
  $("guideSearch").addEventListener("input", renderGuide); $("guideCat").addEventListener("change", renderGuide);

  /* ---------- receipts view ---------- */
  function renderReceipts() {
    const vis = visibleEntries();
    // Required records missing (the rules demand a receipt, bank record or acknowledgment) are a to-do.
    // Entries whose records exist on paper but have no photo attached are an optional tidy-up, not a warning.
    const noFile = vis.filter(e => isCountable(e) && !receiptsFor(e).length && ev(e).deductible > 0 && e.kind !== "mileage");
    const required = noFile.filter(e => ev(e).status === "docs");
    const optional = noFile.filter(e => ev(e).status === "ok" && !(e.kind === "cash" && e.bankRecord));
    const row = (e, cls, action) => `<div class="flag ${cls}"><span><b>${fmtDate(e.date)}</b> · ${esc(e.org || describe(e))} · ${money(ev(e).deductible)}${cls === "warn" ? " · " + esc(docsLabel(ev(e))) : ""}</span><button class="btn sm" type="button" data-edit="${esc(e.id)}" style="margin-left:auto">${action}</button></div>`;
    $("missingReceipts").innerHTML = (required.length ? `<div class="card-head"><div><h3>${required.length} donation${required.length === 1 ? "" : "s"} missing a required record</h3><p>The IRS expects a receipt, bank record or written acknowledgment for these. Get it from the charity, then tick the box or attach it.</p></div></div>
      <div class="flags">${required.map(e => row(e, "warn", "Add record")).join("")}</div>` : `<div class="flag ok"><span>Every donation for ${yearLabel()} has the records the rules require.</span></div>`)
      + (optional.length ? `<div class="card-head" style="margin-top:14px"><div><h3>${optional.length} without a digital attachment</h3><p>Records declared on paper. Optional: attach a photo so it travels with the backup and the household ledger.</p></div></div>
      <div class="flags">${optional.map(e => row(e, "info", "Attach")).join("")}</div>` : "");
    $("missingReceipts").querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => { const e = state.entries.find(x => x.id === b.dataset.edit); showView("ledger"); fillForm(e); }));
    const total = receiptsCache.reduce((t, r) => t + (r.size || 0), 0);
    $("receiptStorage").textContent = receiptsCache.length ? `${receiptsCache.length} file${receiptsCache.length === 1 ? "" : "s"}, ${(total / 1024 / 1024).toFixed(1)} MB ${cloudMode ? "in your household's private storage" : "stored in this browser"}.` : "No files yet.";
    if (cloudMode) Cloud.files.storage().then(st => { if (st) $("receiptStorage").textContent += ` ${(st.used / 1048576).toFixed(1)} of ${Math.round(st.quota / 1048576)} MB allowance used.`; }).catch(() => {});
    const list = [...receiptsCache].sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));
    $("receiptGrid").innerHTML = list.length ? list.map(r => { const e = state.entries.find(x => (x.receiptIds || []).includes(r.id)); return `<div class="receipt-card" data-id="${esc(r.id)}">
        <div class="img" data-open="${esc(r.id)}">${r.type.startsWith("image/") ? `<img src="${urlFor(r)}" alt="${esc(r.name)}">` : `<span class="small">${fileLabel(r)} · ${esc(r.name.slice(0, 22))}</span>`}</div>
        <div class="meta">${e ? `<b>${esc(e.org || describe(e))}</b><span class="muted">${fmtDate(e.date)} · ${money(ev(e).deductible)}</span>` : `<b class="muted">Not linked to an entry</b><button class="btn sm link" type="button" data-link="${esc(r.id)}">Link to entry</button>`}
        <div class="row-actions" style="justify-content:flex-start;margin-top:6px"><button class="btn sm" type="button" data-openfile="${esc(r.id)}">Open</button><button class="btn sm danger" type="button" data-rm="${esc(r.id)}">Delete</button></div></div></div>`; }).join("")
      : `<div class="empty"><h3>No receipts stored.</h3><p>Attach files from the entry form, or add them here.</p></div>`;
    $("receiptGrid").querySelectorAll("[data-open], [data-openfile]").forEach(el => el.addEventListener("click", () => { const r = receiptsCache.find(x => x.id === (el.dataset.open || el.dataset.openfile)); if (r) openReceipt(r); }));
    $("receiptGrid").querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", async () => {
      if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Confirm"; setTimeout(() => { delete b.dataset.confirm; b.textContent = "Delete"; }, 3500); return; }
      const id = b.dataset.rm;
      const before = JSON.stringify(state.entries);
      state.entries.forEach(e => { if (e.receiptIds) e.receiptIds = e.receiptIds.filter(x => x !== id); });
      if (!persist()) { state.entries = JSON.parse(before); return; }
      await Files().deleteReceipt(id).catch(() => {});
      await refreshReceipts(); renderAll(); toast("Receipt deleted");
    }));
    $("receiptGrid").querySelectorAll("[data-link]").forEach(b => b.addEventListener("click", () => linkReceipt(b.dataset.link)));
    $("countReceipts").textContent = receiptsCache.length;
  }
  function linkReceipt(id) {
    const opts = [...state.entries].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(e => `<option value="${esc(e.id)}">${fmtDate(e.date)} · ${esc(e.org || describe(e))} · ${money(ev(e).deductible)}</option>`).join("");
    const close = modal(`<h3>Link receipt to an entry</h3><p class="small">Pick the gift this file belongs to.</p><div class="field w12" style="margin-top:10px"><select id="linkSel">${opts || "<option value=''>No entries yet</option>"}</select></div><div class="actions"><button class="btn primary" id="linkGo" type="button">Link</button><button class="btn" data-close type="button">Cancel</button></div>`);
    $("linkGo").addEventListener("click", async () => { const e = state.entries.find(x => x.id === $("linkSel").value); if (!e) return; const before = (e.receiptIds || []).slice(); e.receiptIds = [...before, id]; if (!persist()) { e.receiptIds = before; return; } await Files().attachReceipts([id], e.id).catch(() => {}); await refreshReceipts(); close(); renderAll(); toast("Receipt linked"); });
  }
  $("looseReceipts").addEventListener("change", async ev => {
    const files = [...ev.target.files]; ev.target.value = ""; if (!files.length) return;
    let n = 0; for (const f of files) { try { await Files().addReceipt(f, null); n++; } catch (e) { toast(`Couldn't store ${f.name}: ${e.message}`, true); } }
    await refreshReceipts(); renderAll(); if (n) toast(`${n} file${n > 1 ? "s" : ""} added — link each to an entry`);
  });

  /* ---------- summary ---------- */
  function renderSummary() {
    const vis = visibleEntries(); const s = summarize(vis);
    $("summaryTitle").textContent = `Tax summary · ${yearLabel()}`;
    $("summaryStats").innerHTML = `
      <div class="stat hero"><div class="label">Estimated deduction before limits</div><div class="value">${money(s.deductible)}</div><div class="sub">Before AGI limits and the 0.5% floor · recorded ${money(s.gross)}${s.needsDocs ? ` · includes ${money(s.needsDocs)} still needing records` : ""}${s.notEligible ? ` · ${money(s.notEligible)} not eligible, excluded` : ""}</div></div>
      <div class="stat"><div class="label">Cash + volunteer costs</div><div class="value">${money(s.cash + s.volunteer)}</div><div class="sub">Schedule A, line 11</div></div>
      <div class="stat"><div class="label">Goods + stock</div><div class="value">${money(s.noncash)}</div><div class="sub">Schedule A, line 12</div></div>
      <div class="stat ${s.needsRecords ? "attention" : ""}"><div class="label">Records needed</div><div class="value">${s.needsRecords}</div><div class="sub">${s.needsAck} acknowledgment${s.needsAck === 1 ? "" : "s"}${s.needsRecords > s.needsAck ? `, ${s.needsRecords - s.needsAck} other` : ""}${s.notEligibleCount ? ` · ${s.notEligibleCount} not eligible` : ""}${s.missingReceipts ? ` · ${s.missingReceipts} without attachment (optional)` : ""}</div></div>`;
    const kv = (obj) => { const keys = Object.keys(obj).sort((a, b) => obj[b] - obj[a]); return keys.length ? `<dl class="kv">${keys.map(k => `<dt>${esc(k)}</dt><dd class="num">${money(obj[k])}</dd>`).join("")}</dl>` : `<p class="small muted">Nothing logged yet.</p>`; };
    const order = ["cash", "noncash", "stock", "mileage", "expense"];
    const checklistCard = (title, sum) => `<div class="card"><h3>${title}</h3><div class="checklist" style="margin-top:10px">${sum.checklist.map(c => `<div class="item"><span class="mk ${c.state}">${c.state === "need" ? "!" : c.state === "done" ? "✓" : "–"}</span><span>${c.text}</span></div>`).join("")}</div></div>`;
    // Filing checks are per tax year: with "All years" selected, run one checklist per year.
    const years = year === "all" ? [...new Set(vis.map(yearOf).filter(Boolean))].sort().reverse() : [year];
    const checklists = year === "all" ? years.map(y => checklistCard(`Filing checklist · ${y}`, summarize(vis.filter(e => yearOf(e) === y)))).join("") : checklistCard("Filing checklist", s);
    $("summaryGrid").innerHTML = `
      <div class="card"><h3>By type</h3><dl class="kv" style="margin-top:10px">${order.map(k => `<dt><span class="dot c${KINDS[k].color}"></span>${KINDS[k].label}</dt><dd class="num">${money(s.byKind[k])}</dd>`).join("")}<dt class="total">Total</dt><dd class="total num">${money(s.deductible)}</dd></dl></div>
      ${checklists}
      <div class="card"><h3>By household member</h3><div style="margin-top:10px">${kv(s.byDonor)}</div><p class="small muted" style="margin-top:8px">Married filing jointly combines everyone; separate returns split by donor.</p></div>
      <div class="card"><h3>By organization</h3><div style="margin-top:10px">${kv(s.byOrg)}</div></div>`;
    renderSupport();
  }
  const csvCell = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  function csvFor(entries) {
    const cols = ["Date", "Tax year", "Given by", "Organization", "Type", "Description", "Recorded value", "Value received in return", "Deductible", "Status", "Payment method", "Check/confirmation", "Miles", "Parking & tolls", "Cost basis", "Held > 1 year", "Written acknowledgment", "Bank record", "Receipt files", "How valued", "Acquired / cost", "Expense category", "Notes"];
    const lines = [cols.join(",")];
    [...entries].sort((a, b) => (a.date || "").localeCompare(b.date || "")).forEach(e => {
      const r = ev(e); const st = e.stock || {};
      const status = r.status === "stop" ? "Not eligible" : r.status === "docs" ? "Documentation needed" : "OK";
      const row = [e.date, yearOf(e), e.donor, e.org, KINDS[e.kind].label, describe(e), r.gross.toFixed(2), num(e.benefit).toFixed(2), r.deductible.toFixed(2), status, e.method || "", e.checkNo || "", e.miles || "", e.parkingTolls || "", e.kind === "stock" && !isBlank(st.costBasis) ? num(st.costBasis).toFixed(2) : "", e.kind === "stock" ? (st.longTerm ? "Yes" : "No") : "", e.ackReceived ? "Yes" : "No", e.kind === "cash" ? (e.bankRecord ? "Yes" : "No") : "", receiptsFor(e).length, e.howValued || "", e.acquired || "", e.kind === "expense" ? (EXP[e.expenseCategory] || EXP.other).label : "", e.notes];
      lines.push(row.map(csvCell).join(","));
    });
    return lines.join("\n");
  }
  // One row per donated item — the inventory Form 8283 and a preparer want.
  function itemsCsvFor(entries) {
    const cols = ["Date", "Tax year", "Given by", "Organization", "Item", "Category", "Condition", "Qty", "Value each", "Line total", "Guide low", "Guide high", "Guide source", "How valued", "Acquired / cost", "Acknowledgment", "Receipt files", "Entry notes"];
    const lines = [cols.join(",")];
    [...entries].filter(e => e.kind === "noncash").sort((a, b) => (a.date || "").localeCompare(b.date || "")).forEach(e => (e.items || []).forEach(it => {
      lines.push([e.date, yearOf(e), e.donor, e.org, it.desc, it.category, it.condition, it.qty, num(it.unitValue).toFixed(2), window.Rules.itemValue(it).toFixed(2), isBlank(it.lo) ? "" : it.lo, isBlank(it.hi) ? "" : it.hi, sourceLabel(it.source), e.howValued || "", e.acquired || "", e.ackReceived ? "Yes" : "No", receiptsFor(e).length, e.notes].map(csvCell).join(","));
    }));
    return lines.join("\n");
  }
  function summaryText() {
    const vis = countableEntries(); const s = summarize(visibleEntries());
    const order = ["cash", "noncash", "stock", "mileage", "expense"];
    const years = year === "all" ? [...new Set(vis.map(yearOf).filter(Boolean))].sort().reverse() : [year];
    const checks = years.flatMap(y => { const sy = year === "all" ? summarize(vis.filter(e => yearOf(e) === y)) : s; return [`Filing checklist ${y}:`, ...sy.checklist.map(c => `  [${c.state === "need" ? "!" : c.state === "done" ? "x" : "-"}] ${c.text}`), ""]; });
    return [`DEDUCTBOOK — TAX SUMMARY ${year === "all" ? "(all years)" : year}`, "",
      `Estimated deduction before limits: ${money(s.deductible)} (recorded value ${money(s.gross)})`, ...order.map(k => `  ${KINDS[k].label}: ${money(s.byKind[k])}`), s.needsDocs ? `  Of which still needing records: ${money(s.needsDocs)}` : "", s.notEligible ? `  Recorded but not eligible: ${money(s.notEligible)}` : "", "",
      "By household member:", ...Object.entries(s.byDonor).map(([k, v]) => `  ${k}: ${money(v)}`), "",
      "By organization:", ...Object.entries(s.byOrg).map(([k, v]) => `  ${k}: ${money(v)}`), "",
      ...checks,
      "Entries:", ...[...vis].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(e => `  ${e.date}  ${money(ev(e).deductible).padStart(12)}  ${KINDS[e.kind].short.padEnd(8)} ${e.org || ""} — ${describe(e)}`),
      conflictNote() ? "" : "", conflictNote() ? "NOTE:" + conflictNote() + " Resolve them in the ledger before filing." : ""
    ].join("\n");
  }
  const exportCsv = () => { const vis = countableEntries(); if (!vis.length) return toast("Nothing to export for this year"); download(`deductbook-${year}.csv`, csvFor(vis), "text/csv"); toast("CSV download started (if nothing happened, use Copy CSV)." + conflictNote(), !!conflictNote()); };
  $("csvBtn").addEventListener("click", exportCsv); $("summaryCsv").addEventListener("click", exportCsv);
  $("itemsCsv").addEventListener("click", async () => { const vis = countableEntries().filter(e => e.kind === "noncash"); if (!vis.length) return toast("No goods donations for this year"); download(`deductbook-items-${year}.csv`, itemsCsvFor(vis), "text/csv"); toast("Itemized goods CSV download started"); });
  $("copyCsvBtn").addEventListener("click", async () => { const vis = countableEntries(); if (!vis.length) return toast("Nothing to copy"); toast((await copyText(csvFor(vis))) ? "CSV copied — paste into a spreadsheet." + conflictNote() : "Copy blocked by the browser", !!conflictNote()); });
  $("summaryCopy").addEventListener("click", async () => toast((await copyText(summaryText())) ? "Summary copied" : "Copy blocked by the browser"));
  $("summaryPrint").addEventListener("click", () => { try { window.print(); } catch (e) {} toast("If no print dialog opened, use Copy summary instead"); });

  /* ---------- support (optional donation) ---------- */
  const SUPPORT = CFG.support || {};
  function renderSupport() {
    const card = $("supportCard"); const foot = $("supportFooter");
    if (!SUPPORT.enabled || !(SUPPORT.links || []).length) { card.hidden = true; foot.hidden = true; return; }
    const links = SUPPORT.links.map(l => `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("");
    foot.hidden = false; foot.innerHTML = `<b>${esc(SUPPORT.heading || "Support this site")}</b> ${esc(SUPPORT.footer || "Free to use. If it helped, a small tip keeps it running.")} <span class="support-links">${links}</span>`;
    let dismissed = false; try { dismissed = localStorage.getItem("gl_support_dismissed") === "1"; } catch (e) {}
    card.hidden = dismissed;
    card.innerHTML = `<div><h4>${esc(SUPPORT.heading || "Support this site")}</h4><span>${esc(SUPPORT.message || "DeductBook is free to use. If it saved you time at tax season, a tip of any size keeps it online — entirely optional.")}</span></div><div class="support-links">${links}<button class="btn sm link" type="button" id="supportDismiss">Not now</button></div>`;
    const d = $("supportDismiss"); if (d) d.addEventListener("click", () => { try { localStorage.setItem("gl_support_dismissed", "1"); } catch (e) {} card.hidden = true; });
  }

  /* ---------- backup & data ---------- */
  $("backupBtn").addEventListener("click", () => {
    const n = state.entries.length;
    const close = modal(`<h3>Backup &amp; data</h3>
      <p class="small">Everything lives in this browser. Save a backup file to move to another device, share with a spouse, or protect against a cleared browser.</p>
      <div class="actions"><button class="btn primary" id="bkDownload" type="button">Download backup (.json)</button><button class="btn" id="bkCopy" type="button">Copy backup text</button></div>
      <p class="small muted" style="margin-top:6px">${n} entr${n === 1 ? "y" : "ies"}, ${receiptsCache.length} receipt file${receiptsCache.length === 1 ? "" : "s"}. Receipts are included in the file.</p>
      <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
      <h3>Restore</h3>
      <p class="small" style="margin:6px 0 0">Merge keeps your data and adds the file's entries; when both have the same entry, the more recently edited one wins. Replace wipes this browser first and only proceeds if every receipt in the file can be read.</p>
      <div class="actions" style="margin-top:8px"><label class="btn">Merge from file <input type="file" id="bkImport" accept="application/json,.json" hidden></label><label class="btn danger">Replace everything from file <input type="file" id="bkReplace" accept="application/json,.json" hidden></label></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
      <div class="actions" style="margin-top:0"><button class="btn" id="bkSamples" type="button">Load sample entries</button><button class="btn danger" id="bkClear" type="button">Delete all data</button><button class="btn" data-close type="button" style="margin-left:auto">Close</button></div>`);
    if (cloudMode) { $("bkReplace").parentElement.hidden = true; $("bkClear").hidden = true; $("bkSamples").hidden = readOnly(); }
    const makeBackup = async () => { try { return await (cloudMode ? Cloud.exportBackup(state) : window.Store.exportBackup(state)); } catch (e) { toast(e.message || "Backup failed", true); return null; } };
    $("bkDownload").addEventListener("click", async () => { const b = await makeBackup(); if (!b) return; download(`deductbook-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b), "application/json"); toast(`Backup started: ${b.counts.entries} entries, ${b.counts.receipts} receipts${b.counts.missingReceiptFiles ? ` (${b.counts.missingReceiptFiles} referenced files were not found)` : ""}`, true); });
    $("bkCopy").addEventListener("click", async () => { const b = await makeBackup(); if (!b) return; toast((await copyText(JSON.stringify(b))) ? `Backup copied: ${b.counts.entries} entries, ${b.counts.receipts} receipts` : "Copy blocked by the browser", true); });
    const doImport = mode => async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const json = JSON.parse(await f.text());
        const commit = newState => { const prev = state; state = newState; if (!persist()) { state = prev; return false; } return true; };
        const res = cloudMode ? await Cloud.importBackup(json, state, commit) : await window.Store.importBackup(json, state, mode, commit);
        await refreshReceipts(); close(); renderYearPicker(); renderAll();
        const parts = mode === "replace" ? [`${res.added} entries and ${res.receiptsAdded} receipts restored`] : [`${res.added} added`, `${res.skipped} unchanged`, `${res.conflicts} conflict${res.conflicts === 1 ? "" : "s"} kept for review`, `${res.receiptsAdded} receipts added`];
        if (res.staleRemoveFailed) parts.push(`${res.staleRemoveFailed} old receipt files could not be removed`);
        if (res.rejected) parts.push(`${res.rejected} malformed entries skipped`);
        if (res.receiptsFailed.length) parts.push(`${res.receiptsFailed.length} receipts unreadable`);
        toast(parts.join(", "), true);
      } catch (e) { toast(e.message || "Couldn't read that file", true); }
      finally { ev.target.value = ""; }
    };
    $("bkImport").addEventListener("change", doImport("merge")); $("bkReplace").addEventListener("change", doImport("replace"));
    $("bkSamples").addEventListener("click", () => { close(); loadSamples(); });
    $("bkClear").addEventListener("click", async () => {
      const b = $("bkClear"); if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Really delete everything?"; setTimeout(() => { delete b.dataset.confirm; b.textContent = "Delete all data"; }, 4000); return; }
      const before = state; state = { entries: [], settings: {} };
      if (!persist()) { state = before; return; }
      await window.Store.clearReceipts().catch(() => {}); await refreshReceipts(); close(); await resetForm(); renderYearPicker(); renderAll(); toast("All data deleted");
    });
  });

  /* ---------- samples ---------- */
  function loadSamples() {
    const y = year === "all" ? thisYear : year;
    const now = new Date().toISOString();
    const mk = (o) => window.Store.sanitizeEntry(Object.assign({ id: window.Store.uid(), sample: true, createdAt: now, updatedAt: now, receiptIds: [] }, o));
    const samples = [
      mk({ kind: "cash", date: `${y}-01-14`, donor: "Sample · Joint", org: "Greater Lakes Food Bank", amount: 500, method: "card", benefit: 0, bankRecord: true, ackReceived: true, notes: "Annual gift, thank-you letter on file" }),
      mk({ kind: "cash", date: `${y}-03-22`, donor: "Sample · Maria", org: "St. Brigid Parish", amount: 40, method: "check", checkNo: "1187", benefit: 0, bankRecord: true, ackReceived: false }),
      mk({ kind: "cash", date: `${y}-05-09`, donor: "Sample · Joint", org: "Riverside Arts Center", amount: 300, method: "online", benefit: 120, bankRecord: true, ackReceived: false, notes: "Spring gala — two dinner tickets valued at $60 each" }),
      mk({ kind: "cash", date: `${y}-06-15`, donor: "Sample · David", org: "Community Chest street collection", amount: 100, method: "cash", benefit: 0, bankRecord: false, ackReceived: false, notes: "Cash in a collection bucket, no receipt" }),
      mk({ kind: "noncash", date: `${y}-04-18`, donor: "Sample · David", org: "Goodwill Industries", items: [{ desc: "Men's suits", category: "Men's clothing", condition: "good", qty: 2, unitValue: 35 }, { desc: "Women's coats", category: "Women's clothing", condition: "excellent", qty: 2, unitValue: 30 }, { desc: "Hardcover books", category: "Books, media & toys", condition: "good", qty: 20, unitValue: 2 }], benefit: 0, howValued: window.FMV_METHODS[0], ackReceived: true, hasReceiptDecl: true, notes: "Drop-off receipt on file" }),
      mk({ kind: "stock", date: `${y}-06-03`, donor: "Sample · Joint", org: "Lakeshore Land Trust", amount: 4200, stock: { ticker: "20 sh VTI", costBasis: 1900, longTerm: true }, ackReceived: true }),
      mk({ kind: "mileage", date: `${y}-02-07`, donor: "Sample · Maria", org: "Meals on Wheels", miles: 38, parkingTolls: 0, purpose: "Saturday delivery route", route: "Home → kitchen → 12 stops → home", ackReceived: false }),
      mk({ kind: "mileage", date: `${y}-02-14`, donor: "Sample · Maria", org: "Meals on Wheels", miles: 41, parkingTolls: 4, purpose: "Saturday delivery route", route: "Home → kitchen → 13 stops → home", ackReceived: false, hasReceiptDecl: true }),
      mk({ kind: "expense", date: `${y}-07-19`, donor: "Sample · David", org: "Habitat for Humanity", amount: 486.4, expenseCategory: "transport", expenseDesc: "Flight to week-long build in Tulsa", awayOvernight: true, personalPleasure: false, reimbursed: false, ackReceived: true, hasReceiptDecl: true }),
      mk({ kind: "expense", date: `${y}-07-20`, donor: "Sample · David", org: "Habitat for Humanity", amount: 58.2, expenseCategory: "meals", expenseDesc: "Meals during build week", awayOvernight: true, reimbursed: false, ackReceived: true }),
      mk({ kind: "expense", date: `${y}-08-30`, donor: "Sample · Maria", org: "Meals on Wheels", amount: 14.5, expenseCategory: "meals", expenseDesc: "Lunch after delivery shift", awayOvernight: false, reimbursed: false })
    ];
    const before = state.entries; state.entries = before.concat(samples); state.settings.samples = true;
    if (!persist()) { state.entries = before; return; }
    renderYearPicker(); renderAll(); if (currentView !== "overview") showView("ledger"); toast("Sample entries loaded");
    if (SAMPLE_MODE) attachSampleReceipts(samples).catch(() => {});
  }
  // Clearly fictional attachments so the sample shows receipts the way a real ledger would.
  function sampleReceiptImage(kind, lines) {
    const c = document.createElement("canvas"); c.width = 900; c.height = 1100; const g = c.getContext("2d");
    g.fillStyle = "#fbf9f3"; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#d5cbb4"; g.lineWidth = 3; g.strokeRect(40, 40, c.width - 80, c.height - 80);
    g.fillStyle = "#182b36"; g.font = "600 40px Georgia, serif"; g.fillText(lines[0], 90, 130);
    g.font = "24px Inter, Arial, sans-serif"; g.fillStyle = "#58656c";
    lines.slice(1).forEach((t, i) => { if (t === "") return; g.fillStyle = t.startsWith("#") ? "#182b36" : "#58656c"; g.font = (t.startsWith("#") ? "600 " : "") + "26px Inter, Arial, sans-serif"; g.fillText(t.replace(/^#/, ""), 90, 200 + i * 44); });
    g.save(); g.translate(c.width / 2, c.height / 2); g.rotate(-Math.PI / 5); g.font = "700 150px Inter, Arial, sans-serif"; g.fillStyle = "rgba(23,107,96,0.13)"; g.textAlign = "center"; g.fillText("SAMPLE", 0, 50); g.restore();
    g.fillStyle = "#9a9384"; g.font = "20px Inter, Arial, sans-serif"; g.fillText("Fictional " + kind + " generated for the DeductBook sample ledger. Not a real document.", 90, c.height - 80);
    return new Promise(res => c.toBlob(res, "image/png"));
  }
  async function attachSampleReceipts(samples) {
    const y = (samples[0].date || "").slice(0, 4);
    const docs = [
      [e => e.kind === "cash" && e.org === "Greater Lakes Food Bank", "acknowledgment letter", "food-bank-acknowledgment.png", ["Greater Lakes Food Bank", "1200 Harbor Street · Lakeshore", "", "#Thank you for your gift", "", `Date: January 14, ${y}`, "Donor: The Sample household", "Amount received: $500.00", "", "No goods or services were provided", "in exchange for this contribution.", "", "Greater Lakes Food Bank is a 501(c)(3)", "organization. Keep this letter for your records."]],
      [e => e.kind === "noncash", "drop-off receipt", "goodwill-dropoff-receipt.png", ["Goodwill Industries", "Donation Center · Receipt", "", `Date: April 18, ${y}`, "Location: Lakeshore Donation Center", "", "#Items received", "2 bags clothing (suits, coats)", "1 box books", "", "Value is determined by the donor.", "Thank you for donating."]],
      [e => e.kind === "stock", "broker confirmation", "broker-transfer-confirmation.png", ["Sample Brokerage", "Transfer confirmation", "", `Date: June 3, ${y}`, "From: Sample household account ····4412", "To: Lakeshore Land Trust", "", "#20 shares VTI", "Delivered in kind (DTC transfer)", "Average of high and low on transfer date: $210.00", "Total: $4,200.00", "", "This confirms the securities left your account."]]
    ];
    let changed = false;
    for (const [match, kind, name, lines] of docs) {
      const e = state.entries.find(x => x.sample && match(x)); if (!e || (e.receiptIds || []).length) continue;
      try {
        const blob = await sampleReceiptImage(kind, lines);
        const rec = await Files().addReceipt(new File([blob], name, { type: "image/png" }), e.id);
        e.receiptIds = [...(e.receiptIds || []), rec.id]; changed = true;
      } catch (err) { /* attachments are a nicety; the sample works without them */ }
    }
    if (changed) { persist(); await refreshReceipts(); renderAll(); }
  }
  $("clearSamples").addEventListener("click", () => { const before = state.entries; state.entries = before.filter(e => !e.sample); state.settings.samples = false; if (!persist()) { state.entries = before; return; } renderYearPicker(); renderAll(); toast("Sample entries removed"); });

  /* ---------- render all ---------- */
  function renderAll() {
    freeUrls();
    $("sampleBanner").hidden = !(SAMPLE_MODE || state.entries.some(e => e.sample));
    if (SAMPLE_MODE) $("sampleBanner").innerHTML = `<b>Sample ledger</b><span>Fictional records, kept apart from your own. Change anything.</span><div class="demo-steps" aria-label="Suggested tour"><span class="muted small">Try:</span><button class="btn sm" type="button" data-demo="entry">1 · View a donation</button><button class="btn sm" type="button" data-demo="receipts">2 · Open its receipt</button><button class="btn sm" type="button" data-demo="summary">3 · See the tax summary</button></div><div><button class="btn sm" type="button" id="resetSample">Reset demo</button><a class="btn sm primary" href="app.html" id="exitSample">Start your own record</a></div>`;
    $("sampleBanner").querySelectorAll("[data-demo]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.demo === "entry") { const e = state.entries.find(x => x.kind === "noncash") || state.entries[0]; showView("ledger"); if (e) fillForm(e); }
      else showView(b.dataset.demo);
    }));
    const rs = $("resetSample"); if (rs) rs.addEventListener("click", async () => {
      if (!rs.dataset.confirm) { rs.dataset.confirm = "1"; rs.textContent = "Confirm reset"; setTimeout(() => { delete rs.dataset.confirm; rs.textContent = "Reset demo"; }, 3500); return; }
      state.entries = []; state.settings.samples = false; persist();
      try { await window.Store.clearReceipts(); } catch (e) {}
      await refreshReceipts(); loadSamples(); showView("overview"); toast("Demo reset");
    });
    renderLedger(); renderGuide(); renderReceipts(); renderSummary(); if (currentView === "overview") renderOverview();
    if (form.parentElement && form.parentElement.id) renderThumbs();
  }

  /* ---------- boot ---------- */
  /* ---------- accounts & household ledgers ---------- */
  const SAVE_LABELS = { saving: "Saving…", saved: "Saved", failed: "Save failed · retry", offline: "Offline · will retry", denied: "Access removed" };
  const PLANS = CFG.plans || {};
  const planNotice = () => PLANS.betaFree ? `<p class="small muted" style="margin-top:8px">Cloud mode is in a free beta. Intended price afterwards: <b>${esc(PLANS.intendedPrice || "to be announced")}</b> per household, covering everyone you invite. ${esc(PLANS.retentionNote || "If you stop paying, your records and exports stay available; only adding and sharing pause.")}</p>` : "";
  function setSaveStatus(s, msg) {
    const el = $("saveStatus"); el.hidden = !cloudMode; el.dataset.state = s; el.textContent = SAVE_LABELS[s] || s; el.title = msg || "";
    el.onclick = (s === "failed" || s === "offline") ? () => Cloud.retry() : null;
  }
  function renderAccountBar() {
    const user = Cloud.configured ? Cloud.user() : null;
    $("accountBtn").hidden = !Cloud.configured;
    $("accountBtn").textContent = user ? (Cloud.currentHousehold ? Cloud.currentHousehold.name : user.email) : "Sign in";
    $("householdPick").hidden = true;
    $("cloudHint").hidden = !(Cloud.configured && !user);
    $("readOnlyBanner").hidden = !readOnly();
    $("saveBtn").disabled = readOnly();
    if (!cloudMode) $("saveStatus").hidden = true;
  }
  // Switch the app onto a household ledger (or back to this device).
  async function openHousehold(hh) {
    let entries;
    try { entries = await Cloud.selectHousehold(hh); }
    catch (e) { toast("Couldn't open the ledger: " + e.message, true); return false; }
    cloudMode = true;
    $("modalRoot").innerHTML = "";                       // a household opened: close any pending prompt (e.g. "name your household")
    state = { entries, settings: { year: (() => { try { return localStorage.getItem("gl_year"); } catch (e) { return null; } })() || thisYear } };
    year = state.settings.year;
    try { localStorage.setItem("gl_household", hh.id); } catch (e) {}
    await Cloud.restoreQueue();
    // Reconcile: parked work may just have reached the server, and some may still be pending.
    // The ledger shown (and diffed on the next save) must be confirmed data + pending edits.
    try { state.entries = Cloud.overlayPending(await Cloud.reload()); } catch (e) { toast("Loaded, but couldn't refresh from the server: " + e.message, true); }
    await refreshReceipts(); if (editingId) await resetForm();
    renderYearPicker(); renderAll(); renderAccountBar(); setSaveStatus(Cloud.pendingWrites() ? "saving" : "saved");
    return true;
  }
  function leaveCloud() {
    cloudMode = false; state = window.Store.loadState(); year = state.settings.year || thisYear;
    refreshReceipts().then(() => { renderYearPicker(); renderAll(); renderAccountBar(); });
  }
  async function afterSignIn(user) {
    // pending invitation from the link that brought us here?
    let token = null; try { token = sessionStorage.getItem("gl_invite"); } catch (e) {}
    const m = location.hash.match(/invite=([a-f0-9]+)/); if (m) token = m[1];
    if (token) {
      try { await Cloud.acceptInvite(token); toast("You've joined the household ledger."); try { sessionStorage.removeItem("gl_invite"); } catch (e) {} history.replaceState(null, "", "#ledger"); }
      catch (e) { toast(e.message, true); }
    }
    let hhs = [];
    try { hhs = await Cloud.households(); } catch (e) { toast("Couldn't load your households: " + e.message, true); renderAccountBar(); return; }
    if (!hhs.length) { renderAccountBar(); firstHouseholdModal(); return; }
    let want = null; try { want = localStorage.getItem("gl_household"); } catch (e) {}
    const hh = hhs.find(h => h.id === want) || hhs[0];
    if (await openHousehold(hh)) offerMigration();
  }
  function firstHouseholdModal() {
    const close = modal(`<h3>Name your household ledger</h3><p class="small">Donations live in a household ledger, so a spouse can add to the same records. You can invite people after this step.</p>
      <div class="field w12" style="margin-top:10px"><label for="hhName">Household name</label><input id="hhName" type="text" placeholder="e.g. The Danavi household" maxlength="120"></div>
      <div class="actions"><button class="btn primary" id="hhCreate" type="button">Create ledger</button><button class="btn" data-close type="button">Not now</button></div><p class="small muted" id="hhErr"></p>`);
    $("hhCreate").addEventListener("click", async () => {
      const name = $("hhName").value.trim(); if (!name) { $("hhErr").textContent = "Give it a name."; return; }
      try { const id = await Cloud.createHousehold(name); close(); if (await openHousehold({ id, name, role: "owner" })) offerMigration(); }
      catch (e) { $("hhErr").textContent = e.message; }
    });
  }
  // Offer to copy the browser ledger into the household, verify, and only then offer to remove the local copy.
  async function offerMigration() {
    const local = window.Store.loadState(); const real = local.entries.filter(e => !e.sample);
    if (!real.length || readOnly()) return;
    let dismissed = false; try { dismissed = sessionStorage.getItem("gl_migrate_dismissed") === "1"; } catch (e) {}
    if (dismissed) return;
    let localFiles = []; try { localFiles = await window.Store.listReceipts(); } catch (e) {}
    const close = modal(`<h3>Bring this device's records into “${esc(Cloud.currentHousehold.name)}”?</h3>
      <p class="small">This browser holds ${real.length} entr${real.length === 1 ? "y" : "ies"} and ${localFiles.length} receipt file${localFiles.length === 1 ? "" : "s"} saved in device-only mode. They can be copied into the household ledger. Nothing on this device is removed until the copy has been read back and verified.</p>
      <div class="actions"><button class="btn primary" id="migGo" type="button">Copy into the household ledger</button><button class="btn" id="migNo" type="button">Not now</button></div><p class="small" id="migStatus"></p>`);
    $("migNo").addEventListener("click", () => { try { sessionStorage.setItem("gl_migrate_dismissed", "1"); } catch (e) {} close(); });
    $("migGo").addEventListener("click", async () => {
      $("migGo").disabled = true;
      try {
        const res = await Cloud.migrateLocal(local, localFiles, msg => { $("migStatus").textContent = msg; });
        state.entries = res.all; await refreshReceipts(); renderYearPicker(); renderAll();
        close();
        if (res.verified) {
          const c2 = modal(`<h3>Copied and verified</h3><p class="small">${res.entries} entr${res.entries === 1 ? "y" : "ies"} and ${res.receipts} receipt${res.receipts === 1 ? "" : "s"} were read back from the household ledger and matched byte for byte${res.skipped || res.receiptsReused ? ` (${res.skipped} entr${res.skipped === 1 ? "y" : "ies"} and ${res.receiptsReused} receipt${res.receiptsReused === 1 ? "" : "s"} were already there from an earlier attempt)` : ""}.${res.conflicts ? ` <b>${res.conflicts} entr${res.conflicts === 1 ? "y" : "ies"} differed from a copy already in the household and ${res.conflicts === 1 ? "was" : "were"} kept as an import conflict to resolve in the ledger.</b>` : ""} The device-only copy is still on this browser.</p>
            <div class="actions"><button class="btn danger" id="migClear" type="button">Remove the device copy</button><button class="btn" data-close type="button">Keep it for now</button></div>`);
          $("migClear").addEventListener("click", async () => { window.Store.saveState({ entries: [], settings: {} }); await window.Store.clearReceipts().catch(() => {}); c2(); toast("Device copy removed. Your records live in the household ledger now."); });
        } else {
          modal(`<h3>Copied, but verification found gaps</h3><p class="small">${res.missingEntries.length} entr${res.missingEntries.length === 1 ? "y" : "ies"} and ${res.missingReceipts.length} receipt${res.missingReceipts.length === 1 ? "" : "s"} could not be read back. Nothing on this device was removed. Try again later; entries already copied are skipped.</p><div class="actions"><button class="btn" data-close type="button">Close</button></div>`);
        }
      } catch (e) { $("migStatus").textContent = "Stopped: " + e.message + " Nothing on this device was removed."; $("migGo").disabled = false; }
    });
  }
  function accountModal() {
    const user = Cloud.user();
    if (!user) {
      const close = modal(`<h3>Sign in</h3><p class="small">We'll email you a sign-in link. No password to remember. Your records then follow you to any device, and you can share a ledger with your household.</p>${planNotice()}
        <div class="field w12" style="margin-top:10px"><label for="siEmail">Email</label><input id="siEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>
        <div class="actions"><button class="btn primary" id="siGo" type="button">Email me a link</button><button class="btn" data-close type="button">Cancel</button></div><p class="small" id="siMsg"></p>
        ${CFG.contactEmail ? `<p class="small muted">Trouble signing in? Email <a href="mailto:${esc(CFG.contactEmail)}">${esc(CFG.contactEmail)}</a>.</p>` : ""}`);
      $("siGo").addEventListener("click", async () => {
        const email = $("siEmail").value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("siMsg").textContent = "Enter a valid email address."; return; }
        $("siGo").disabled = true;
        try { await Cloud.signInWithEmail(email); $("siMsg").textContent = "Check your email and open the link on this device. You can close this."; }
        catch (e) { $("siMsg").textContent = e.message; $("siGo").disabled = false; }
      });
      setTimeout(() => $("siEmail").focus(), 50);
      return;
    }
    const hh = Cloud.currentHousehold;
    const close = modal(`<h3>${esc(hh ? hh.name : "Your account")}</h3><p class="small">Signed in as ${esc(user.email)}${hh ? ` · your role: ${hh.role} · ${esc(Cloud.planLabel())}` : ""}</p>${hh ? planNotice() : ""}
      <div id="acctBody" style="margin-top:10px"><p class="small muted">Loading…</p></div>
      <div class="actions"><button class="btn" id="acctSwitch" type="button">Switch household</button><button class="btn" id="acctOut" type="button">Sign out</button><button class="btn" data-close type="button" style="margin-left:auto">Close</button></div>`, { wide: true });
    $("acctOut").addEventListener("click", async () => { await Cloud.signOut(); close(); leaveCloud(); toast("Signed out. This browser is back to device-only mode."); });
    $("acctSwitch").addEventListener("click", async () => {
      let hhs = []; try { hhs = await Cloud.households(); } catch (e) { toast(e.message, true); return; }
      $("acctBody").innerHTML = `<h4>Your households</h4><div class="checklist" style="margin-top:8px">${hhs.map(h => `<div class="item"><span class="mk ${hh && h.id === hh.id ? "done" : "na"}">${hh && h.id === hh.id ? "✓" : "–"}</span><span><button class="btn sm link" type="button" data-hh="${esc(h.id)}">${esc(h.name)}</button> <span class="muted small">${h.role}</span></span></div>`).join("")}</div>
        <div class="actions"><button class="btn sm" id="acctNew" type="button">New household…</button></div>`;
      $("acctBody").querySelectorAll("[data-hh]").forEach(b => b.addEventListener("click", async () => { const h = hhs.find(x => x.id === b.dataset.hh); close(); if (await openHousehold(h)) offerMigration(); }));
      $("acctNew").addEventListener("click", () => { close(); firstHouseholdModal(); });
    });
    if (!hh) { $("acctBody").innerHTML = `<p class="small">You're not in a household ledger yet.</p>`; return; }
    (async () => {
      let members = [], invites = [];
      try { members = await Cloud.members(); if (hh.role === "owner") invites = await Cloud.invitations(); } catch (e) { $("acctBody").innerHTML = `<p class="small">${esc(e.message)}</p>`; return; }
      $("acctBody").innerHTML = `<h4>People with access</h4>
        <div class="checklist" style="margin-top:8px">${members.map(m => `<div class="item"><span class="mk done">✓</span><span>${esc(m.email)} <span class="muted small">${m.role}</span>${hh.role === "owner" && m.user_id !== user.id ? ` <button class="btn sm link" type="button" data-rm="${esc(m.user_id)}">Remove</button>` : ""}</span></div>`).join("")}</div>
        ${hh.role === "owner" ? `<h4 style="margin-top:14px">Invite someone</h4><p class="small muted">They'll sign in with the email you enter here and open the link you copy.</p>
          <div class="form-grid" style="margin-top:8px"><div class="field w8"><label for="invEmail">Email</label><input id="invEmail" type="email" placeholder="spouse@example.com"></div><div class="field w4"><label for="invRole">Access</label><select id="invRole"><option value="member">Can add and edit</option><option value="viewer">Read-only (accountant)</option></select></div></div>
          <div class="actions" style="margin-top:8px"><button class="btn sm primary" id="invGo" type="button">Create invitation link</button></div><p class="small" id="invMsg"></p>
          ${invites.length ? `<h4 style="margin-top:12px">Pending invitations</h4><div class="checklist" style="margin-top:6px">${invites.map(i => `<div class="item"><span class="mk need">!</span><span>${esc(i.email)} <span class="muted small">${i.role}</span> <button class="btn sm link" type="button" data-copy="${esc(i.token)}">Copy link</button> <button class="btn sm link" type="button" data-revoke="${esc(i.id)}">Revoke</button></span></div>`).join("")}</div>` : ""}` : ""}
        <div class="actions" style="margin-top:14px"><button class="btn sm" id="hhRename" type="button">Rename household</button></div>`;
      const linkFor = t => location.origin + location.pathname + "#invite=" + t;
      $("acctBody").querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => toast((await copyText(linkFor(b.dataset.copy))) ? "Invitation link copied" : linkFor(b.dataset.copy), true)));
      $("acctBody").querySelectorAll("[data-revoke]").forEach(b => b.addEventListener("click", async () => { try { await Cloud.revokeInvite(b.dataset.revoke); close(); accountModal(); } catch (e) { toast(e.message, true); } }));
      $("acctBody").querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", async () => { if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Confirm remove"; return; } try { await Cloud.removeMember(b.dataset.rm); close(); accountModal(); } catch (e) { toast(e.message, true); } }));
      const inv = $("invGo"); if (inv) inv.addEventListener("click", async () => {
        const email = $("invEmail").value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("invMsg").textContent = "Enter a valid email address."; return; }
        try { const r = await Cloud.invite(email, $("invRole").value); const ok = await copyText(r.link); $("invMsg").innerHTML = `Invitation created${ok ? " and link copied" : ""}. Send them this link: <code>${esc(r.link)}</code>`; }
        catch (e) { $("invMsg").textContent = e.message; }
      });
      const rn = $("hhRename"); if (rn) rn.addEventListener("click", async () => {
        const name = window.prompt ? null : null; // prompt() is unavailable in some hosts; use an inline field
        $("acctBody").insertAdjacentHTML("beforeend", `<div class="form-grid" style="margin-top:8px"><div class="field w8"><label for="hhNewName">New name</label><input id="hhNewName" type="text" value="${esc(hh.name)}" maxlength="120"></div><div class="field w4" style="justify-content:flex-end"><button class="btn sm primary" id="hhRenameGo" type="button">Save name</button></div></div>`);
        $("hhRenameGo").addEventListener("click", async () => { try { await Cloud.renameHousehold(hh.id, $("hhNewName").value.trim()); hh.name = $("hhNewName").value.trim(); renderAccountBar(); close(); toast("Household renamed"); } catch (e) { toast(e.message, true); } });
      });
    })();
  }
  $("accountBtn").addEventListener("click", accountModal);
  $("cloudHint").addEventListener("click", ev => { if (ev.target.id === "cloudSignIn") accountModal(); });

  /* ---------- boot ---------- */
  (async function init() {
    $("f_date").value = new Date().toISOString().slice(0, 10);
    setKind("cash"); updateExpenseVisibility();
    const wantSample = location.hash === "#sample";
    $("mbAdd").addEventListener("click", async () => { showView("ledger"); if (editingId) await resetForm(); openForm(); });
    $("mbPhoto").addEventListener("click", () => $("mobileCapture").click());
    $("mobileCapture").addEventListener("change", ev => { const files = [...ev.target.files]; ev.target.value = ""; if (!files.length) return; showView("ledger"); openForm(); handleFiles(files); });
    // Read an invitation token BEFORE the view router rewrites the hash.
    const im = location.hash.match(/invite=([a-f0-9]+)/); if (im) { try { sessionStorage.setItem("gl_invite", im[1]); } catch (e) {} }
    const wantSignIn = location.hash === "#signin";
    const v = location.hash.slice(1);
    showView($("view-" + v) ? v : "overview");
    if (SAMPLE_MODE) history.replaceState(null, "", "#sample");
    // device-mode boot first so the page is usable immediately
    const orphans = await window.Store.cleanupOrphans(state).catch(() => 0);
    await refreshReceipts();
    if (orphans) toast(`Removed ${orphans} receipt file${orphans > 1 ? "s" : ""} left over from an interrupted restore.`, true);
    renderYearPicker(); renderAll(); renderAccountBar();
    if (SAMPLE_MODE && !state.entries.length) { loadSamples(); showView("overview"); }
    // A demo opened before sample attachments existed gets them on the next visit.
    else if (SAMPLE_MODE && state.entries.some(e => e.sample) && !state.entries.some(e => e.sample && (e.receiptIds || []).length)) attachSampleReceipts(state.entries.filter(e => e.sample)).catch(() => {});
    if (SAMPLE_MODE) { $("cloudHint").hidden = true; document.title = "DeductBook · sample ledger"; }
    if (!window.Store.saveState(state)) toast("Heads up: this browser is blocking storage, so nothing you enter will be kept.", true);
    if (!Cloud.configured) maybeFirstUse();
    if (Cloud.configured) {
      try {
        const signedIn = await Cloud.init({
          onAuth: user => { if (user) afterSignIn(user); else if (cloudMode) leaveCloud(); else renderAccountBar(); },
          onStatus: (s, msg) => setSaveStatus(s, msg),
          onRemoteChange: entries => {
            const mine = editingId ? entries.find(e => e.id === editingId) : null;
            const before = editingId ? state.entries.find(e => e.id === editingId) : null;
            const sigList = list => list.map(e => window.Store.signature(e)).sort().join("|");
            const changed = sigList(Cloud.overlayPending(entries)) !== sigList(state.entries);
            state.entries = Cloud.overlayPending(entries); refreshReceipts().then(() => { renderYearPicker(); renderAll(); });
            if (!changed) return;                                        // our own write echoing back: nothing to announce
            if (mine && before && window.Store.signature(mine) !== window.Store.signature(before)) toast("The entry you're editing was changed on another device. Saving will keep both versions for review.", true);
            else toast("Ledger updated from another device");
          },
          onAccessLost: info => {
            toast(`You no longer have write access to “${info.household ? info.household.name : "this ledger"}”. ${info.dropped ? info.dropped + " unsent change" + (info.dropped > 1 ? "s were" : " was") + " discarded. " : ""}Reloading your households…`, true);
            afterSignIn(Cloud.user());
          },
          onConflict: (local, server) => {
            const idx = state.entries.findIndex(e => e.id === server.id);
            if (idx >= 0) state.entries[idx] = server; else state.entries.push(server);
            state.entries.push(Object.assign({}, local, { id: window.Store.uid(), conflictOf: server.id }));
            renderAll(); toast("Someone else changed this entry at the same time. Both versions are kept — pick one in the ledger.", true);
            persist();
          }
        });
        if (wantSignIn && !signedIn) accountModal();
        maybeFirstUse();
        if (im && !Cloud.user()) accountModal();
      } catch (e) { toast("Cloud sign-in is unavailable right now; working in device-only mode.", true); }
    }
  })();
})();
