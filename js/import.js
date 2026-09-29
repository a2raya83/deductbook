/* DeductBook: import donations from a spreadsheet (ItsDeductible export .xlsx, or any .csv/.xlsx).
   Columns are recognised from their header text; the user can correct the guesses before importing.
   Nothing here talks to storage: the app passes in how to add entries. */
(function () {
  "use strict";
  const XLSX_CDN = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = v => { if (v == null || v === "") return 0; const n = Number(String(v).replace(/[$,\s]/g, "")); return isFinite(n) ? n : 0; };

  // ---- field recognition ----
  // Each field: patterns tried in order against the lower-cased header; the first header that matches wins.
  const FIELDS = {
    date:     { label: "Date", pats: [/^donation date$/, /^date$/, /donation date/, /\bdate\b(?!.*(purchase|acquir|original))/] },
    org:      { label: "Organization", pats: [/^charity$/, /charity name/, /organi[sz]ation/, /donee/, /recipient/, /nonprofit/, /^charity(?!.*address)/] },
    desc:     { label: "Description", pats: [/item description/, /^description$/, /^item$/, /description/, /\bitem\b(?!.*(count|qty|quantity))/] },
    category: { label: "Category", pats: [/custom category/, /^category$/, /category/] },
    condition:{ label: "Condition", pats: [/quality/, /condition/] },
    qty:      { label: "Quantity", pats: [/quantity/, /^qty$/, /\bqty\b/, /count/] },
    unit:     { label: "Value each", pats: [/per unit/, /unit value/, /value per/, /fmv per/, /\beach\b/, /unit price/] },
    total:    { label: "Total value", pats: [/donation value/, /^total/, /total value/, /^amount$/, /\bamount\b/, /fair market value on/, /^value$/, /\bvalue\b/] },
    miles:    { label: "Miles", pats: [/miles driven/, /^miles$/, /\bmiles\b/, /mileage(?!.*(rate|value))/] },
    parking:  { label: "Parking / tolls / other costs", pats: [/other transportation/, /parking/, /toll/, /additional cost/] },
    symbol:   { label: "Stock symbol", pats: [/symbol/, /ticker/] },
    stockName:{ label: "Stock name", pats: [/name of stock/, /stock name/, /security name/] },
    shares:   { label: "Shares", pats: [/shares/] },
    basis:    { label: "Cost basis", pats: [/cost.*basis/, /\bbasis\b/, /original cost/] },
    acquired: { label: "Purchase date", pats: [/purchase date/, /acquired/, /date acquired/] },
    payment:  { label: "Payment type", pats: [/payment type/, /how paid/, /payment method/, /^method$/] },
    receipt:  { label: "Receipt (yes/no)", pats: [/^receipt/, /receipt\?/] },
    notes:    { label: "Notes", pats: [/notes/, /comment/, /memo/] },
    kind:     { label: "Donation type", pats: [/donation type/, /^type$/, /irs .*type/] }
  };
  const ESSENTIAL = { noncash: ["date", "org", "desc"], cash: ["date", "org", "total"], mileage: ["date", "org", "miles"], stock: ["date", "org", "total"] };

  function guessMapping(headers) {
    const low = headers.map(h => String(h || "").trim().toLowerCase());
    const map = {}, used = new Set();
    for (const [field, def] of Object.entries(FIELDS)) {
      for (const p of def.pats) {
        const i = low.findIndex((h, idx) => h && !used.has(idx) && p.test(h));
        if (i >= 0) { map[field] = i; used.add(i); break; }
      }
    }
    return map;
  }
  function kindFromText(t) {
    const s = String(t || "").toLowerCase();
    if (/item|goods|non-?cash|clothing|household/.test(s)) return "noncash";
    if (/mile/.test(s)) return "mileage";
    if (/stock|securit|share/.test(s)) return "stock";
    if (/cash|money|check|monetary/.test(s)) return "cash";
    return null;
  }
  // Sheet-level kind: from its name, else from the columns it has.
  function guessKind(name, map) {
    return kindFromText(name) || (map.miles != null ? "mileage" : map.symbol != null || map.shares != null ? "stock" : (map.desc != null && (map.qty != null || map.unit != null || map.condition != null)) ? "noncash" : "cash");
  }

  // ---- parsing ----
  function parseCsv(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function loadXlsxLib() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = XLSX_CDN; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the spreadsheet reader. Check your connection and try again, or export the sheet as CSV.")); document.head.appendChild(s); });
  }
  async function readFile(file) {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".csv") || name.endsWith(".txt")) return [{ name: file.name.replace(/\.[^.]+$/, ""), grid: parseCsv(await file.text()) }];
    await loadXlsxLib();
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    return wb.SheetNames.map(n => ({ name: n, grid: window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" }) }));
  }
  // The header row is the first row with at least three text cells; everything below it is data.
  function tableOf(grid) {
    const hi = grid.findIndex(r => r.filter(c => typeof c === "string" && c.trim() && !/^[\d$.,-]+$/.test(c.trim())).length >= 3);
    if (hi < 0) return null;
    const headers = grid[hi].map(h => String(h || "").trim());
    const rows = grid.slice(hi + 1).filter(r => r.some(c => String(c || "").trim() !== ""));
    return { headers, rows };
  }
  function parseDate(v) {
    if (v == null || v === "") return "";
    if (v instanceof Date) return isNaN(v) ? "" : v.toISOString().slice(0, 10);
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
    if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 80000) { const d = new Date(Math.round((Number(s) - 25569) * 86400000)); return d.toISOString().slice(0, 10); }   // Excel serial
    const d = new Date(s); return isNaN(d) ? "" : d.toISOString().slice(0, 10);
  }
  const conditionOf = v => { const s = String(v || "").toLowerCase(); return /high|excellent|like new|new/.test(s) ? "excellent" : /low|fair|poor|worn/.test(s) ? "fair" : "good"; };
  const methodOf = v => { const s = String(v || "").toLowerCase(); return /check/.test(s) ? "check" : /payroll/.test(s) ? "payroll" : /card|credit|debit/.test(s) ? "card" : /online|app|paypal|venmo/.test(s) ? "online" : /bank|transfer|ach|wire/.test(s) ? "bank" : /text/.test(s) ? "text" : /^cash$/.test(s.trim()) ? "cash" : s ? "other" : "card"; };
  const yes = v => /^(y|yes|true|1)$/i.test(String(v || "").trim());
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  // ---- entries ----
  // Turns one sheet's rows into DeductBook entries. Goods rows on the same day for the same charity become one
  // donation with several items, the way ItsDeductible groups them. Ids are stable so importing twice adds nothing.
  function buildEntries(sheet, kind, map, opts) {
    const get = (r, f) => map[f] != null ? r[map[f]] : "";
    const now = new Date().toISOString(), source = opts.sourceLabel || "spreadsheet";
    const out = [], skipped = { noDate: 0, noValue: 0 }, groups = new Map();
    sheet.rows.forEach((r, i) => {
      const rowKind = map.kind != null ? (kindFromText(get(r, "kind")) || kind) : kind;
      const date = parseDate(get(r, "date")); if (!date) { skipped.noDate++; return; }
      const org = String(get(r, "org") || "").trim();
      const notes = [String(get(r, "notes") || "").trim(), `Imported from ${source}`].filter(Boolean).join(" · ");
      const base = { date, org, donor: "", ackReceived: false, hasReceiptDecl: yes(get(r, "receipt")), notes, createdAt: now, updatedAt: now, receiptIds: [] };
      if (rowKind === "noncash") {
        const desc = String(get(r, "desc") || "").trim(); const qty = Math.max(1, Math.round(num(get(r, "qty")) || 1));
        let unit = num(get(r, "unit")); const total = num(get(r, "total")); if (!unit && total) unit = total / qty;
        if (!desc && !total) { skipped.noValue++; return; }
        const key = date + "|" + org.toLowerCase();
        if (!groups.has(key)) { const e = Object.assign({}, base, { id: "imp-" + hash(source + "|noncash|" + key), kind: "noncash", items: [], amount: 0, benefit: 0, howValued: opts.howValued || "Thrift-store / charity valuation guide", acquired: "", vehicle: false, appraised: false }); groups.set(key, e); out.push(e); }
        const e = groups.get(key); if (base.hasReceiptDecl) e.hasReceiptDecl = true;
        e.items.push({ desc: desc || "Donated item", category: String(get(r, "category") || "").trim(), condition: conditionOf(get(r, "condition")), qty, unitValue: Math.round(unit * 100) / 100, lo: null, hi: null, source: null });
      } else if (rowKind === "mileage") {
        const miles = num(get(r, "miles")); const parking = num(get(r, "parking"));
        if (!miles && !parking) { skipped.noValue++; return; }
        out.push(Object.assign({}, base, { id: "imp-" + hash(source + "|mileage|" + date + "|" + org + "|" + miles + "|" + i), kind: "mileage", miles, parkingTolls: parking, purpose: String(get(r, "desc") || "").trim() || "Volunteer driving", route: "" }));
      } else if (rowKind === "stock") {
        const total = num(get(r, "total")); if (!total) { skipped.noValue++; return; }
        const sym = String(get(r, "symbol") || "").trim(), nm = String(get(r, "stockName") || "").trim(), sh = num(get(r, "shares"));
        const basisRaw = get(r, "basis"); const basis = basisRaw === "" || basisRaw == null ? "" : num(basisRaw);
        const acq = parseDate(get(r, "acquired")); const longTerm = acq ? (new Date(date) - new Date(acq)) > 366 * 86400000 : true;
        const e = Object.assign({}, base, { id: "imp-" + hash(source + "|stock|" + date + "|" + org + "|" + total + "|" + i), kind: "stock", amount: total, stock: { ticker: [sh ? sh + " sh" : "", sym || nm].filter(Boolean).join(" "), costBasis: basis === "" ? "" : basis, longTerm } });
        if (!acq) e.notes += " · Holding period not in the export: confirm it was held over a year";
        out.push(e);
      } else {
        const total = num(get(r, "total")); if (!total) { skipped.noValue++; return; }
        const method = methodOf(get(r, "payment"));
        out.push(Object.assign({}, base, { id: "imp-" + hash(source + "|cash|" + date + "|" + org + "|" + total + "|" + i), kind: "cash", amount: total, method, checkNo: "", benefit: 0, bankRecord: method !== "cash" }));
      }
    });
    return { entries: out, skipped };
  }

  // ---- UI ----
  // opts: { modal, toast, addEntries(entries) -> Promise<{added, existing}>, sourceLabel }
  async function open(file, opts) {
    let sheets;
    try { sheets = (await readFile(file)).map(s => Object.assign({ name: s.name }, tableOf(s.grid))).filter(s => s.headers); }
    catch (e) { opts.toast(e.message || "Couldn't read that file", true); return; }
    if (!sheets.length) { opts.toast("No table with a header row was found in that file.", true); return; }
    const plans = sheets.map(s => ({ sheet: s, map: guessMapping(s.headers), kind: null }));
    plans.forEach(p => { p.kind = guessKind(p.sheet.name, p.map); });
    const sourceLabel = /itsdeductible/i.test(file.name) ? "ItsDeductible" : file.name;
    const kindLabel = { noncash: "Goods", cash: "Cash", mileage: "Mileage", stock: "Stock" };
    const render = () => {
      const blocks = plans.map((p, pi) => {
        const built = buildEntries(p.sheet, p.kind, p.map, { sourceLabel });
        p.built = built;
        const missing = ESSENTIAL[p.kind].filter(f => p.map[f] == null).map(f => FIELDS[f].label);
        const opt = (field) => `<select data-plan="${pi}" data-field="${field}"><option value="">—</option>${p.sheet.headers.map((h, i) => `<option value="${i}" ${p.map[field] === i ? "selected" : ""}>${esc(h || "(blank)")}</option>`).join("")}</select>`;
        const fieldsFor = { noncash: ["date", "org", "desc", "category", "condition", "qty", "unit", "total", "receipt", "notes"], cash: ["date", "org", "total", "payment", "receipt", "notes"], mileage: ["date", "org", "miles", "parking", "desc", "notes"], stock: ["date", "org", "total", "symbol", "stockName", "shares", "basis", "acquired", "notes"] }[p.kind];
        return `<div class="card" style="margin-top:10px">
          <div class="card-head"><div><h3>${esc(p.sheet.name)} <span class="muted small">· ${p.sheet.rows.length} rows</span></h3>
            <p>${p.kind === "skip" ? "Will be skipped." : `${built.entries.length} ${kindLabel[p.kind].toLowerCase()} donation${built.entries.length === 1 ? "" : "s"}${p.kind === "noncash" ? ` (${built.entries.reduce((n, e) => n + e.items.length, 0)} items)` : ""}${built.skipped.noDate ? ` · ${built.skipped.noDate} rows without a date skipped` : ""}${built.skipped.noValue ? ` · ${built.skipped.noValue} rows without a value skipped` : ""}`}</p></div>
            <label class="small">Treat as <select data-plan="${pi}" data-kind><option value="noncash" ${p.kind === "noncash" ? "selected" : ""}>Goods</option><option value="cash" ${p.kind === "cash" ? "selected" : ""}>Cash</option><option value="mileage" ${p.kind === "mileage" ? "selected" : ""}>Mileage</option><option value="stock" ${p.kind === "stock" ? "selected" : ""}>Stock</option><option value="skip" ${p.kind === "skip" ? "selected" : ""}>Skip this sheet</option></select></label></div>
          ${p.kind === "skip" ? "" : `${missing.length ? `<div class="flag warn"><span>Couldn't find a column for: ${missing.join(", ")}. Pick it below.</span></div>` : ""}
          <details ${missing.length ? "open" : ""}><summary class="small">Columns</summary><div class="form-grid" style="margin-top:8px">${fieldsFor.map(f => `<div class="field w3"><label>${FIELDS[f].label}</label>${opt(f)}</div>`).join("")}</div></details>
          ${built.entries.length ? `<p class="small muted" style="margin-top:8px">First: ${esc(preview(built.entries[0]))}</p>` : ""}`}
        </div>`;
      }).join("");
      const total = plans.filter(p => p.kind !== "skip").reduce((n, p) => n + p.built.entries.length, 0);
      $("impBody").innerHTML = blocks;
      $("impGo").disabled = !total; $("impGo").textContent = total ? `Import ${total} donation${total === 1 ? "" : "s"}` : "Nothing to import";
      $("impBody").querySelectorAll("select[data-kind]").forEach(s => s.addEventListener("change", () => { plans[s.dataset.plan].kind = s.value; render(); }));
      $("impBody").querySelectorAll("select[data-field]").forEach(s => s.addEventListener("change", () => { const p = plans[s.dataset.plan]; if (s.value === "") delete p.map[s.dataset.field]; else p.map[s.dataset.field] = Number(s.value); render(); }));
    };
    const preview = e => e.kind === "noncash" ? `${e.date} · ${e.org || "(no charity)"} · ${e.items.length} item${e.items.length === 1 ? "" : "s"}, ${e.items.slice(0, 2).map(i => i.desc).join(", ")}` : e.kind === "mileage" ? `${e.date} · ${e.org} · ${e.miles} miles` : `${e.date} · ${e.org} · $${Number(e.amount).toFixed(2)}`;
    const $ = id => document.getElementById(id);
    const close = opts.modal(`<h3>Import from ${esc(sourceLabel === "ItsDeductible" ? "ItsDeductible" : file.name)}</h3>
      <p class="small">Check what was recognised on each sheet, fix any column that was guessed wrong, then import. Imported donations are marked as needing records, because receipts and acknowledgment letters don't travel in the spreadsheet; tick them off as you confirm your paperwork. Importing the same file again adds nothing twice.</p>
      <div id="impBody"></div>
      <div class="actions"><button class="btn primary" id="impGo" type="button">Import</button><button class="btn" data-close type="button">Cancel</button></div><p class="small" id="impMsg"></p>`, { wide: true });
    render();
    $("impGo").addEventListener("click", async () => {
      const entries = plans.filter(p => p.kind !== "skip").flatMap(p => p.built.entries);
      $("impGo").disabled = true;
      try { const res = await opts.addEntries(entries); close(); opts.toast(`${res.added} donation${res.added === 1 ? "" : "s"} imported${res.existing ? `, ${res.existing} already present` : ""}. Review each one's records when you can.`, true); }
      catch (e) { $("impMsg").textContent = e.message || "Import failed"; $("impGo").disabled = false; }
    });
  }
  window.ImportSheet = { open, guessMapping, buildEntries, tableOf, parseCsv, parseDate };
})();
