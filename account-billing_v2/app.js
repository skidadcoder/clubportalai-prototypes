"use strict";

const storageKey = "clubportal-prototype-account-billing-752-v3";
const businessDate = "2026-10-23";
const earliestRequestDate = "2026-10-24";
const tuitionFinalDate = "2027-03-15";
const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
const date = value => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const paymentTime = payment => payment.occurredAt && Number.isFinite(Date.parse(payment.occurredAt)) ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "America/New_York", timeZoneName: "short" }).format(new Date(payment.occurredAt)) : "Time not recorded";
const paymentActor = payment => payment.actor || (payment.title.startsWith("Staff") ? "Staff member not recorded" : payment.id === "oct-attempt" || payment.title.startsWith("Automatic") ? "ClubPortal auto-pay" : payment.status === "noncash" ? "Alex Lee · Finance" : payment.status === "returned" ? "Bank return" : "Jamie Morgan (Parent)");
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
const scenes = ["failed", "unknown", "healthy", "split", "returned", "noncash", "submit-declined", "submit-unknown", "receipt-error", "empty", "error"];
const freshState = (scene = "failed", access = "finance") => ({ scene, access, extraPaid: {}, collections: [], requests: {}, reviews: {}, futureMethod: null });
let state = freshState();
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey));
  if (saved && scenes.includes(saved.scene)) {
    state = { ...freshState(saved.scene, saved.access === "readonly" ? "readonly" : "finance"), ...saved };
  }
} catch { /* The demo remains usable when browser storage is unavailable. */ }
let playerFilter = "all";
let search = "";
let selectedCharge = null;
let submittingPayment = false;
let actionResult = null;
let lastTrigger = null;
let lastActionFocus = null;
let inspectorReturnFocus = null;
const freshDraft = () => ({ chargeId: null, date: "", reason: "", dirty: false });
let draft = freshDraft();
const content = document.querySelector("#page-content");
const inspector = document.querySelector("#inspector");
const actionDialog = document.querySelector("#action-dialog");

