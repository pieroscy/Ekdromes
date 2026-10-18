/* Εκδρομές — app logic (Firebase Auth + Firestore) */
const METHODS = ["Revolut", "Quickpay", "Μετρητά", "Άλλο"];
const S = { events: [], att: [], exp: [], access: [], isOwner: false, screen: "list", cur: null, filter: "all", editAtt: null, editEvent: false, confirm: null, evReady: false, user: null };
const unsubs = [];

firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth();
const fs = firebase.firestore();
fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); // offline cache
const col = name => fs.collection(name);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = n => "€" + (Math.round((+n || 0) * 100) / 100).toLocaleString("el-GR", { maximumFractionDigits: 2 });
const fmtDate = d => { if (!d) return ""; const [y, m, dd] = d.split("-").map(Number); if (!y) return ""; return new Date(y, m - 1, dd).toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "long", year: "numeric" }); };
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const peopleLabel = n => n === 1 ? "1 άτομο" : `${n} άτομα`;
const attOf = id => S.att.filter(a => a.eventId === id).sort((a, b) => (a.order || 0) - (b.order || 0));
const expOf = id => S.exp.filter(x => x.eventId === id).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
function stats(id) {
  const l = attOf(id); let exp = 0, got = 0, n = 0; const by = {};
  for (const a of l) { exp += +a.amount || 0; if (a.paid) { got += +a.amount || 0; n++; const m = a.method || "Άλλο"; by[m] = (by[m] || 0) + (+a.amount || 0); } }
  const xl = expOf(id); const spent = xl.reduce((t, x) => t + (+x.amount || 0), 0);
  return { l, exp, got, n, by, xl, spent, net: got - spent };
}

let tt; function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }
async function safe(fn, fail) {
  try { await fn(); }
  catch (e) { console.error(e); toast(e && e.code === "permission-denied" ? "Δεν έχεις δικαίωμα πρόσβασης με αυτόν τον λογαριασμό." : (fail || "Η αποθήκευση απέτυχε. Δοκίμασε ξανά.")); }
}

/* ---------- Auth ---------- */
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
$("#loginBtn").addEventListener("click", async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) {
      await auth.signInWithRedirect(provider);
    } else if (e && e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      $("#loginMsg").textContent = loginError(e);
    }
  }
});
auth.getRedirectResult().catch(e => { $("#loginMsg").textContent = loginError(e); });
function loginError(e) {
  const c = (e && e.code) || "unknown";
  if (c === "auth/unauthorized-domain") return "Η σύνδεση απέτυχε: το " + location.hostname + " δεν είναι στα Authorized domains του Firebase. (" + c + ")";
  if (c === "auth/operation-not-allowed") return "Η σύνδεση απέτυχε: το Google login δεν είναι ενεργό στο Firebase → Authentication. (" + c + ")";
  if (c === "auth/network-request-failed") return "Η σύνδεση απέτυχε: δεν υπάρχει internet. (" + c + ")";
  return "Η σύνδεση απέτυχε. Δοκίμασε ξανά. (" + c + ")";
}
$("#logoutBtn").addEventListener("click", () => auth.signOut());

const OWNER = (window.OWNER_EMAIL || "").toLowerCase();
const denyLogin = email => {
  $("#loginMsg").textContent = `Ο λογαριασμός ${email} δεν έχει πρόσβαση. Ζήτα από τον διαχειριστή να σε προσθέσει ή συνδέσου με άλλον λογαριασμό.`;
  auth.signOut();
};

