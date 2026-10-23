"use strict";

const storageKey = "clubportal-prototype-account-billing-752";
const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
const date = value => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const paths = {
  reset: '<path d="M3 11a9 9 0 1 1 2.7 6.4M3 4v7h7"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  player: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  card: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20M6 15h3"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  warning: '<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.7 6.4M3 4v7h7M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h6"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
const badge = (label, tone = "neutral") => `<span class="badge ${tone}">${esc(label)}</span>`;
const button = (label, action, id = "", style = "", disabled = false) => `<button type="button" class="button ${style}" data-action="${action}" data-id="${esc(id)}"${disabled ? " disabled" : ""}>${label}</button>`;
const freshState = (scene = "failed", access = "finance") => ({ scene, access, extraPaid: {}, collections: [], request: null, checked: false, reviewReason: "" });
let state = freshState();
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey));
  if (saved && ["failed", "unknown", "healthy", "empty", "error"].includes(saved.scene)) {
    state = { ...freshState(saved.scene, saved.access === "readonly" ? "readonly" : "finance"), ...saved };
  }
} catch { /* The demo remains usable when browser storage is unavailable. */ }
let playerFilter = "all";
let search = "";
let selectedCharge = null;
let submittingPayment = false;
let lastTrigger = null;
let lastActionFocus = null;
let inspectorReturnFocus = null;
let draft = { date: "", reason: "", dirty: false };
const content = document.querySelector("#page-content");
const inspector = document.querySelector("#inspector");
const actionDialog = document.querySelector("#action-dialog");