function save() { try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* In-memory state is sufficient. */ } }
function nextPaymentTimestamp() {
  // Advance the synthetic clock on the fixture's business day, independently of the reviewer's clock.
  const latest = state.collections.reduce((value, payment) => Math.max(value, Date.parse(payment.occurredAt) || 0), Date.parse(`${businessDate}T14:00:00Z`));
  return new Date(latest + 60000).toISOString();
}
function announce(message) { document.querySelector("#announcement").textContent = message; }
function finance() { return state.access === "finance"; }
function protectedCharge(id) { return (state.scene === "unknown" && id === "tuition") || state.collections.some(payment => payment.chargeId === id && payment.status === "unknown"); }
function protectedPayment() { return protectedCharge("tuition"); }
function uncertainPayment(id) { return transactions().find(payment => payment.status === "unknown" && (payment.chargeId === id || (id === "tuition" && payment.id === "oct-attempt"))); }
function authorizedMethod() { return state.futureMethod || (state.scene === "returned" ? null : "Visa ending 4242"); }
function payerFraction() { return state.scene === "split" ? 0.7 : 1; }
function installmentAmount() { return Math.round(27500 * payerFraction()); }
function canAdjust(row) { return finance() && Boolean(row?.remaining > 0); }
function requestDateError(row, value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value <= businessDate) return `Choose a date after ${date(businessDate)}.`;
  if (row.id === "tuition" && value > tuitionFinalDate) return `Choose a date on or before ${date(tuitionFinalDate)}, the tuition final due date.`;
  return "";
}
function adjustmentCharge() { return location.hash.split("/")[1] || "clinic"; }
function requestFor(id) { return state.requests[id]; }
function canCollect(row, recharge = false) {
  if (!finance() || !row?.remaining || protectedCharge(row.id)) return false;
  if (row.share < 1 && !recharge) return false;
  return !recharge || (row.id === "tuition" && row.due === installmentAmount());
}
function paymentOptions() { return ["Visa ending 4242", "Mastercard ending 5454"]; }
function paymentStatus(payment) { return payment.status === "paid" ? "Received" : payment.status === "failed" ? "Declined" : payment.status === "returned" ? "Returned" : payment.status === "noncash" ? "Noncash reduction" : "Needs review"; }
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
    const share = row.playerKey === "ava" ? payerFraction() : 1;
    const originalTotal = row.total;
    const reduction = state.scene === "noncash" && row.id === "warmup" ? row.total : 0;
    row = { ...row, total: Math.round(row.total * share), paid: reduction ? 0 : Math.round(row.paid * share) };
    const added = Number(state.extraPaid[row.id]) || 0;
    const remaining = Math.max(0, row.total - row.paid - added - reduction);
    const due = row.id === "tuition" && !healthy ? Math.min(remaining, Math.max(0, installmentAmount() - added)) : 0;
    return { ...row, originalTotal, share, reduction, paid: row.paid + added, remaining, due, dueDate: row.id === "tuition" && remaining && !due ? "2026-11-15" : row.dueDate };
  });
}
function totals() {
  const rows = charges();
  const sum = key => rows.reduce((total, row) => total + row[key], 0);
  return { total: sum("total"), paid: sum("paid"), reduction: sum("reduction"), balance: sum("remaining"), due: rows.reduce((total, row) => total + (protectedCharge(row.id) ? 0 : row.due), 0), next: rows.find(row => row.id === "tuition")?.remaining > 0 && !protectedPayment() && authorizedMethod() ? installmentAmount() : 0 };
}
function chargeStatus(row) {
  if (row.reduction && !row.remaining) return badge("Financial aid applied", "neutral");
  if (!row.remaining) return badge("Paid", "success");
  if (row.id === "clinic") return protectedCharge(row.id) ? badge("Finance review", "warning") : badge("Needs setup", "warning");
  if (protectedCharge(row.id)) return badge("Finance review", "warning");
  if (state.scene === "returned" && row.due) return badge("ACH returned", "danger");
  if (state.scene === "returned" && !authorizedMethod()) return badge("Autopay needs setup", "warning");
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
  rows.unshift({ id: "oct-attempt", date: "2026-10-15", title: state.scene === "healthy" || state.scene === "returned" ? "Automatic payment received" : (state.scene === "unknown") ? "Automatic payment · outcome unknown" : "Automatic payment failed", amount: 27500, status: state.scene === "healthy" || state.scene === "returned" ? "paid" : (state.scene === "unknown") ? "unknown" : "failed", method: state.scene === "returned" ? "ACH ending 6789" : "Visa ending 4242", allocations: [{ title: "Season tuition · Ava Morgan", amount: 27500 }] });
  if (state.scene === "returned") rows.unshift({ id: "ach-return", date: "2026-10-20", title: "ACH payment returned", amount: 27500, status: "returned", method: "ACH ending 6789", originalId: "oct-attempt", allocations: [{ title: "Season tuition · Ava Morgan", amount: 27500 }] });
  const scopedRows = rows.filter(payment => !(state.scene === "noncash" && payment.id === "warmup-paid")).map(payment => ({ ...payment, amount: Math.round(payment.amount * (payment.id === "clinic-paid" ? 1 : payerFraction())), allocations: payment.allocations.map(allocation => ({ ...allocation, amount: Math.round(allocation.amount * payerFraction()) })) }));
  if (state.scene === "noncash") scopedRows.unshift({ id: "aid-credit", date: "2026-08-10", title: "Financial aid credit applied", amount: 8000, status: "noncash", method: "No money received", allocations: [{ title: "Warm-up top · Ava Morgan", amount: 8000 }] });
  return [...state.collections, ...scopedRows].sort((a, b) => b.date.localeCompare(a.date));
}
function route() { const value = location.hash.slice(1).split("/")[0]; return ["overview", "billing", "history", "adjustment"].includes(value) ? value : "billing"; }
function go(tab) {
  if (draft.dirty && tab !== `adjustment/${draft.chargeId}`) { confirmDiscard(() => { draft = freshDraft(); go(tab); }); return; }
  closeDialogs();
  if (location.hash.slice(1) === tab) render(); else location.hash = tab;
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
  const returnSetup = state.scene === "returned" && tuition?.remaining > 0 && !authorizedMethod();
  const returnAttention = state.scene === "returned" && (needsPayment || returnSetup);
  const needsSetup = clinic?.remaining > 0;
  const receiptFailures = state.collections.filter(payment => payment.receiptStatus === "failed");
  const clinicUnknown = uncertainPayment("clinic");
  const attentionCount = Number(needsPayment || returnSetup) + Number(needsSetup) + receiptFailures.length;
  content.innerHTML = `<div class="section-heading"><div><h2>Billing</h2><p>Understand the balance. Find the next step.</p></div><div class="button-row">${state.scene === "split" ? button("Payer responsibility", "payers") : ""}${button(`${icon("card")}Saved methods`, "methods")}${button(`${icon("history")}View history`, "history")}</div></div>
    <div class="facts" aria-label="Account billing summary">
      <div class="fact"><div class="fact-label">Balance</div><div class="fact-value" data-metric="balance">${money(total.balance)}</div><span class="fact-detail">All unpaid charges, including future payments</span></div>
      <div class="fact"><div class="fact-label">Due now</div><div class="fact-value" data-metric="due">${money(total.due)}</div><span class="fact-detail">Unpaid amounts due today or earlier · excludes protected amounts</span></div>
      <div class="fact"><div class="fact-label">Next automatic charge</div><div class="fact-value ${protectedPayment() || !total.next ? "text-value" : ""}" data-metric="next">${protectedPayment() ? "Awaiting review" : returnSetup ? "Needs setup" : total.next ? money(total.next) : "None scheduled"}</div><span class="fact-detail">${protectedPayment() ? "Collection is protected while the payment is verified" : returnSetup ? "Original dates retained · closed bank account is ineligible" : total.next ? `Nov 15 · Ava’s tuition · ${esc(authorizedMethod())}` : "No eligible automatic payment is scheduled"}</span></div>
    </div>
    <div class="facts-foot"><span>Tuition &amp; fees <strong>${money(total.total)}</strong></span><span>Paid <strong>${money(total.paid)}</strong></span>${total.reduction ? `<span>Noncash reductions <strong>${money(total.reduction)}</strong></span>` : ""}<span>${state.scene === "split" ? "Jamie’s responsibility only · Ava’s billing is split 70 / 30" : "Account totals · All players"}</span></div>
    ${attentionCount ? `<section class="section" aria-labelledby="attention-title"><div class="section-title"><h3 id="attention-title">Needs attention</h3><span class="count">${attentionCount}</span></div><div class="attention-list">
      ${needsPayment || returnAttention ? `<div class="attention-row"><span class="attention-icon">${icon("warning")}</span><div class="attention-copy"><strong>${returnAttention ? needsPayment ? `Ava’s ${money(installmentAmount())} ACH payment was returned` : "Ava’s future autopay needs a new method" : protectedPayment() ? "Confirm a payment before collecting again" : `Ava’s ${money(installmentAmount())} payment was declined`}</strong><p>${returnAttention ? "R02 · Account closed. The original payment and completed return are retained. The closed bank account cannot collect future payments." : protectedPayment() ? `${date(uncertainPayment("tuition")?.date || "2026-10-15")} payment may have been processed. The amount stays protected until Finance verifies the result.` : "The Oct 15 automatic payment failed. Review the original attempt before choosing what to do next."}</p></div>${button(returnSetup && !needsPayment ? "Change future payment method" : returnAttention ? "Review return" : "Review payment", returnSetup && !needsPayment ? "future-method" : "payment", returnSetup && !needsPayment ? "tuition" : uncertainPayment("tuition")?.id || (returnAttention ? "ach-return" : "oct-attempt"), "small-button", returnSetup && !needsPayment && !canChangeFutureMethod())}</div>` : ""}
      ${needsSetup ? `<div class="attention-row"><span class="attention-icon">${icon(clinicUnknown ? "warning" : "card")}</span><div class="attention-copy"><strong>${clinicUnknown ? "Leo’s clinic payment is awaiting confirmation" : "Leo’s clinic payment needs setup"}</strong><p>${clinicUnknown ? `${money(clinicUnknown.amount)} may have been processed. Collection stays protected while Finance checks the existing payment.` : "$240 is due Oct 30. A saved payment method alone does not authorize automatic collection."}</p></div>${button(clinicUnknown ? "Review payment" : "View charge", clinicUnknown ? "payment" : "charge", clinicUnknown?.id || "clinic", "small-button")}</div>` : ""}
    ${receiptFailures.map(payment => `<div class="attention-row"><span class="attention-icon">${icon("message")}</span><div class="attention-copy"><strong>Payment received; receipt not sent</strong><p>${esc(payment.allocations[0].title)} · ${money(payment.amount)}. Resending the receipt does not collect again.</p></div>${button("Review receipt", "payment", payment.id, "small-button")}</div>`).join("")}</div></section>` : charges().length ? `<div class="healthy-line">${icon("check")}No billing items need attention.${total.next ? " Ava’s next automatic payment is scheduled." : ""}</div>` : ""}
    ${["submit-declined", "submit-unknown", "receipt-error"].includes(state.scene) ? `<p class="small-copy">Demo outcome after your next submission: ${state.scene === "submit-declined" ? "definitive decline" : state.scene === "submit-unknown" ? "unknown processor outcome" : "payment succeeds; receipt delivery fails"}. Start with Review payment or a charge.</p>` : ""}
    ${Object.entries(state.requests).map(([id, request]) => `<div class="notice neutral">${icon("file")}<div><strong>Billing adjustment requested · ${esc(charges().find(row => row.id === id)?.title)}</strong><p>Requested ${date(request.date)} for ${esc(request.player)}. Finance has not changed the current date or balance.</p>${button("View pending request", "pending-request", id, "subtle")}</div></div>`).join("")}
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
  content.innerHTML = `<div class="section-heading"><div><h2>Account history</h2><p>Original payments, returns and adjustments keep their own evidence.</p></div>${button(`${icon("back")}Back to Billing`, "billing")}</div>${rows.length ? `<table class="history-table"><caption class="sr-only">Jamie Morgan’s billing history</caption><thead><tr><th scope="col">Date</th><th scope="col">Activity</th><th scope="col">Outcome</th><th scope="col">Amount</th></tr></thead><tbody>${rows.map(payment => `<tr><td>${date(payment.date)}${payment.occurredAt ? `<span class="stacked small">${esc(paymentTime(payment))}</span>` : ""}</td><td><button type="button" class="row-title" data-action="payment" data-id="payment:${payment.id}">${esc(payment.title)}</button><div class="row-subtitle">${payment.allocations.map(allocation => esc(allocation.title)).join(" + ")}</div><div class="row-subtitle">${esc(payment.method)}</div><div class="row-subtitle">${esc(paymentActor(payment))}</div></td><td>${badge(paymentStatus(payment), payment.status === "paid" ? "success" : ["failed", "returned"].includes(payment.status) ? "danger" : payment.status === "noncash" ? "neutral" : "warning")}</td><td class="money">${money(payment.amount)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty-state"><h3>No payment activity yet</h3><p>Confirmed payments and attempts will appear here once this account has billing activity.</p></div>`}`;
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
  const isProtected = protectedCharge(id);
  const adjustment = row.remaining > 0;
  let body = `<div class="detail-amount"><div><span class="small muted">Remaining</span><strong class="money">${money(row.remaining)}</strong></div>${chargeStatus(row)}</div><dl class="detail-list"><div><dt>Account</dt><dd>Jamie Morgan<span class="stacked">This account’s responsibility only</span></dd></div><div><dt>Player</dt><dd>${esc(row.player)}</dd></div><div><dt>Total charge</dt><dd class="money">${money(row.total)}</dd></div><div><dt>Payments applied</dt><dd class="money">${money(row.paid)}</dd></div><div><dt>${id === "tuition" ? "Next unpaid installment" : "Due date"}</dt><dd>${row.remaining || id !== "tuition" ? date(row.dueDate) : "Paid in full"}</dd></div></dl>`;
  if (row.share < 1) body += `<div class="notice neutral"><div><strong>Jamie’s 70% share</strong><p>The full charge is ${money(row.originalTotal)}. This account’s scheduled share is ${money(row.total)}. Casey’s 30% responsibility and payment methods are separate.</p>${button("View payer responsibility", "payers", "", "subtle")}</div></div>`;
  if (row.reduction) body += `<div class="notice neutral"><div><strong>${money(row.reduction)} financial aid credit applied</strong><p>No money was received. The original ${money(row.total)} charge is retained; the approved reduction settled the balance. This is not a paid receipt.</p>${button("View noncash adjustment", "payment", "aid-credit", "subtle")}</div></div>`;
  if (isProtected) body += `<div class="notice">${icon("warning")}<div><strong>Payment outcome unknown</strong><p>${money(uncertainPayment(id)?.amount || installmentAmount())} may already have been collected. Collection stays protected until Finance verifies the original result. Do not collect it again.</p>${button("Check existing payment", "payment", uncertainPayment(id)?.id || "oct-attempt", "subtle")}</div></div>`;
  else if (state.scene === "returned" && id === "tuition") body += `<div class="notice error">${icon("warning")}<div><strong>ACH account closed · R02</strong><p>The Oct 15 payment was returned on Oct 20. Its original receipt remains historical evidence. The closed bank account is ineligible; a one-time card payment does not authorize future autopay. ${authorizedMethod() ? `Future ${esc(authorizedMethod())} authorization was separately confirmed in this demo.` : "Use the separate future-method review to restore authorization."}</p></div></div>`;
  else if (row.due) body += `<div class="notice error">${icon("warning")}<div><strong>The Oct 15 payment failed</strong><p>The recorded processor result was a decline. No money was received for that attempt.</p></div></div>`;
  if (id === "clinic" && row.remaining) body += `<div class="notice neutral">${icon("card")}<div><strong>Payment setup needed</strong><p>The parent has not authorized automatic payment for this charge. Saved cards remain separate from automatic-payment authorization.</p></div></div>`;
  if (id === "tuition") {
    const paidOct = !row.due && !isProtected;
    body += `<h3>Payment schedule</h3><p class="small-copy">Original dates remain in place. Paid history is retained.${row.share < 1 ? " Amounts below are Jamie’s share only." : ""}</p>${["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15"].map((dueDate, index) => `<div class="schedule-row"><div><strong>${date(dueDate)}</strong><span class="small">${index === 0 ? paidOct ? "Paid" : isProtected ? "Awaiting Finance review" : state.scene === "returned" ? "Reopened after ACH return" : "Payment failed" : row.remaining ? isProtected ? "Collection protected · original date retained" : !authorizedMethod() ? "Needs authorized method · original date retained" : `Automatic payment · ${esc(authorizedMethod())}` : "Paid"}</span></div><span class="money">${money(installmentAmount())}</span></div>`).join("")}`;
    body += `<div class="detail-action">${button(state.scene === "returned" ? "Review ACH return" : "Review Oct 15 payment", "payment", state.scene === "returned" ? "ach-return" : "oct-attempt", "subtle")}</div>`;
  } else if (!row.remaining && !row.reduction) {
    const sourcePayment = transactions().find(payment => payment.status === "paid" && payment.allocations.some(allocation => allocation.title === `${row.title} · ${row.player}`));
    body += `<h3>Payment activity</h3><div class="activity-row"><div><strong>Payment received</strong><span class="small">${sourcePayment ? `${date(sourcePayment.date)} · ${esc(sourcePayment.method)}` : "Confirmed payment history"}</span></div><span class="money">${money(row.total)}</span></div>${sourcePayment ? button("View original payment", "payment", `payment:${sourcePayment.id}`, "subtle detail-action") : ""}`;
  }
  if (id === "tuition" && state.scene === "returned" && row.remaining) body += `<div class="detail-action">${button("Change future payment method", "future-method", "tuition", "", !canChangeFutureMethod())}</div>`;
  if (requestFor(id)) body += `<div class="notice neutral"><div><strong>Due-date request pending</strong><p>Requested ${date(requestFor(id).date)}. The current date and amount remain unchanged until an authorized Finance decision.</p></div></div>`;
  if (!finance()) body += `<div class="notice neutral">You have view-only access. Payment and adjustment actions require the relevant Finance permission.</div>`;
  if (row.remaining && row.share < 1) body += `<div class="notice neutral">Obligation-wide collection is unavailable for split billing. Review the original failed payment to recover only this account’s exact payment group.</div>`;
  if (row.remaining && id === "tuition") body += `<p class="small-copy detail-action">Collect remaining balance includes future installments. Recovering the original payment collects only its unpaid ${money(installmentAmount())}.</p>`;
  openInspector(`${row.player} · ${row.context}`, row.title, body, `${adjustment ? requestFor(id) ? button("View pending request", "pending-request", id) : button("Request billing adjustment", "adjust", id, "", !canAdjust(row)) : ""}${row.remaining ? button(`Collect remaining ${money(row.remaining)}`, "collect", id, "primary", !canCollect(row)) : button("Close", "close-inspector")}`);
}
function findPayment(id) { return transactions().find(payment => payment.id === id.replace(/^payment:/, "")); }
function showPayment(id) {
  const payment = findPayment(id);
  if (!payment) return;
  if (payment.status === "noncash") {
    openInspector("Warm-up top · Ava Morgan", "Financial aid credit applied", `<div class="detail-amount"><div><span class="small muted">Noncash reduction</span><strong class="money">${money(payment.amount)}</strong></div>${badge("Applied", "neutral")}</div><dl class="detail-list"><div><dt>Original charge</dt><dd>${money(8000)}</dd></div><div><dt>Money received</dt><dd>${money(0)}</dd></div><div><dt>Remaining</dt><dd>${money(0)}</dd></div><div><dt>Approved and applied</dt><dd>Aug 10, 2026 · Alex Lee, Finance</dd></div><div><dt>Audit reference</dt><dd>DEMO-AID-001</dd></div></dl><div class="notice neutral">Approved financial aid reduced what Jamie owes. The original charge and approval evidence remain visible. No payment or payment receipt was created.</div>`, button("View original charge", "charge", "warmup"));
    return;
  }
  if (payment.status === "returned") {
    const tuition = charges().find(row => row.id === "tuition");
    openInspector("Account history · Jamie Morgan", "ACH payment returned", `<div class="detail-amount"><div><span class="small muted">Balance reopened</span><strong class="money">${money(payment.amount)}</strong></div>${badge("Completed return", "danger")}</div><dl class="detail-list"><div><dt>Original payment</dt><dd>Oct 15, 2026 · DEMO-OCT-ATTEMPT</dd></div><div><dt>Return received</dt><dd>Oct 20, 2026 · DEMO-ACH-RETURN</dd></div><div><dt>Bank result</dt><dd>R02 · Account closed</dd></div><div><dt>Original method</dt><dd>ACH ending 6789</dd></div><div><dt>Billing affected</dt><dd>Ava Morgan · Season tuition</dd></div></dl><div class="notice error">This completed return reopened the original ${money(payment.amount)} balance. The original receipt is historical evidence, not confirmation that this amount is still paid.</div><div class="notice neutral">The closed bank account is unavailable for collection. A consented one-time card payment leaves future autopay unchanged; ${state.futureMethod ? `a separate ${esc(state.futureMethod)} future authorization is now recorded in this demo.` : "the parent must authorize an eligible future method separately."} No return fee has been added in this example.</div>${button("View original payment", "payment", "oct-attempt", "subtle")}${tuition.due ? "" : `<div class="notice success">A separate replacement payment is recorded in Account history. The return and original payment remain unchanged.</div>`}`, `${button("Close", "close-inspector")}${tuition.due ? button(`Recharge returned ${money(tuition.due)}`, "recharge", "tuition", "primary", !canCollect(tuition, true)) : `${button("View account history", "history")}${!authorizedMethod() && tuition.remaining ? button("Change future payment method", "future-method", "tuition", "primary", !canChangeFutureMethod()) : ""}`}`);
    return;
  }
  if (payment.id === "oct-attempt") { selectedCharge = "tuition"; renderCharges(); }
  const unknown = payment.status === "unknown";
  const failed = payment.status === "failed";
  let body = `<div class="detail-amount"><div><span class="small muted">${payment.status === "paid" ? "Money received" : "Attempted amount"}</span><strong class="money">${money(payment.amount)}</strong></div>${badge(unknown ? "Outcome unknown" : failed ? "Declined" : "Received", unknown ? "warning" : failed ? "danger" : "success")}</div><dl class="detail-list"><div><dt>Date and time</dt><dd>${date(payment.date)} · ${esc(paymentTime(payment))}</dd></div><div><dt>Initiated by</dt><dd>${esc(paymentActor(payment))}</dd></div><div><dt>Account</dt><dd>Jamie Morgan</dd></div><div><dt>Payment method</dt><dd>${esc(payment.method)}</dd></div><div><dt>Source</dt><dd>${payment.id === "oct-attempt" ? "ClubPortal auto-pay" : payment.title.startsWith("Staff") ? "Staff payment" : payment.title.startsWith("Automatic") ? "ClubPortal auto-pay" : "Parent payment"}</dd></div><div><dt>Transaction reference</dt><dd>${unknown ? "Not received" : failed ? "Declined attempt" : `DEMO-${esc(payment.id.toUpperCase())}`}</dd></div></dl>`;
  if (failed) body += `<div class="notice error">${icon("warning")}<div><strong>No money was collected by this attempt</strong><p>The recorded result was “Insufficient funds.” This attempt did not collect money. Later payments are recorded separately in history.</p></div></div>`;
  if (unknown) body += `<div class="notice">${icon("warning")}<div><strong>Do not collect this amount again</strong><p>A missing transaction reference does not prove the payment failed. The ${money(payment.amount)} remains protected until the original payment can be verified.</p></div></div>`;
  body += `<h3>${payment.status === "paid" ? "Applied to" : "Intended billing"}</h3>${payment.allocations.map(allocation => `<div class="allocation"><span>${esc(allocation.title)}</span><strong class="money">${money(allocation.amount)}</strong></div>`).join("")}`;
  if (unknown) {
    body += `<h3>Finance review</h3><p class="small-copy">Verify the existing attempt. This action never submits another payment.</p>${finance() ? `<form id="verify-form" data-payment="${esc(payment.id)}" novalidate><div id="verify-error" class="field-error" role="alert"></div><div class="form-field"><label for="review-reason">Review reason</label><textarea id="review-reason" name="reason" aria-describedby="review-help" required>${esc(state.reviews[payment.id] || "")}</textarea><span id="review-help" class="small-copy">At least 10 characters describing the evidence checked.</span></div></form>` : `<div class="notice neutral">Finance approval permission is required to verify and resolve this payment.</div>`}`;
    if (state.reviews[payment.id]) body += `<div class="notice" role="status"><div><strong>Amount remains protected</strong><p>This demo’s verification returned no conclusive result. An empty search cannot release protection. No balance or schedule was changed.</p></div></div>`;
  }
  if (payment.status === "paid") body += `<p class="small-copy detail-action">This receipt represents the original payment once, including every application above.</p>`;
  if (state.scene === "returned" && payment.id === "oct-attempt") body += `<div class="notice error"><div><strong>Returned on Oct 20 · R02</strong><p>This is the original receipt. A separate completed return reopened its amount.</p>${button("View linked ACH return", "payment", "ach-return", "subtle")}</div></div>`;
  if (!finance() && failed) body += `<div class="notice neutral">You have view-only access. Collection requires the relevant Finance permission.</div>`;
  const alreadyRecharged = payment.id === "oct-attempt" && failed && charges().find(row => row.id === "tuition")?.due === 0;
  if (alreadyRecharged) body += `<div class="notice success"><div><strong>A replacement payment was received</strong><p>The original decline is retained. View Account history for the separate successful staff payment.</p></div></div>`;
  const action = unknown ? button("Check original payment", "verify", payment.id, "primary", !finance()) : failed && payment.id === "oct-attempt" && !alreadyRecharged ? button(`Recharge original ${money(payment.amount)}`, "recharge", "tuition", "primary", !canCollect(charges().find(row => row.id === "tuition"), true)) : failed ? button("Review current charge", "charge", payment.chargeId || "tuition", "primary") : payment.status === "paid" ? button("View receipt", "receipt", payment.id, "primary") : button("View account history", "history");
  if (payment.receiptStatus) body += `<div class="notice ${payment.receiptStatus === "failed" ? "error" : "neutral"}"><div><strong>${payment.receiptStatus === "failed" ? "Payment received; receipt not sent" : "Receipt delivered in this demo"}</strong><p>${payment.receiptStatus === "failed" ? "The financial result is complete. Resend this receipt without collecting again." : "Receipt delivery is separate from the recorded payment."}</p></div></div>`;
  openInspector("Account history · Jamie Morgan", payment.title, body, `${button("Close", "close-inspector")}${payment.receiptStatus === "failed" ? button("Resend receipt", "resend-receipt", payment.id, "", !finance()) : ""}${action}`);
}
function showMethods() {
  const tuition = charges().find(row => row.id === "tuition");
  const current = authorizedMethod();
  openInspector("Jamie Morgan · Account-wide", "Saved payment methods", `<p class="small-copy">A saved method is available for an eligible payment. It does not, by itself, authorize collection.${state.scene === "split" ? " Only Jamie’s methods are shown; Casey’s methods and authorizations remain separate." : ""}</p>${paymentOptions().map((method, index) => `<div class="method">${icon("card")}<div><strong>${esc(method)}</strong><p>Expires ${index ? "03/2029" : "08/2028"}</p><p>${tuition?.remaining && current === method ? "Authorized for Ava’s tuition automatic payments." : "Saved only. Available for an eligible one-time payment with exact consent."}</p></div></div>`).join("")}${state.scene === "returned" ? `<div class="method">${icon("card")}<div><strong>ACH ending 6789 · Ineligible</strong><p>R02 · Account closed. Not offered for collection.</p></div></div>` : ""}<div class="notice neutral">One-time collection and future automatic authorization are separate.${!finance() ? " Finance permission is required to change the future method." : requestFor("tuition") ? " A tuition request is pending; finish its Finance review before changing the future method." : ""}${state.scene === "returned" && tuition?.remaining ? current ? ` ${esc(current)} was separately authorized for future tuition in this demo; the original returned payment remains unchanged.` : " Continue to Ava’s separate future-method review. No payment is charged by that action." : ""}</div>`, `${button("Close", "close-inspector")}${state.scene === "returned" && tuition?.remaining ? button("Change future payment method", "future-method", "tuition", "primary", !canChangeFutureMethod()) : ""}`);
}
function showPayers() {
  if (state.scene !== "split") return;
  const tuition = charges().find(row => row.id === "tuition");
  openInspector("Ava Morgan · Season tuition", "Payer responsibility", `<p class="small-copy">The original tuition is ${money(360000)}. Each account owns its scheduled share, payment history and authorization.</p><dl class="detail-list"><div><dt>Jamie Morgan · current account</dt><dd>70% · ${money(252000)}</dd></div><div><dt>Jamie’s remaining tuition</dt><dd>${money(tuition.remaining)}</dd></div><div><dt>Casey Morgan · separate account</dt><dd>30% · ${money(108000)}</dd></div></dl><div class="notice neutral">Account totals above include Jamie’s scheduled shares only. Casey’s amounts are not collectible from Jamie’s account, and their payment methods are not shown here. Player access and financial responsibility remain separate.</div>`, button("View Jamie’s tuition", "charge", "tuition"));
}
function canChangeFutureMethod() {
  return finance() && state.scene === "returned" && charges().some(row => row.id === "tuition" && row.remaining > 0) && !protectedPayment() && !requestFor("tuition");
}
function showFutureMethod() {
  if (!canChangeFutureMethod()) return;
  const row = charges().find(item => item.id === "tuition");
  const choices = paymentOptions().filter(method => method !== authorizedMethod());
  showAction("Change future payment method", `<form id="future-method-form" data-remaining="${row.remaining}" novalidate><p class="small-copy">Jamie Morgan · Ava Morgan · 2026–27 National · Season tuition</p><div class="notice neutral">This is a separate future authorization. It does not collect the returned payment or any other money.</div><dl class="detail-list"><div><dt>Current method</dt><dd>${esc(authorizedMethod() || "ACH ending 6789 · closed and ineligible")}</dd></div><div><dt>Current remaining balance</dt><dd>${money(row.remaining)}</dd></div><div><dt>After method change</dt><dd>${money(row.remaining)}</dd></div><div><dt>Price / processing fee change</dt><dd>$0.00 / $0.00</dd></div></dl><div class="form-field"><label for="future-method">Eligible future method</label><select id="future-method" name="method">${choices.map(method => `<option>${esc(method)}</option>`).join("")}</select></div><h3>Unpaid schedule retained</h3><p class="small-copy">This example uses one published amount for both rails. Paid history, amounts and dates stay unchanged. An overdue balance is not charged by this action.</p>${["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15"].filter((_, index) => index > 0 || row.due > 0).map(dueDate => `<div class="schedule-row"><span>${date(dueDate)}</span><span class="money">${money(installmentAmount())}</span></div>`).join("")}<label class="checkbox-label" for="future-consent"><input type="checkbox" id="future-consent" name="consent" aria-describedby="future-error"><span>Jamie Morgan confirmed by phone or in person that they authorize <strong id="future-consent-method">${esc(choices[0])}</strong> for Ava’s tuition and the reviewed prices and schedule. This is separate from one-time payment consent.</span></label><div id="future-error" class="field-error" role="alert"></div><p class="small-copy detail-action">Synthetic authorization only. No real payment method or provider service is used.</p></form>`, `${button("Cancel", "close-action")}<button type="submit" class="button primary" form="future-method-form">Save future method</button>`);
}
function saveFutureMethod(form) {
  const row = charges().find(item => item.id === "tuition");
  if (!canChangeFutureMethod() || Number(form.dataset.remaining) !== row.remaining || !paymentOptions().includes(form.elements.method.value) || form.elements.method.value === authorizedMethod()) {
    document.querySelector("#future-error").textContent = "This review is no longer current. Close it and review the future method again."; return;
  }
  if (!form.elements.consent.checked) {
    document.querySelector("#future-error").textContent = "Confirm the account holder authorized this separate future method and reviewed schedule.";
    form.elements.consent.setAttribute("aria-invalid", "true"); form.elements.consent.focus(); return;
  }
  state.futureMethod = form.elements.method.value; save(); render();
  actionResult = { kind: "methods" };
  document.querySelector("#action-title").textContent = "Future method updated";
  document.querySelector("#action-body").innerHTML = `<div class="notice success"><div><strong>${esc(state.futureMethod)} authorized in this demo</strong><p>Jamie Morgan · Ava Morgan · Season tuition. No payment was charged; balance, prices, dates and paid history are unchanged.</p></div></div><p class="small-copy">The returned payment remains separate. The next eligible automatic charge uses the new method.</p>`;
  document.querySelector("#action-footer").innerHTML = button("Done", "close-action", "", "primary");
  document.querySelector("#action-footer button").focus();
  announce("Future method updated in this demo. No money collected.");
}
function adjustmentSummary(request) {
  return `<p class="small-copy">${esc(request.player)} · ${esc(request.title)} · Jamie Morgan${request.share < 1 ? " · this account’s share only" : ""}</p><dl class="detail-list detail-action"><div><dt>Payment affected</dt><dd>${money(request.paymentAmount)}</dd></div><div><dt>Current due date</dt><dd>${date(request.currentDate)}</dd></div><div><dt>Requested due date</dt><dd>${date(request.date)}</dd></div><div><dt>Decision</dt><dd>Awaiting Finance review</dd></div></dl><h3>Reason</h3><p>${esc(request.reason)}</p><div class="notice neutral">This request has not changed the balance, total owed, or payment schedule. The selected charge and original terms remain part of the review history.</div>`;
}
function showPendingRequest(id) {
  const request = requestFor(id);
  if (!request) return;
  showAction("Pending billing adjustment", adjustmentSummary(request), button("Close request", "close-action"));
}
function showAction(title, body, footer) {
  document.querySelector("#action-title").textContent = title;
  document.querySelector("#action-body").innerHTML = body;
  document.querySelector("#action-footer").innerHTML = footer;
  actionDialog.showModal();
}
function collect(id, recharge = false) {
  const row = charges().find(item => item.id === id);
  if (!canCollect(row, recharge)) return;
  const amount = recharge ? installmentAmount() : row.remaining;
  const title = recharge ? `Recharge original ${money(amount)}` : `Collect remaining ${money(amount)}`;
  const scope = recharge ? "Only the complete original payment group for this account is collected. The original result stays in history." : id === "tuition" ? "This collects the full remaining tuition balance, including future installments. It is not limited to the amount due now." : "This collects this charge’s complete remaining balance.";
  showAction(title, `<form id="collect-form" data-charge="${id}" data-amount="${amount}" data-recharge="${recharge}" novalidate><p class="small-copy">${esc(row.player)} · ${esc(row.title)}${row.share < 1 ? " · Jamie’s 70% share" : ""}</p><div class="notice neutral">${scope}</div><dl class="detail-list detail-action"><div><dt>One-time amount</dt><dd class="money">${money(amount)}</dd></div><div><dt>Account holder</dt><dd>Jamie Morgan</dd></div></dl><div class="form-field"><label for="payment-method">Saved payment method</label><select id="payment-method" name="method">${paymentOptions().map(method => `<option>${method}</option>`).join("")}</select></div><label class="checkbox-label" for="consent"><input type="checkbox" id="consent" name="consent" aria-describedby="consent-error"><span id="consent-copy">I confirm Jamie Morgan authorized a one-time charge of <strong>${money(amount)}</strong> to <span id="consent-method">Visa ending 4242</span>. This does not change future autopay.</span></label><div id="consent-error" class="field-error" role="alert"></div><div class="notice neutral">This is a simulated payment. No real payment method or provider service will be used.</div></form>`, `${button("Cancel", "close-action")}<button class="button primary" type="submit" form="collect-form">${recharge ? "Recharge" : "Collect"} ${money(amount)}</button>`);
}
function completeCollection(form) {
  if (submittingPayment) return;
  const id = form.dataset.charge;
  const row = charges().find(item => item.id === id);
  const amount = Number(form.dataset.amount);
  const recharge = form.dataset.recharge === "true";
  if (!canCollect(row, recharge) || amount !== (recharge ? installmentAmount() : row.remaining) || !paymentOptions().includes(form.elements.method.value)) {
    document.querySelector("#consent-error").textContent = "Billing or payment eligibility changed. Close this dialog and review the current charge.";
    return;
  }
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
    const status = state.scene === "submit-declined" ? "failed" : state.scene === "submit-unknown" ? "unknown" : "paid";
    if (status === "paid") state.extraPaid[id] = (Number(state.extraPaid[id]) || 0) + amount;
    const payment = { id: `staff-${state.collections.length + 1}`, chargeId: id, date: businessDate, title: status === "failed" ? "Staff payment declined" : status === "unknown" ? "Staff payment · awaiting confirmation" : recharge ? "Staff recharge received" : "Staff payment received", amount, status, actor: "Alex Lee", occurredAt: nextPaymentTimestamp(), method: form.elements.method.value, allocations: [{ title: `${row.title} · ${row.player}`, amount }], recharge, receiptStatus: status === "paid" ? state.scene === "receipt-error" ? "failed" : "sent" : null };
    state.collections.unshift(payment); save(); render();
    actionResult = { kind: "payment", id: payment.id };
    document.querySelector("#action-title").textContent = status === "failed" ? "Payment declined" : status === "unknown" ? "Payment awaiting confirmation" : payment.receiptStatus === "failed" ? "Payment received; receipt not sent" : "Payment completed";
    document.querySelector("#action-body").innerHTML = status === "paid"
      ? `<div class="notice success">${icon("check")}<div><strong>${money(amount)} received in this demo</strong><p>The payment has been applied to ${esc(row.title)}. The original history is retained.</p></div></div>${payment.receiptStatus === "failed" ? `<div class="notice error"><div><strong>Receipt delivery failed</strong><p>The payment is complete. Resend its receipt from payment details; do not collect again.</p></div></div>` : ""}<p class="small-copy">No real money was collected. Future autopay authorization and payment-method selection were not changed.</p>`
      : status === "failed" ? `<div class="notice error"><div><strong>No money was received</strong><p>The processor definitively declined this simulated attempt. Balance and schedule are unchanged. Review the current charge and confirm the exact amount and method again before another attempt.</p></div></div>`
        : `<div class="notice"><div><strong>Do not submit another payment</strong><p>The response was interrupted after simulated submission. ${money(amount)} may have been processed and remains protected for Finance review. No money is recorded as received; balance and contractual dates are unchanged.</p></div></div>`;
    document.querySelector("#action-footer").innerHTML = button(status === "paid" ? "Done" : "Review payment", "close-action", "", "primary");
    submittingPayment = false;
    actionDialog.querySelector('[data-close="action-dialog"]').disabled = false;
    document.querySelector('#action-footer button').focus();
    announce(status === "paid" ? `Simulated payment received: ${money(amount)}.${payment.receiptStatus === "failed" ? " Receipt not sent." : ""}` : status === "failed" ? "Simulated payment declined. No money received." : "Payment awaiting confirmation. Do not collect again.");
  }, 450);
}
function finishActionResult() {
  const result = actionResult; actionResult = null;
  if (!result) return false;
  if (result.kind === "payment") showPayment(result.id); else showMethods();
  return true;
}
function resendReceipt(id) {
  const payment = state.collections.find(item => item.id === id);
  if (!finance() || payment?.status !== "paid" || payment.receiptStatus !== "failed") return;
  payment.receiptStatus = "sent"; save(); render(); showPayment(id);
  announce("Receipt resent in this demo. No payment was submitted.");
}
function verifyPayment(id = document.querySelector("#verify-form")?.dataset.payment) {
  if (!finance()) return;
  const field = document.querySelector("#review-reason");
  if (!field || field.value.trim().length < 10) {
    document.querySelector("#verify-error").textContent = "Enter a review reason of at least 10 characters.";
    field?.setAttribute("aria-invalid", "true"); field?.focus(); return;
  }
  if (!findPayment(id) || findPayment(id).status !== "unknown") return;
  state.reviews[id] = field.value; save(); showPayment(id);
  announce("No conclusive verification result. The amount remains protected.");
}
function receipt(id) {
  const payment = findPayment(id);
  if (payment?.status !== "paid") return;
  showAction("Payment receipt", `<p class="small-copy">North Valley Volleyball · Synthetic receipt</p><div class="detail-amount detail-action"><div><span class="small muted">Original payment received</span><strong class="money">${money(payment.amount)}</strong></div>${badge("Received", "success")}</div>${state.scene === "returned" && payment.id === "oct-attempt" ? `<div class="notice error">This original payment was returned on Oct 20. This receipt preserves the original collection; it does not confirm a current paid balance.</div>` : ""}<dl class="detail-list"><div><dt>Account</dt><dd>Jamie Morgan</dd></div><div><dt>Date</dt><dd>${date(payment.date)}</dd></div><div><dt>Original method</dt><dd>${esc(payment.method)}</dd></div></dl><h3>Payment applications</h3>${payment.allocations.map(allocation => `<div class="allocation"><span>${esc(allocation.title)}</span><strong class="money">${money(allocation.amount)}</strong></div>`).join("")}<p class="small-copy detail-action">One payment, shown once. The original method and applications remain part of its history.</p>`, button("Close receipt", "close-action"));
}
function renderAdjustment() {
  const id = adjustmentCharge();
  const row = charges().find(item => item.id === id);
  if (!row || !finance()) { go("billing"); return; }
  const request = requestFor(id);
  if (request) {
    content.innerHTML = `<div class="form-page">${button(`${icon("back")}Back to Billing`, "billing", "", "subtle")}<div class="section-heading"><h2>Billing adjustment pending</h2></div><div class="form-panel">${adjustmentSummary(request)}</div></div>`;
    return;
  }
  if (!canAdjust(row)) {
    content.innerHTML = `<div class="form-page">${button(`${icon("back")}Back to Billing`, "billing", "", "subtle")}<h2>No unpaid payment to reschedule</h2><p>${esc(row.player)} · ${esc(row.title)}</p><div class="notice neutral">This charge has no remaining unpaid balance. A due-date request is unavailable. Its payment and adjustment history remain unchanged.</div></div>`;
    return;
  }
  if (draft.chargeId !== id) draft = { ...freshDraft(), chargeId: id };
  const paymentAmount = row.id === "tuition" ? Math.min(installmentAmount(), row.remaining) : row.remaining;
  content.innerHTML = `<div class="form-page">${button(`${icon("back")}Back to Billing`, "billing", "", "subtle")}<div class="section-heading"><div><h2>Request a billing adjustment</h2><p>${esc(row.player)} · ${esc(row.title)} · Jamie Morgan${row.share < 1 ? " · 70% share" : ""}</p></div></div><div class="form-panel"><dl class="detail-list"><div><dt>Change requested</dt><dd>Change payment due date</dd></div><div><dt>Payment affected</dt><dd class="money">${money(paymentAmount)}${row.id === "tuition" ? " · next unpaid installment only" : ""}</dd></div><div><dt>Remaining charge balance</dt><dd class="money">${money(row.remaining)}</dd></div><div><dt>Current due date</dt><dd>${date(row.dueDate)}</dd></div></dl><form id="adjustment-form" data-charge="${row.id}" data-current-date="${row.dueDate}" novalidate><div id="adjustment-error" class="field-error" role="alert"></div><div class="form-field"><label for="requested-date">Requested due date <span class="muted">(required)</span></label><input type="date" id="requested-date" name="date" value="${esc(draft.date)}" min="${earliestRequestDate}"${row.id === "tuition" ? ` max="${tuitionFinalDate}"` : ""} aria-describedby="requested-date-help requested-date-error" required><p id="requested-date-help" class="small-copy">After ${date(businessDate)}${row.id === "tuition" ? ` and on or before ${date(tuitionFinalDate)}` : " · only this one-time charge changes"}.</p><p id="requested-date-error" class="field-error"></p></div><div class="form-field"><label for="adjustment-reason">Reason for the request <span class="muted">(required)</span></label><textarea id="adjustment-reason" name="reason" aria-describedby="adjustment-reason-error" required>${esc(draft.reason)}</textarea><p id="adjustment-reason-error" class="field-error"></p></div><div class="notice neutral">Finance reviews this request before any change is applied. Submitting it does not move a due date, change the total owed, or record a payment. Other charges and installments retain their dates.</div><div class="form-actions">${button("Cancel", "billing")}<button class="button primary" type="submit">Submit request</button></div></form></div></div>`;
}
function submitAdjustment(form) {
  const row = charges().find(item => item.id === form.dataset.charge);
  if (!canAdjust(row) || requestFor(row?.id) || form.dataset.charge !== adjustmentCharge() || form.dataset.currentDate !== row?.dueDate) {
    document.querySelector("#adjustment-error").textContent = "This payment is no longer eligible for this request. Return to Billing and review the current charge.";
    return;
  }
  const fields = [form.elements.date, form.elements.reason];
  fields.forEach(field => { field.removeAttribute("aria-invalid"); document.getElementById(`${field.id}-error`).textContent = ""; });
  const dateError = requestDateError(row, form.elements.date.value);
  if (dateError) {
    document.querySelector("#adjustment-error").textContent = dateError;
    document.querySelector("#requested-date-error").textContent = dateError;
    form.elements.date.setAttribute("aria-invalid", "true"); form.elements.date.focus(); return;
  }
  const invalid = fields.filter(field => !field.value.trim() || (field.name === "date" && !field.validity.valid));
  if (invalid.length) {
    document.querySelector("#adjustment-error").textContent = "Choose a valid requested date and explain the request.";
    invalid.forEach(field => { field.setAttribute("aria-invalid", "true"); document.getElementById(`${field.id}-error`).textContent = field.name === "date" ? "Choose a valid requested payment due date." : "Explain why the due date should change."; }); invalid[0].focus(); return;
  }
  state.requests[row.id] = { chargeId: row.id, player: row.player, title: row.title, share: row.share, currentDate: row.dueDate, paymentAmount: row.id === "tuition" ? Math.min(installmentAmount(), row.remaining) : row.remaining, date: form.elements.date.value, reason: form.elements.reason.value.trim() };
  draft = freshDraft(); save(); go("billing"); announce("Billing adjustment request submitted for Finance review. Balance and due date unchanged.");
}
function confirmDiscard(proceed) {
  if (actionDialog.open) return;
  showAction("Discard this request?", "<p>Your changes have not been submitted. Stay to finish the request, or discard the unsaved changes.</p>", `${button("Stay", "close-action")}<button type="button" class="button primary" id="discard-request">Discard changes</button>`);
  document.querySelector("#discard-request").onclick = () => { actionDialog.close(); proceed(); };
}
function closeDialogs() { actionResult = null; if (actionDialog.open) actionDialog.close(); if (inspector.open) inspector.close(); }
function handleAction(action, id) {
  switch (action) {
    case "billing": go("billing"); break;
    case "history": go("history"); break;
    case "charge": showCharge(id); break;
    case "payment": showPayment(id); break;
    case "methods": showMethods(); break;
    case "collect": collect(id); break;
    case "recharge": collect(id, true); break;
    case "verify": verifyPayment(id); break;
    case "receipt": receipt(id); break;
    case "resend-receipt": resendReceipt(id); break;
    case "future-method": showFutureMethod(); break;
    case "adjust": closeDialogs(); go(`adjustment/${id}`); break;
    case "pending-request": showPendingRequest(id); break;
    case "payers": showPayers(); break;
    case "close-inspector": inspector.close(); break;
    case "close-action": if (!submittingPayment) actionDialog.close(); break;
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
  else if (event.target.id === "future-method-form") saveFutureMethod(event.target);
  else if (event.target.id === "adjustment-form") submitAdjustment(event.target);
  else if (event.target.id === "verify-form") verifyPayment();
});
document.addEventListener("input", event => {
  if (event.target.id === "charge-search") { search = event.target.value; renderCharges(); }
  if (["requested-date", "adjustment-reason"].includes(event.target.id)) {
    draft = { chargeId: document.querySelector("#adjustment-form").dataset.charge, date: document.querySelector("#requested-date").value, reason: document.querySelector("#adjustment-reason").value, dirty: true };
    event.target.removeAttribute("aria-invalid");
    document.getElementById(`${event.target.id}-error`).textContent = "";
    if (draft.date && draft.reason.trim() && document.querySelector("#requested-date").validity.valid) document.querySelector("#adjustment-error").textContent = "";
  }
  if (event.target.id === "review-reason") { event.target.removeAttribute("aria-invalid"); document.querySelector("#verify-error").textContent = ""; }
  if (["consent", "future-consent"].includes(event.target.id)) { event.target.removeAttribute("aria-invalid"); document.querySelector(event.target.id === "future-consent" ? "#future-error" : "#consent-error").textContent = ""; }
});
document.addEventListener("change", event => {
  if (event.target.id === "player-filter") { playerFilter = event.target.value; renderCharges(); }
  if (event.target.id === "payment-method") { document.querySelector("#consent-method").textContent = event.target.value; document.querySelector("#consent").checked = false; }
  if (event.target.id === "future-method") {
    document.querySelector("#future-consent-method").textContent = event.target.value;
    document.querySelector("#future-consent").checked = false;
  }
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
actionDialog.addEventListener("close", () => { if (finishActionResult()) return; if (!inspector.open) lastTrigger?.isConnected && lastTrigger.focus(); });
actionDialog.addEventListener("cancel", event => { if (submittingPayment) event.preventDefault(); });
for (const dialog of [inspector, actionDialog]) dialog.addEventListener("click", event => { if (dialog === actionDialog && submittingPayment) return; if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
window.addEventListener("hashchange", () => {
  if (draft.dirty && (route() !== "adjustment" || adjustmentCharge() !== draft.chargeId)) { const target = location.hash.slice(1); history.replaceState(null, "", `#adjustment/${draft.chargeId}`); confirmDiscard(() => { draft = freshDraft(); go(target); }); return; }
  closeDialogs(); render(); const heading = content.querySelector("h2"); if (heading) { heading.tabIndex = -1; heading.focus(); }
});
window.addEventListener("beforeunload", event => { if (draft.dirty) { event.preventDefault(); event.returnValue = ""; } });
save();
setTimeout(render, 120);