auth.onAuthStateChanged(async user => {
  unsubs.splice(0).forEach(u => u());
  S.user = user; S.isOwner = false; S.access = [];
  if (!user) {
    $("#loginScreen").hidden = false; $("#appRoot").hidden = true; return;
  }
  const email = (user.email || "").toLowerCase();
  S.isOwner = email === OWNER;
  if (!S.isOwner) {
    // Μέλος; Ελέγχεται η δική του εγγραφή στη λίστα πρόσβασης.
    try {
      const me = await col("access").doc(email).get();
      if (!me.exists) { denyLogin(user.email); return; }
    } catch (e) {
      if (e && e.code === "permission-denied") { denyLogin(user.email); return; }
      // offline: συνέχισε· η βάση θα αρνηθεί ούτως ή άλλως αν δεν έχει πρόσβαση
    }
  }
  $("#loginScreen").hidden = true; $("#appRoot").hidden = false;
  $("#whoami").textContent = user.email || "";
  $("#accessBtn").hidden = !S.isOwner;
  S.evReady = false; if (S.screen === "access" && !S.isOwner) S.screen = "list"; render();
  const fail = e => { console.error(e); toast(e.code === "permission-denied" ? "Ο λογαριασμός " + (S.user && S.user.email) + " δεν έχει πρόσβαση στα δεδομένα." : "Πρόβλημα σύνδεσης με τη βάση. (" + e.code + ")"); };
  unsubs.push(col("events").onSnapshot(s => { S.events = s.docs.map(d => ({ id: d.id, ...d.data() })); S.evReady = true; render(); }, fail));
  unsubs.push(col("attendees").onSnapshot(s => { S.att = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, fail));
  unsubs.push(col("expenses").onSnapshot(s => { S.exp = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, fail));
  if (S.isOwner) unsubs.push(col("access").onSnapshot(s => { S.access = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); },
    e => { console.error(e); S.accessError = e.code; render(); }));
});

/* ---------- Render ---------- */
function render() {
  $("#listScreen").hidden = S.screen !== "list";
  $("#eventScreen").hidden = S.screen !== "event";
  $("#accessScreen").hidden = S.screen !== "access";
  S.screen === "list" ? renderList() : S.screen === "access" ? renderAccess() : renderEvent();
}
function renderList() {
  const ul = $("#eventsList");
  if (!S.evReady) { ul.innerHTML = `<li class="empty">Φόρτωση…</li>`; return; }
  if (!S.events.length) {
    const seed = window.SEED && window.SEED.events && window.SEED.events.length;
    ul.innerHTML = `<li class="empty"><span>Δεν υπάρχουν εκδρομές ακόμα. Πάτα «Νέα εκδρομή» για να φτιάξεις την πρώτη.</span>
      ${seed ? `<button class="btn ghost" type="button" data-action="importSeed">Εισαγωγή δεδομένων από την προηγούμενη έκδοση</button>` : ""}</li>`;
    return;
  }
  // Ταξινόμηση: επερχόμενες (η πιο κοντινή πρώτη), μετά οι περασμένες (η πιο πρόσφατη πρώτη), στο τέλος όσες δεν έχουν ημερομηνία.
  const today = todayISO();
  const rank = e => !e.date ? 2 : e.date >= today ? 0 : 1;
  const evs = [...S.events].sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 0 ? a.date.localeCompare(b.date) : (b.date || "").localeCompare(a.date || ""))
    || (b.createdAt || "").localeCompare(a.createdAt || ""));
  ul.innerHTML = evs.map(e => {
    const s = stats(e.id); const pct = s.exp ? Math.round(s.got / s.exp * 100) : 0; const due = s.l.length - s.n;
    const date = fmtDate(e.date);
    return `<li class="ev-card"><button class="ev" type="button" data-action="open" data-id="${e.id}">
      <div class="ev-head"><span class="ev-name">${esc(e.name)}</span><span class="ev-sum num">${eur(s.got)} <span class="muted">/ ${eur(s.exp)}</span></span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="ev-meta"><span class="${date ? "" : "nodate"}">${esc(date) || "Χωρίς ημερομηνία"}</span><span class="num">${peopleLabel(s.l.length)} · ${s.n} πλήρωσαν</span></div>
      <div class="ev-meta num"><span>Έξοδα ${eur(s.spent)}</span><span class="ev-net ${s.net < 0 ? "neg" : ""}">Καθαρό ${eur(s.net)}</span></div>
    </button>
    ${s.l.length ? `<div class="ev-foot">
      <div class="breakdown">${Object.entries(s.by).map(([m, v]) => `<span class="num">${esc(m)} ${eur(v)}</span>`).join("")}</div>
      ${due ? `<button class="badge due num" type="button" data-action="openDue" data-id="${e.id}">${due} ${due === 1 ? "εκκρεμεί" : "εκκρεμούν"} ›</button>`
            : `<span class="badge paid">Όλοι πλήρωσαν</span>`}
    </div>` : ""}
    </li>`;
  }).join("");
}
function renderAccess() {
  const ul = $("#accessList");
  if (S.accessError === "permission-denied") {
    ul.hidden = false;
    ul.innerHTML = `<li class="person muted">Η λίστα δεν είναι ακόμα ενεργή. Επικόλλησε τους νέους κανόνες στο Firebase Console → Firestore → Rules και πάτα Publish.</li>`;
    return;
  }
  const rows = [...S.access].sort((a, b) => (a.email || a.id).localeCompare(b.email || b.id));
  ul.hidden = false;
  ul.innerHTML = `<li class="person"><div class="exp-row"><span class="p-name">${esc(OWNER)}</span><span class="status paid">Διαχειριστής</span></div></li>` +
    (rows.length ? rows.map(a => {
      const armed = S.confirm === "acc:" + a.id;
      const added = a.addedAt ? new Date(a.addedAt).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" }) : "";
      return `<li class="person"><div class="exp-row"><span class="p-name">${esc(a.email || a.id)}${added ? `<br><span class="muted" style="font-weight:400;font-size:.82rem">από ${esc(added)}</span>` : ""}</span>
        <button class="x ${armed ? "armed" : ""}" type="button" data-action="delAccess" data-id="${esc(a.id)}" aria-label="Αφαίρεση ${esc(a.email || a.id)}">${armed ? "Αφαίρεση;" : "✕"}</button></div></li>`;
    }).join("") : `<li class="person muted">Δεν έχεις προσθέσει κανέναν ακόμα.</li>`);
}
function renderEvent() {
  const e = S.events.find(x => x.id === S.cur);
  if (!e) { S.screen = "list"; render(); return; }
  const s = stats(e.id); const pct = s.exp ? Math.round(s.got / s.exp * 100) : 0;
  const amtIn = $("#add-amt"); if (!amtIn.value && document.activeElement !== amtIn) amtIn.value = e.amount ?? "";
  let head = `<div class="panel summary">
    <div class="top"><div><h2>${esc(e.name)}</h2><div class="muted">${e.date ? esc(fmtDate(e.date)) : (S.editEvent ? "Χωρίς ημερομηνία" : `<button class="add-date" type="button" data-action="toggleEditEvent">+ Πρόσθεσε ημερομηνία</button>`)} · ${eur(e.amount)} ανά άτομο · ${peopleLabel(s.l.length)}</div></div>
    <button class="btn ghost" type="button" data-action="toggleEditEvent">${S.editEvent ? "Κλείσιμο" : "Επεξεργασία"}</button></div>`;
  if (S.editEvent) {
    const armed = S.confirm === "ev";
    head += `<div class="field"><label for="ee-name">Όνομα</label><input id="ee-name" value="${esc(e.name)}"></div>
    <div class="row-fields"><div class="field"><label for="ee-date">Ημερομηνία</label><input id="ee-date" type="date" value="${esc(e.date || "")}"></div>
    <div class="field small"><label for="ee-amt">Ποσό/άτομο €</label><input id="ee-amt" type="number" min="0" step="0.5" value="${esc(e.amount ?? "")}"></div></div>
    <div class="actions"><button class="btn danger ${armed ? "armed" : ""}" type="button" data-action="delEvent">${armed ? "Σίγουρα; Διαγραφή εκδρομής" : "Διαγραφή εκδρομής"}</button><button class="btn" type="button" data-action="saveEvent">Αποθήκευση</button></div>`;
  }
  head += `<div class="figs"><div class="fig ok"><b class="num">${eur(s.got)}</b><span>εισπράχθηκαν</span></div>
    <div class="fig due"><b class="num">${eur(s.exp - s.got)}</b><span>εκκρεμούν</span></div>
    <div class="fig"><b class="num">${s.n}/${s.l.length}</b><span>πλήρωσαν</span></div>
    <div class="fig"><b class="num">${s.l.length}</b><span>συμμετέχοντες</span></div>
    <div class="fig"><b class="num">${eur(s.spent)}</b><span>έξοδα</span></div>
    <div class="fig net ${s.net < 0 ? "neg" : ""}"><b class="num">${eur(s.net)}</b><span>καθαρό</span></div></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    ${Object.keys(s.by).length ? `<div class="breakdown">${Object.entries(s.by).map(([m, v]) => `<span class="num">${esc(m)} ${eur(v)}</span>`).join("")}</div>` : ""}
  </div>`;
  $("#evHead").innerHTML = head;
  document.querySelectorAll("#seg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.filter === S.filter));

  $("#expTotal").textContent = s.xl.length ? "Σύνολο " + eur(s.spent) : "";
  $("#expList").hidden = !s.xl.length;
  $("#expList").innerHTML = s.xl.map(x => {
    const armed = S.confirm === "exp:" + x.id;
    return `<li class="person"><div class="exp-row"><span class="p-name">${esc(x.desc)}</span><span class="p-amt num">${eur(x.amount)}</span>
    <button class="x ${armed ? "armed" : ""}" type="button" data-action="delExp" data-id="${x.id}" aria-label="Διαγραφή εξόδου ${esc(x.desc)}">${armed ? "Διαγραφή;" : "✕"}</button></div></li>`;
  }).join("");

  const list = s.l.map((a, i) => ({ a, i })).filter(({ a }) => S.filter === "all" || (S.filter === "paid" ? a.paid : !a.paid));
  const ul = $("#people");
  if (!s.l.length) { ul.innerHTML = `<li class="person muted">Πρόσθεσε τον πρώτο συμμετέχοντα από τη φόρμα πιο πάνω.</li>`; return; }
  if (!list.length) { ul.innerHTML = `<li class="person muted">${S.filter === "due" ? "Όλοι πλήρωσαν." : "Κανείς δεν έχει πληρώσει ακόμα."}</li>`; return; }
  ul.innerHTML = list.map(({ a, i }) => {
    const armed = S.confirm === "att:" + a.id;
    return `<li class="person">
      <div class="p-top"><span class="idx num">${i + 1}</span>
        <button class="p-name" type="button" data-action="editAtt" data-id="${a.id}">${esc(a.name)}</button>
        <span class="p-amt num">${eur(a.amount)}</span>
        <span class="status ${a.paid ? "paid" : "due"}">${a.paid ? "Πλήρωσε" : "Εκκρεμεί"}</span></div>
      <div class="chips">${METHODS.map(m => { const on = a.paid && a.method === m; return `<button class="chip ${on ? "on" : ""}" type="button" data-action="pay" data-id="${a.id}" data-m="${esc(m)}" aria-pressed="${on}">${esc(m)}</button>`; }).join("")}</div>
      ${S.editAtt === a.id ? `<div class="edit">
        <div class="row-fields"><div class="field"><label for="ea-name-${a.id}">Όνομα</label><input id="ea-name-${a.id}" value="${esc(a.name)}"></div>
        <div class="field small"><label for="ea-amt-${a.id}">Ποσό €</label><input id="ea-amt-${a.id}" type="number" min="0" step="0.5" value="${esc(a.amount)}"></div></div>
        <div class="actions"><button class="btn danger ${armed ? "armed" : ""}" type="button" data-action="delAtt" data-id="${a.id}">${armed ? "Σίγουρα;" : "Διαγραφή"}</button>
        <button class="btn ghost" type="button" data-action="editAtt" data-id="${a.id}">Άκυρο</button>
        <button class="btn" type="button" data-action="saveAtt" data-id="${a.id}">Αποθήκευση</button></div></div>` : ""}
    </li>`;
  }).join("");
}

/* ---------- Actions ---------- */
document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-action],[data-filter]"); if (!b) return;
  if (b.dataset.filter) { S.filter = b.dataset.filter; render(); return; }
  const act = b.dataset.action, id = b.dataset.id;
  if (!["delAtt", "delEvent", "delExp", "delAccess"].includes(act)) S.confirm = null;
  if (act === "openAccess") { if (!S.isOwner) return; S.screen = "access"; S.cur = null; render(); window.scrollTo(0, 0); return; }
  if (act === "delAccess") {
    if (!S.isOwner) return;
    if (S.confirm !== "acc:" + id) { S.confirm = "acc:" + id; render(); return; }
    S.confirm = null; safe(async () => { await col("access").doc(id).delete(); toast("Η πρόσβαση αφαιρέθηκε."); }); return;
  }

  if (act === "open" || act === "openDue") { S.screen = "event"; S.cur = id; S.filter = act === "openDue" ? "due" : "all"; S.editAtt = null; S.editEvent = false; $("#add-amt").value = ""; render(); window.scrollTo(0, 0); }
  else if (act === "back") { S.screen = "list"; S.cur = null; render(); }
  else if (act === "pay") {
    const a = S.att.find(x => x.id === id); if (!a) return; const m = b.dataset.m;
    const patch = (a.paid && a.method === m) ? { paid: false, method: null, paidAt: null } : { paid: true, method: m, paidAt: new Date().toISOString() };
    safe(() => col("attendees").doc(id).update(patch));
  }
  else if (act === "editAtt") { S.editAtt = S.editAtt === id ? null : id; render(); }
  else if (act === "saveAtt") {
    const name = $("#ea-name-" + id).value.trim(); const amount = parseFloat($("#ea-amt-" + id).value) || 0;
    if (!name) { toast("Γράψε ένα όνομα."); return; }
    S.editAtt = null; render(); safe(() => col("attendees").doc(id).update({ name, amount }));
  }
  else if (act === "delAtt") {
    if (S.confirm !== "att:" + id) { S.confirm = "att:" + id; render(); return; }
    S.confirm = null; S.editAtt = null; safe(() => col("attendees").doc(id).delete());
  }
  else if (act === "delExp") {
    if (S.confirm !== "exp:" + id) { S.confirm = "exp:" + id; render(); return; }
    S.confirm = null; safe(() => col("expenses").doc(id).delete());
  }
  else if (act === "toggleEditEvent") { S.editEvent = !S.editEvent; render(); }
  else if (act === "saveEvent") {
    const name = $("#ee-name").value.trim(); if (!name) { toast("Γράψε ένα όνομα."); return; }
    const date = $("#ee-date").value; const amount = parseFloat($("#ee-amt").value) || 0; S.editEvent = false; render();
    safe(() => col("events").doc(S.cur).update({ name, date, amount }));
  }
  else if (act === "delEvent") {
    if (S.confirm !== "ev") { S.confirm = "ev"; render(); return; }
    const eid = S.cur; const batch = fs.batch();
    attOf(eid).forEach(a => batch.delete(col("attendees").doc(a.id)));
    expOf(eid).forEach(x => batch.delete(col("expenses").doc(x.id)));
    batch.delete(col("events").doc(eid));
    S.confirm = null; S.screen = "list"; S.cur = null; render();
    safe(async () => { await batch.commit(); toast("Η εκδρομή διαγράφηκε."); });
  }
  else if (act === "importSeed") {
    const seed = window.SEED; const batch = fs.batch();
    seed.events.forEach(({ id, ...d }) => batch.set(col("events").doc(id), d));
    seed.attendees.forEach(({ id, ...d }) => batch.set(col("attendees").doc(id), d));
    (seed.expenses || []).forEach(({ id, ...d }) => batch.set(col("expenses").doc(id), d));
    safe(async () => { await batch.commit(); toast("Τα δεδομένα εισήχθησαν."); });
  }
  else if (S.screen === "event") render();
});