function save() { try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* In-memory state is sufficient. */ } }
function announce(message) { document.querySelector("#announcement").textContent = message; }
function finance() { return state.access === "finance"; }
function protectedPayment() { return state.scene === "unknown"; }
function charges() {
  if (state.scene === "empty") return [];
  const healthy = state.scene === "healthy";
  const rows = [
    { id: "tuition", title: "Season tuition", player: "Ava Morgan", playerKey: "ava", context: "2026–27 National · 15 National", total: 360000, paid: 195000 + (healthy ? 27500 : 0), due: 27500, dueDate: "2026-10-15" },
    { id: "deposit", title: "Enrollment deposit", player: "Ava Morgan", playerKey: "ava", context: "2026–27 National · 15 National", total: 50000, paid: 50000, due: 0, dueDate: "2026-07-01" },
    { id: "warmup", title: "Warm-up top", player: "Ava Morgan", playerKey: "ava", context: "2026–27 National · 15 National", total: 8000, paid: 8000, due: 0, dueDate: "2026-08-10" },
    { id: "clinic", title: "Fall skills clinic", player: "Leo Morgan", playerKey: "leo", context: "Events · Fall skills clinic", total: 24000, paid: healthy ? 24000 : 0, due: 0, dueDate: "2026-10-30" },
  ];
  return rows.map(row => {
    const added = Number(state.extraPaid[row.id]) || 0;
    const remaining = Math.max(0, row.total - row.paid - added);
    const due = row.id === "tuition" && !healthy ? Math.min(remaining, Math.max(0, 27500 - added)) : 0;
    return { ...row, paid: row.paid + added, remaining, due, dueDate: row.id === "tuition" && remaining && !due ? "2026-11-15" : row.dueDate };
  });
}
function totals() {
  const rows = charges();
  const sum = key => rows.reduce((total, row) => total + row[key], 0);
  return { total: sum("total"), paid: sum("paid"), balance: sum("remaining"), due: sum("due"), next: rows.find(row => row.id === "tuition")?.remaining > 0 && !protectedPayment() ? 27500 : 0 };
}
function chargeStatus(row) {
  if (!row.remaining) return badge("Paid", "success");
  if (row.id === "clinic") return badge("Needs setup", "warning");
  if (protectedPayment()) return badge("Finance review", "warning");
  if (row.due) return badge("Payment failed", "danger");
  return "";
}
function transactions() {
  if (state.scene === "empty") return [];
  const rows = [
    { id: "auto-sep", date: "2026-09-15", title: "Automatic payment received", amount: 35000, status: "paid", method: "Visa ending 4242", allocations: [{ title: "Season tuition · Ava Morgan", amount: 35000 }] },
    { id: "auto-aug", date: "2026-08-15", title: "Automatic payment received", amount: 35000, status: "paid", method: "Visa ending 4242", allocations: [{ title: "Season tuition · Ava Morgan", amount: 35000 }] },
    { id: "warmup-paid", date: "2026-08-10", title: "Parent payment received", amount: 8000, status: "paid", method: "Visa ending 4242", allocations: [{ title: "Warm-up top · Ava Morgan", amount: 8000 }] },
    { id: "auto-jul", date: "2026-07-15", title: "Automatic payment received", amount: 35000, status: "paid", method: "Visa ending 4242", allocations: [{ title: "Season tuition · Ava Morgan", amount: 35000 }] },
    { id: "enrollment", date: "2026-07-01", title: "Parent payment received", amount: 140000, status: "paid", method: "Visa ending 4242", allocations: [{ title: "Season tuition · Ava Morgan", amount: 90000 }, { title: "Enrollment deposit · Ava Morgan", amount: 50000 }] },
  ];
  if (state.scene === "healthy") rows.unshift({ id: "clinic-paid", date: "2026-10-20", title: "Parent payment received", amount: 24000, status: "paid", method: "Mastercard ending 5454", allocations: [{ title: "Fall skills clinic · Leo Morgan", amount: 24000 }] });
  rows.unshift({ id: "oct-attempt", date: "2026-10-15", title: state.scene === "healthy" ? "Automatic payment received" : protectedPayment() ? "Automatic payment · outcome unknown" : "Automatic payment failed", amount: 27500, status: state.scene === "healthy" ? "paid" : protectedPayment() ? "unknown" : "failed", method: "Visa ending 4242", allocations: [{ title: "Season tuition · Ava Morgan", amount: 27500 }] });
  return [...state.collections, ...rows].sort((a, b) => b.date.localeCompare(a.date));
}
function route() { const value = location.hash.slice(1); return ["overview", "billing", "history", "adjustment"].includes(value) ? value : "billing"; }
function go(tab) {
  if (draft.dirty && tab !== "adjustment") { confirmDiscard(() => { draft = { date: "", reason: "", dirty: false }; go(tab); }); return; }
  closeDialogs();
  if (route() === tab) render(); else location.hash = tab;
}
function render() {
  document.querySelector("#scenario").value = state.scene;
  document.querySelector("#access").value = state.access;
  document.querySelector("#sidebar-role").textContent = finance() ? "Finance staff" : "View-only staff";
  document.querySelectorAll("[data-tab]").forEach(tab => {
    const active = tab.dataset.tab === (route() === "adjustment" ? "billing" : route());
    tab.classList.toggle("active", active);
    if (active) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  });
  content.setAttribute("aria-busy", "false");
  if (state.scene === "error") {
    content.innerHTML = `<div class="section-heading"><h2>Billing</h2></div><div class="empty-state"><h3>Billing couldn’t load</h3><p>We couldn’t retrieve this account’s billing. Amounts and available actions haven’t been confirmed.</p>${button("Try again", "retry", "", "primary")}</div>`;
  } else if (route() === "adjustment") renderAdjustment();
  else if (route() === "history") renderHistory();
  else if (route() === "overview") renderOverview();
  else renderBilling();
}
function renderBilling() {
  const total = totals();
  const tuition = charges().find(row => row.id === "tuition");
  const clinic = charges().find(row => row.id === "clinic");
  const needsPayment = tuition?.due > 0;
  const needsSetup = clinic?.remaining > 0;
  const attentionCount = Number(needsPayment) + Number(needsSetup);
  content.innerHTML = `<div class="section-heading"><div><h2>Billing</h2><p>Understand the balance. Find the next step.</p></div><div class="button-row">${button(`${icon("card")}Saved methods`, "methods")}${button(`${icon("history")}View history`, "history")}</div></div>
    <div class="facts" aria-label="Account billing summary">
      <div class="fact"><div class="fact-label">Balance</div><div class="fact-value" data-metric="balance">${money(total.balance)}</div><span class="fact-detail">All unpaid charges, including future payments</span></div>
      <div class="fact"><div class="fact-label">Due now</div><div class="fact-value" data-metric="due">${money(total.due)}</div><span class="fact-detail">Unpaid amounts due today or earlier</span></div>
      <div class="fact"><div class="fact-label">Next automatic charge</div><div class="fact-value ${protectedPayment() || !total.next ? "text-value" : ""}" data-metric="next">${protectedPayment() ? "Awaiting review" : total.next ? money(total.next) : "None scheduled"}</div><span class="fact-detail">${protectedPayment() ? "Collection is protected while the payment is verified" : total.next ? "Nov 15 · Ava’s tuition · Visa ending 4242" : "No eligible automatic payment is scheduled"}</span></div>
    </div>
    <div class="facts-foot"><span>Tuition &amp; fees <strong>${money(total.total)}</strong></span><span>Paid <strong>${money(total.paid)}</strong></span><span>Account totals · All players</span></div>
    ${attentionCount ? `<section class="section" aria-labelledby="attention-title"><div class="section-title"><h3 id="attention-title">Needs attention</h3><span class="count">${attentionCount}</span></div><div class="attention-list">
      ${needsPayment ? `<div class="attention-row"><span class="attention-icon">${icon("warning")}</span><div class="attention-copy"><strong>${protectedPayment() ? "Confirm a payment before collecting again" : "Ava’s $275 payment was declined"}</strong><p>${protectedPayment() ? "The Oct 15 payment may have been processed. The amount stays protected until Finance verifies the result." : "The Oct 15 automatic payment failed. Review the original attempt before choosing what to do next."}</p></div>${button("Review payment", "payment", "oct-attempt", "small-button")}</div>` : ""}
      ${needsSetup ? `<div class="attention-row"><span class="attention-icon">${icon("card")}</span><div class="attention-copy"><strong>Leo’s clinic payment needs setup</strong><p>$240 is due Oct 30. A saved payment method alone does not authorize automatic collection.</p></div>${button("View charge", "charge", "clinic", "small-button")}</div>` : ""}
    </div></section>` : charges().length ? `<div class="healthy-line">${icon("check")}No billing items need attention.${total.next ? " Ava’s next automatic payment is scheduled." : ""}</div>` : ""}
    ${state.request ? `<div class="notice neutral">${icon("file")}<div><strong>Billing adjustment requested</strong><p>The clinic due-date request is awaiting Finance review. The current due date and balance are unchanged.</p></div></div>` : ""}
    <section aria-labelledby="charges-title"><div class="toolbar"><div class="toolbar-title"><h3 id="charges-title">Charges</h3><span class="count">${charges().length}</span></div><div class="filter-controls"><label class="search-field"><span>${icon("search")}</span><span class="sr-only">Search charges or players</span><input id="charge-search" type="search" placeholder="Search charges" value="${esc(search)}" autocomplete="off"></label><label class="sr-only" for="player-filter">Filter charges by player</label><select id="player-filter"><option value="all">All players</option><option value="ava">Ava Morgan</option><option value="leo">Leo Morgan</option></select></div></div><div id="charge-results" aria-live="polite"></div></section>`;
  document.querySelector("#player-filter").value = playerFilter;
  renderCharges();
}
function renderCharges() {
  const all = charges();
  const rows = all.filter(row => (playerFilter === "all" || row.playerKey === playerFilter) && `${row.title} ${row.player} ${row.context}`.toLowerCase().includes(search.trim().toLowerCase()));
  const target = document.querySelector("#charge-results");
  if (!target) return;
  if (!all.length) { target.innerHTML = `<div class="empty-state"><h3>No billing for this account yet</h3><p>Charges will appear here when an enrollment or registration creates billing for Jamie’s account.</p></div>`; return; }
  if (!rows.length) { target.innerHTML = `<div class="empty-state"><h3>No charges match these filters</h3><p>Try another charge or player, or clear your filters to see all account billing.</p>${button("Clear filters", "clear-filters")}</div>`; return; }
  target.innerHTML = `<p class="filter-scope">Showing ${rows.length} of ${all.length} charges. Filters do not change the account totals above.</p>` + ["ava", "leo"].map(key => {
    const group = rows.filter(row => row.playerKey === key);
    if (!group.length) return "";
    const fullGroup = all.filter(row => row.playerKey === key);
    return `<div class="charge-group"><div class="group-heading"><div><strong>${esc(group[0].player)}</strong><p>${esc(group[0].context)}</p></div><div class="group-total"><strong class="money">${money(fullGroup.reduce((sum, row) => sum + row.remaining, 0))}</strong><span>Remaining in this billing</span></div></div><table class="charge-table"><caption class="sr-only">${esc(group[0].player)} charges</caption><thead><tr><th scope="col">Charge</th><th scope="col">Next due</th><th scope="col">Status</th><th scope="col">Remaining</th><th scope="col"><span class="sr-only">Details</span></th></tr></thead><tbody>${group.map(row => `<tr data-charge-row="${row.id}" class="${selectedCharge === row.id ? "selected-row" : ""}"><td><button type="button" class="row-title" data-action="charge" data-id="${row.id}">${esc(row.title)}</button><div class="row-subtitle">Total ${money(row.total)}</div></td><td>${row.remaining ? date(row.dueDate) : "—"}</td><td>${chargeStatus(row)}</td><td class="row-amount ${row.remaining ? "" : "zero"}">${money(row.remaining)}</td><td><button type="button" class="icon-button" data-action="charge" data-id="${row.id}" aria-label="View ${esc(row.title)} for ${esc(row.player)}">${icon("chevron")}</button></td></tr>`).join("")}</tbody></table></div>`;
  }).join("");
}
function renderHistory() {
  const rows = transactions();
  content.innerHTML = `<div class="section-heading"><div><h2>Account history</h2><p>Original payments and their billing applications, kept together.</p></div>${button(`${icon("back")}Back to Billing`, "billing")}</div>${rows.length ? `<table class="history-table"><caption class="sr-only">Jamie Morgan’s payment history</caption><thead><tr><th scope="col">Date</th><th scope="col">Activity</th><th scope="col">Outcome</th><th scope="col">Amount</th></tr></thead><tbody>${rows.map(payment => `<tr><td>${date(payment.date)}</td><td><button type="button" class="row-title" data-action="payment" data-id="payment:${payment.id}">${esc(payment.title)}</button><div class="row-subtitle">${esc(payment.method)}</div></td><td>${badge(payment.status === "paid" ? "Received" : payment.status === "failed" ? "Failed" : "Needs review", payment.status === "paid" ? "success" : payment.status === "failed" ? "danger" : "warning")}</td><td class="money">${money(payment.amount)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty-state"><h3>No payment activity yet</h3><p>Confirmed payments and attempts will appear here once this account has billing activity.</p></div>`}`;
}
function renderOverview() {
  content.innerHTML = `<div class="section-heading"><div><h2>Account overview</h2><p>Contact and billing context for Jamie Morgan.</p></div></div><div class="form-panel"><dl class="detail-list"><div><dt>Account holder</dt><dd>Jamie Morgan</dd></div><div><dt>Email</dt><dd>jamie.morgan@example.org</dd></div><div><dt>Linked players</dt><dd>Ava Morgan · Leo Morgan</dd></div><div><dt>Billing balance</dt><dd class="money">${money(totals().balance)}</dd></div></dl><div class="button-row detail-action">${button("Open Billing", "billing", "", "primary")}${button("View saved payment methods", "methods")}</div></div>`;
}
function openInspector(context, title, body, footer = "") {
  document.querySelector("#drawer-context").textContent = context;
  document.querySelector("#drawer-title").textContent = title;
  document.querySelector("#drawer-body").innerHTML = body;
  document.querySelector("#drawer-footer").innerHTML = footer || button("Close", "close-inspector");
  if (!inspector.open) { inspectorReturnFocus = lastActionFocus; inspector.showModal(); }
  else { const heading = document.querySelector("#drawer-title"); heading.tabIndex = -1; heading.focus(); }
}
function restoreInspectorFocus() {
  const target = inspectorReturnFocus;
  const candidates = [...content.querySelectorAll('[data-action]')].filter(element => target && element.dataset.action === target.action && (element.dataset.id || "") === target.id);
  const replacement = candidates.find(element => element.getAttribute("aria-label") === target.label) || candidates[0];
  const fallback = [...content.querySelectorAll('[data-action="charge"]')].find(element => element.dataset.id === selectedCharge) || content.querySelector("h2");
  const element = replacement || fallback;
  if (element) { if (element.tagName === "H2") element.tabIndex = -1; element.focus(); }
}
function showCharge(id) {
  const row = charges().find(item => item.id === id);
  if (!row) return;
  selectedCharge = id;
  renderCharges();
  const isProtected = id === "tuition" && protectedPayment();
  const adjustment = id === "clinic" && row.remaining > 0;
  let body = `<div class="detail-amount"><div><span class="small muted">Remaining</span><strong class="money">${money(row.remaining)}</strong></div>${chargeStatus(row)}</div><dl class="detail-list"><div><dt>Account</dt><dd>Jamie Morgan<span class="stacked">This account’s responsibility only</span></dd></div><div><dt>Player</dt><dd>${esc(row.player)}</dd></div><div><dt>Total charge</dt><dd class="money">${money(row.total)}</dd></div><div><dt>Payments applied</dt><dd class="money">${money(row.paid)}</dd></div><div><dt>${id === "tuition" ? "Next unpaid installment" : "Due date"}</dt><dd>${row.remaining || id !== "tuition" ? date(row.dueDate) : "Paid in full"}</dd></div></dl>`;
  if (isProtected) body += `<div class="notice">${icon("warning")}<div><strong>Payment outcome unknown</strong><p>$275 may already have been collected. This charge has a collection hold while Finance reviews the payment. Do not collect it again.</p></div></div>`;
  else if (row.due) body += `<div class="notice error">${icon("warning")}<div><strong>The Oct 15 payment failed</strong><p>The recorded processor result was a decline. No money was received for that attempt.</p></div></div>`;
  if (id === "clinic" && row.remaining) body += `<div class="notice neutral">${icon("card")}<div><strong>Payment setup needed</strong><p>The parent has not authorized automatic payment for this charge. Saved cards remain separate from automatic-payment authorization.</p></div></div>`;
  if (id === "tuition") {
    const paidOct = !row.due && !isProtected;
    body += `<h3>Payment schedule</h3><p class="small-copy">Original dates remain in place. Paid history is retained.</p>${["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15"].map((dueDate, index) => `<div class="schedule-row"><div><strong>${date(dueDate)}</strong><span class="small">${index === 0 ? paidOct ? "Paid" : isProtected ? "Awaiting Finance review" : "Payment failed" : row.remaining ? isProtected ? "Collection protected · original date retained" : "Automatic payment · Visa ending 4242" : "Paid"}</span></div><span class="money">${money(27500)}</span></div>`).join("")}`;
    body += `<div class="detail-action">${button("Review Oct 15 payment", "payment", "oct-attempt", "subtle")}</div>`;
  } else if (!row.remaining) {
    const sourcePayment = transactions().find(payment => payment.status === "paid" && payment.allocations.some(allocation => allocation.title === `${row.title} · ${row.player}`));
    body += `<h3>Payment activity</h3><div class="activity-row"><div><strong>Payment received</strong><span class="small">${sourcePayment ? `${date(sourcePayment.date)} · ${esc(sourcePayment.method)}` : "Confirmed payment history"}</span></div><span class="money">${money(row.total)}</span></div>${sourcePayment ? button("View original payment", "payment", `payment:${sourcePayment.id}`, "subtle detail-action") : ""}`;
  }
  if (state.request && id === "clinic") body += `<div class="notice neutral"><div><strong>Due-date request pending</strong><p>Requested ${date(state.request.date)}. The current date and amount remain unchanged until an authorized Finance decision.</p></div></div>`;
  if (!finance()) body += `<div class="notice neutral">You have view-only access. Payment and adjustment actions require the relevant Finance permission.</div>`;
  openInspector(`${row.player} · ${row.context}`, row.title, body, `${adjustment ? state.request ? button("View pending request", "pending-request") : button("Request billing adjustment", "adjust", id, "", !finance()) : ""}${row.remaining ? button("Charge saved method", "collect", id, "primary", !finance() || isProtected) : button("Close", "close-inspector")}`);
}
function findPayment(id) { return transactions().find(payment => payment.id === id.replace(/^payment:/, "")); }
function showPayment(id) {
  const payment = findPayment(id);
  if (!payment) return;
  if (payment.id === "oct-attempt") { selectedCharge = "tuition"; renderCharges(); }
  const unknown = payment.status === "unknown";
  const failed = payment.status === "failed";
  let body = `<div class="detail-amount"><div><span class="small muted">${payment.status === "paid" ? "Money received" : "Attempted amount"}</span><strong class="money">${money(payment.amount)}</strong></div>${badge(unknown ? "Outcome unknown" : failed ? "Declined" : "Received", unknown ? "warning" : failed ? "danger" : "success")}</div><dl class="detail-list"><div><dt>Date</dt><dd>${date(payment.date)}</dd></div><div><dt>Account</dt><dd>Jamie Morgan</dd></div><div><dt>Payment method</dt><dd>${esc(payment.method)}</dd></div><div><dt>Source</dt><dd>${payment.id === "oct-attempt" ? "ClubPortal auto-pay" : payment.title.startsWith("Staff") ? "Staff payment" : payment.title.startsWith("Automatic") ? "ClubPortal auto-pay" : "Parent payment"}</dd></div><div><dt>Transaction reference</dt><dd>${unknown ? "Not received" : failed ? "Declined attempt" : `DEMO-${esc(payment.id.toUpperCase())}`}</dd></div></dl>`;
  if (failed) body += `<div class="notice error">${icon("warning")}<div><strong>No money was collected by this attempt</strong><p>The recorded result was “Insufficient funds.” This attempt did not collect money. Later payments are recorded separately in history.</p></div></div>`;
  if (unknown) body += `<div class="notice">${icon("warning")}<div><strong>Do not collect this amount again</strong><p>A missing transaction reference does not prove the payment failed. The $275 remains protected until the original payment can be verified.</p></div></div>`;
  body += `<h3>${payment.status === "paid" ? "Applied to" : "Intended billing"}</h3>${payment.allocations.map(allocation => `<div class="allocation"><span>${esc(allocation.title)}</span><strong class="money">${money(allocation.amount)}</strong></div>`).join("")}`;
  if (unknown) {
    body += `<h3>Finance review</h3><p class="small-copy">Verify the existing attempt. This action never submits another payment.</p>${finance() ? `<form id="verify-form" novalidate><div id="verify-error" class="field-error" role="alert"></div><div class="form-field"><label for="review-reason">Review reason</label><textarea id="review-reason" name="reason" aria-describedby="review-help" required>${esc(state.reviewReason)}</textarea><span id="review-help" class="small-copy">At least 10 characters describing the evidence checked.</span></div></form>` : `<div class="notice neutral">Finance approval permission is required to verify and resolve this payment.</div>`}`;
    if (state.checked) body += `<div class="notice" role="status"><div><strong>Amount remains protected</strong><p>This demo’s verification returned no conclusive result. An empty search cannot release protection. No balance or schedule was changed.</p></div></div>`;
  }
  if (payment.status === "paid") body += `<p class="small-copy detail-action">This receipt represents the original payment once, including every application above.</p>`;
  if (!finance() && failed) body += `<div class="notice neutral">You have view-only access. Collection requires the relevant Finance permission.</div>`;
  const alreadyRecharged = payment.id === "oct-attempt" && failed && charges().find(row => row.id === "tuition")?.due === 0;
  if (alreadyRecharged) body += `<div class="notice success"><div><strong>A replacement payment was received</strong><p>The original decline is retained. View Account history for the separate successful staff payment.</p></div></div>`;
  const action = unknown ? button("Verify and resolve", "verify", "", "primary", !finance()) : failed && !alreadyRecharged ? button("Recharge original payment", "recharge", "tuition", "primary", !finance()) : payment.status === "paid" ? button("View receipt", "receipt", payment.id, "primary") : button("View account history", "history");
  openInspector("Account history · Jamie Morgan", payment.title, body, `${button("Close", "close-inspector")}${action}`);
}
function showMethods() {
  openInspector("Jamie Morgan · Account-wide", "Saved payment methods", `<p class="small-copy">A saved method is available for an eligible payment. It does not, by itself, authorize collection.</p><div class="method">${icon("card")}<div><strong>Visa ending 4242</strong><p>Expires 08/2028</p><p>${charges().length ? "Authorized for Ava’s tuition automatic payments." : "Saved only. No current automatic payment authorization."}</p></div></div><div class="method">${icon("card")}<div><strong>Mastercard ending 5454</strong><p>Expires 03/2029</p><p>Saved only. Not selected for automatic payments.</p></div></div><div class="notice neutral">A one-time staff payment does not change the method or authorization for future automatic payments.</div>`);
}
function showPendingRequest() {
  if (!state.request) return;
  showAction("Pending billing adjustment", `<p class="small-copy">Leo Morgan · Fall skills clinic</p><dl class="detail-list detail-action"><div><dt>Current due date</dt><dd>Oct 30, 2026</dd></div><div><dt>Requested due date</dt><dd>${date(state.request.date)}</dd></div><div><dt>Decision</dt><dd>Awaiting Finance review</dd></div></dl><h3>Reason</h3><p>${esc(state.request.reason)}</p><div class="notice neutral">This request has not changed the balance or payment schedule. The existing request remains part of the review history.</div>`, button("Close request", "close-action"));
}
function showAction(title, body, footer) {
  document.querySelector("#action-title").textContent = title;
  document.querySelector("#action-body").innerHTML = body;
  document.querySelector("#action-footer").innerHTML = footer;
  actionDialog.showModal();
}
function collect(id, recharge = false) {
  const row = charges().find(item => item.id === id);
  if (!finance() || !row?.remaining || (id === "tuition" && protectedPayment())) return;
  const amount = recharge ? Math.min(row.due, 27500) : row.remaining;
  if (!amount) return;
  const title = recharge ? "Recharge original payment" : "Charge saved payment method";
  showAction(title, `<form id="collect-form" data-charge="${id}" data-amount="${amount}" data-recharge="${recharge}" novalidate><p class="small-copy">${esc(row.player)} · ${esc(row.title)}</p><dl class="detail-list detail-action"><div><dt>One-time amount</dt><dd class="money">${money(amount)}</dd></div><div><dt>Account holder</dt><dd>Jamie Morgan</dd></div></dl><div class="form-field"><label for="payment-method">Saved payment method</label><select id="payment-method" name="method"><option>Visa ending 4242</option>${recharge ? "" : "<option>Mastercard ending 5454</option>"}</select></div><label class="checkbox-label" for="consent"><input type="checkbox" id="consent" name="consent" aria-describedby="consent-error"><span id="consent-copy">I confirm Jamie Morgan authorized a one-time charge of <strong>${money(amount)}</strong> to <span id="consent-method">Visa ending 4242</span>. This does not change future autopay.</span></label><div id="consent-error" class="field-error" role="alert"></div><div class="notice neutral">This is a simulated payment. No real payment method or provider service will be used.</div></form>`, `${button("Cancel", "close-action")}<button class="button primary" type="submit" form="collect-form">Charge ${money(amount)}</button>`);
}
function completeCollection(form) {
  if (submittingPayment) return;
  const id = form.dataset.charge;
  const row = charges().find(item => item.id === id);
  const amount = Number(form.dataset.amount);
  const recharge = form.dataset.recharge === "true";
  if (!finance() || !row || !Number.isInteger(amount) || amount <= 0 || amount > row.remaining || (id === "tuition" && protectedPayment())) return;
  const consent = form.elements.consent;
  if (!consent.checked) {
    document.querySelector("#consent-error").textContent = "Confirm the account holder approved this exact amount and payment method.";
    consent.setAttribute("aria-invalid", "true"); consent.focus(); return;
  }
  submittingPayment = true;
  actionDialog.querySelectorAll("button").forEach(element => { element.disabled = true; });
  form.querySelectorAll("input, select").forEach(element => { element.disabled = true; });
  const submit = document.querySelector('[form="collect-form"]');
  submit.disabled = true; submit.textContent = "Processing…";
  setTimeout(() => {
    state.extraPaid[id] = (Number(state.extraPaid[id]) || 0) + amount;
    const payment = { id: `staff-${state.collections.length + 1}`, date: "2026-10-23", title: recharge ? "Staff recharge received" : "Staff payment received", amount, status: "paid", method: form.elements.method.value, allocations: [{ title: `${row.title} · ${row.player}`, amount }], recharge };
    state.collections.unshift(payment); save(); render();
    document.querySelector("#action-title").textContent = "Payment completed";
    document.querySelector("#action-body").innerHTML = `<div class="notice success">${icon("check")}<div><strong>${money(amount)} received in this demo</strong><p>The payment has been applied to ${esc(row.title)}. The original history is retained.</p></div></div><p class="small-copy">No real money was collected. Future autopay authorization and payment-method selection were not changed.</p>`;
    document.querySelector("#action-footer").innerHTML = `${button("Done", "finish-payment", payment.id, "primary")}`;
    submittingPayment = false;
    actionDialog.querySelector('[data-close="action-dialog"]').disabled = false;
    document.querySelector('#action-footer [data-action="finish-payment"]').focus();
    announce(`Simulated payment completed: ${money(amount)}.`);
  }, 450);
}
function verifyPayment() {
  if (!finance()) return;
  const field = document.querySelector("#review-reason");
  if (!field || field.value.trim().length < 10) {
    document.querySelector("#verify-error").textContent = "Enter a review reason of at least 10 characters.";
    field?.setAttribute("aria-invalid", "true"); field?.focus(); return;
  }
  state.reviewReason = field.value; state.checked = true; save(); showPayment("oct-attempt");
  announce("No conclusive verification result. The amount remains protected.");
}
function receipt(id) {
  const payment = findPayment(id);
  if (payment?.status !== "paid") return;
  showAction("Payment receipt", `<p class="small-copy">North Valley Volleyball · Synthetic receipt</p><div class="detail-amount detail-action"><div><span class="small muted">Payment received</span><strong class="money">${money(payment.amount)}</strong></div>${badge("Paid", "success")}</div><dl class="detail-list"><div><dt>Account</dt><dd>Jamie Morgan</dd></div><div><dt>Date</dt><dd>${date(payment.date)}</dd></div><div><dt>Original method</dt><dd>${esc(payment.method)}</dd></div></dl><h3>Payment applications</h3>${payment.allocations.map(allocation => `<div class="allocation"><span>${esc(allocation.title)}</span><strong class="money">${money(allocation.amount)}</strong></div>`).join("")}<p class="small-copy detail-action">One payment, shown once. The original method and applications remain part of its history.</p>`, button("Close receipt", "close-action"));
}
function renderAdjustment() {
  const row = charges().find(item => item.id === "clinic");
  if (!row || !finance()) { go("billing"); return; }
  if (state.request) {
    content.innerHTML = `<div class="form-page">${button(`${icon("back")}Back to Billing`, "billing", "", "subtle")}<div class="section-heading"><div><h2>Billing adjustment pending</h2><p>Leo Morgan · Fall skills clinic</p></div></div><div class="form-panel"><dl class="detail-list"><div><dt>Current due date</dt><dd>Oct 30, 2026</dd></div><div><dt>Requested due date</dt><dd>${date(state.request.date)}</dd></div><div><dt>Decision</dt><dd>Awaiting Finance review</dd></div></dl><h3 class="detail-action">Reason</h3><p>${esc(state.request.reason)}</p><div class="notice neutral">The existing request is awaiting a Finance decision. The balance and current due date have not changed.</div></div></div>`;
    return;
  }
  content.innerHTML = `<div class="form-page">${button(`${icon("back")}Back to Billing`, "billing", "", "subtle")}<div class="section-heading"><div><h2>Request a billing adjustment</h2><p>Leo Morgan · Fall skills clinic</p></div></div><div class="form-panel"><dl class="detail-list"><div><dt>Change requested</dt><dd>Change payment due date</dd></div><div><dt>Remaining balance</dt><dd class="money">${money(row.remaining)}</dd></div><div><dt>Current due date</dt><dd>${date(row.dueDate)}</dd></div></dl><form id="adjustment-form" novalidate><div id="adjustment-error" class="field-error" role="alert"></div><div class="form-field"><label for="requested-date">Requested due date <span class="muted">(required)</span></label><input type="date" id="requested-date" name="date" value="${esc(draft.date)}" aria-describedby="requested-date-error" required><p id="requested-date-error" class="field-error"></p></div><div class="form-field"><label for="adjustment-reason">Reason for the request <span class="muted">(required)</span></label><textarea id="adjustment-reason" name="reason" aria-describedby="adjustment-reason-error" required>${esc(draft.reason)}</textarea><p id="adjustment-reason-error" class="field-error"></p></div><div class="notice neutral">Finance reviews this request before any change is applied. Submitting it does not move the due date, reduce the balance, or record a payment.</div><div class="form-actions">${button("Cancel", "billing")}<button class="button primary" type="submit">Submit request</button></div></form></div></div>`;
}
function submitAdjustment(form) {
  if (!finance() || state.request) return;
  const fields = [form.elements.date, form.elements.reason];
  fields.forEach(field => { field.removeAttribute("aria-invalid"); document.getElementById(`${field.id}-error`).textContent = ""; });
  const invalid = fields.filter(field => !field.value.trim() || (field.name === "date" && !field.validity.valid));
  if (invalid.length) {
    document.querySelector("#adjustment-error").textContent = "Choose a valid requested date and explain the request.";
    invalid.forEach(field => { field.setAttribute("aria-invalid", "true"); document.getElementById(`${field.id}-error`).textContent = field.name === "date" ? "Choose a valid requested payment due date." : "Explain why the due date should change."; }); invalid[0].focus(); return;
  }
  state.request = { date: form.elements.date.value, reason: form.elements.reason.value.trim() };
  draft = { date: "", reason: "", dirty: false }; save(); go("billing"); announce("Billing adjustment request submitted for Finance review. Balance and due date unchanged.");
}
function confirmDiscard(proceed) {
  if (actionDialog.open) return;
  showAction("Discard this request?", "<p>Your changes have not been submitted. Stay to finish the request, or discard the unsaved changes.</p>", `${button("Stay", "close-action")}<button type="button" class="button primary" id="discard-request">Discard changes</button>`);
  document.querySelector("#discard-request").onclick = () => { actionDialog.close(); proceed(); };
}
function closeDialogs() { if (actionDialog.open) actionDialog.close(); if (inspector.open) inspector.close(); }
function handleAction(action, id) {
  switch (action) {
    case "billing": go("billing"); break;
    case "history": go("history"); break;
    case "charge": showCharge(id); break;
    case "payment": showPayment(id); break;
    case "methods": showMethods(); break;
    case "collect": collect(id); break;
    case "recharge": collect(id, true); break;
    case "verify": verifyPayment(); break;
    case "receipt": receipt(id); break;
    case "adjust": closeDialogs(); go("adjustment"); break;
    case "pending-request": showPendingRequest(); break;
    case "close-inspector": inspector.close(); break;
    case "close-action": if (!submittingPayment) actionDialog.close(); break;
    case "finish-payment": closeDialogs(); showPayment(id); break;
    case "clear-filters": search = ""; playerFilter = "all"; renderBilling(); document.querySelector("#charge-search").focus(); break;
    case "retry": state = freshState("failed", state.access); save(); render(); announce("Billing loaded."); break;
  }
}
document.querySelectorAll("[data-icon]").forEach(element => { element.innerHTML = icon(element.dataset.icon); });
document.addEventListener("click", event => {
  const close = event.target.closest("[data-close]");
  if (close) { if (close.dataset.close !== "action-dialog" || !submittingPayment) document.getElementById(close.dataset.close).close(); return; }
  const tab = event.target.closest("[data-tab]");
  if (tab) { go(tab.dataset.tab); return; }
  const trigger = event.target.closest("[data-action]");
  if (trigger && !trigger.disabled) { lastTrigger = trigger; lastActionFocus = { action: trigger.dataset.action, id: trigger.dataset.id || "", label: trigger.getAttribute("aria-label") }; handleAction(trigger.dataset.action, trigger.dataset.id); }
});
document.addEventListener("submit", event => {
  event.preventDefault();
  if (event.target.id === "collect-form") completeCollection(event.target);
  else if (event.target.id === "adjustment-form") submitAdjustment(event.target);
  else if (event.target.id === "verify-form") verifyPayment();
});
document.addEventListener("input", event => {
  if (event.target.id === "charge-search") { search = event.target.value; renderCharges(); }
  if (["requested-date", "adjustment-reason"].includes(event.target.id)) {
    draft = { date: document.querySelector("#requested-date").value, reason: document.querySelector("#adjustment-reason").value, dirty: true };
    event.target.removeAttribute("aria-invalid");
    document.getElementById(`${event.target.id}-error`).textContent = "";
    if (draft.date && draft.reason.trim() && document.querySelector("#requested-date").validity.valid) document.querySelector("#adjustment-error").textContent = "";
  }
  if (event.target.id === "review-reason") { event.target.removeAttribute("aria-invalid"); document.querySelector("#verify-error").textContent = ""; }
  if (event.target.id === "consent") { event.target.removeAttribute("aria-invalid"); document.querySelector("#consent-error").textContent = ""; }
});
document.addEventListener("change", event => {
  if (event.target.id === "player-filter") { playerFilter = event.target.value; renderCharges(); }
  if (event.target.id === "payment-method") { document.querySelector("#consent-method").textContent = event.target.value; document.querySelector("#consent").checked = false; }
});
function setScenario(scene) {
  const apply = () => { draft = { date: "", reason: "", dirty: false }; closeDialogs(); state = freshState(scene, state.access); search = ""; playerFilter = "all"; selectedCharge = null; save(); if (route() !== "billing") location.hash = "billing"; else render(); announce("Demo scenario loaded. Synthetic data reset."); };
  if (draft.dirty) { document.querySelector("#scenario").value = state.scene; confirmDiscard(apply); } else apply();
}
document.querySelector("#scenario").addEventListener("change", event => setScenario(event.target.value));
document.querySelector("#reset").addEventListener("click", () => setScenario(state.scene));
document.querySelector("#access").addEventListener("change", event => {
  const access = event.target.value;
  const apply = () => { draft = { date: "", reason: "", dirty: false }; closeDialogs(); state.access = access; save(); if (route() === "adjustment") location.hash = "billing"; else render(); announce(access === "finance" ? "Finance demo access selected." : "View-only demo access selected."); };
  if (draft.dirty) { document.querySelector("#access").value = state.access; confirmDiscard(apply); } else apply();
});
document.querySelector("#nav-toggle").addEventListener("click", event => { const open = document.querySelector("#sidebar").classList.toggle("mobile-open"); event.currentTarget.setAttribute("aria-expanded", String(open)); event.currentTarget.setAttribute("aria-label", open ? "Close navigation" : "Open navigation"); });
inspector.addEventListener("close", () => { renderCharges(); if (!actionDialog.open) restoreInspectorFocus(); });
actionDialog.addEventListener("close", () => { if (!inspector.open) lastTrigger?.isConnected && lastTrigger.focus(); });
actionDialog.addEventListener("cancel", event => { if (submittingPayment) event.preventDefault(); });
for (const dialog of [inspector, actionDialog]) dialog.addEventListener("click", event => { if (dialog === actionDialog && submittingPayment) return; if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
window.addEventListener("hashchange", () => {
  if (draft.dirty && route() !== "adjustment") { const target = route(); history.replaceState(null, "", "#adjustment"); confirmDiscard(() => { draft = { date: "", reason: "", dirty: false }; go(target); }); return; }
  closeDialogs(); render(); const heading = content.querySelector("h2"); if (heading) { heading.tabIndex = -1; heading.focus(); }
});
window.addEventListener("beforeunload", event => { if (draft.dirty) { event.preventDefault(); event.returnValue = ""; } });
save();
setTimeout(render, 120);