$("#newEventBtn").addEventListener("click", () => { const f = $("#newEventForm"); f.hidden = !f.hidden; if (!f.hidden) $("#ne-name").focus(); });
$("#neCancel").addEventListener("click", () => { $("#newEventForm").hidden = true; });
$("#newEventForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  const name = $("#ne-name").value.trim(); if (!name) return;
  const data = { name, date: $("#ne-date").value, amount: parseFloat($("#ne-amt").value) || 0, createdAt: new Date().toISOString() };
  const ref = col("events").doc();
  $("#newEventForm").reset(); $("#ne-amt").value = "20"; $("#newEventForm").hidden = true;
  S.screen = "event"; S.cur = ref.id; S.filter = "all"; $("#add-amt").value = "";
  S.events = [...S.events, { id: ref.id, ...data }]; render();
  safe(() => ref.set(data));
});
$("#add-name").addEventListener("keydown", ev => { if (ev.key === "Enter" && !ev.shiftKey && !ev.target.value.includes("\n")) { ev.preventDefault(); $("#addForm").requestSubmit(); } });
$("#addForm").addEventListener("submit", async ev => {
  ev.preventDefault(); if (!S.cur) return;
  const names = $("#add-name").value.split("\n").map(s => s.trim()).filter(Boolean);
  if (!names.length) { toast("Γράψε ένα όνομα."); return; }
  const e = S.events.find(x => x.id === S.cur); const v = $("#add-amt").value;
  const amount = v === "" ? (+e.amount || 0) : (parseFloat(v) || 0);
  $("#add-name").value = ""; let order = Date.now(); const batch = fs.batch();
  names.forEach(name => batch.set(col("attendees").doc(), { eventId: S.cur, name, amount, paid: false, method: null, paidAt: null, order: order++ }));
  safe(() => batch.commit());
});
$("#accessForm").addEventListener("submit", async ev => {
  ev.preventDefault(); if (!S.isOwner) return;
  const email = $("#acc-email").value.trim().toLowerCase();
  if (!/^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(email)) { toast("Γράψε ένα σωστό email."); return; }
  if (email === OWNER) { toast("Αυτός είναι ο δικός σου λογαριασμός."); return; }
  if (S.access.some(a => a.id === email)) { toast("Αυτό το email έχει ήδη πρόσβαση."); return; }
  $("#acc-email").value = "";
  safe(async () => {
    await col("access").doc(email).set({ email, addedAt: new Date().toISOString(), addedBy: OWNER });
    toast("Προστέθηκε: " + email);
  }, "Η προσθήκη απέτυχε. Έχεις επικολλήσει τους νέους κανόνες στο Firebase;");
});
$("#expForm").addEventListener("submit", async ev => {
  ev.preventDefault(); if (!S.cur) return;
  const desc = $("#exp-desc").value.trim(); const amount = parseFloat($("#exp-amt").value);
  if (!desc) { toast("Γράψε περιγραφή για το έξοδο."); return; }
  if (!(amount > 0)) { toast("Γράψε ποσό μεγαλύτερο από 0."); return; }
  $("#exp-desc").value = ""; $("#exp-amt").value = "";
  safe(() => col("expenses").add({ eventId: S.cur, desc, amount, createdAt: new Date().toISOString() }));
});

/* ---------- Service worker (install as app + offline) ---------- */
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
