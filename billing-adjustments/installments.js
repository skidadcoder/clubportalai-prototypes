"use strict";

const byId = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const money = (cents) => currency.format(cents / 100);
const dollars = (cents) => (cents / 100).toFixed(2);
const day = (date) => dateFormat.format(new Date(date + "T00:00:00Z"));
const validDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date);

function cents(value) {
  const match = /^(\d{0,7})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!match || (!match[1] && !match[2])) return null;
  return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
}

const row = (id, date, amount, state = null, name = "Installment " + id) => ({ id, name, date, amount, state });
const fixtures = {
  tuition: {
    rows: Array.from({ length: 10 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 9 + index, 15)).toISOString().slice(0, 10);
      return row(index + 1, date, 42000, index === 0 ? "Paid" : null);
    }),
  },
  clinic: { rows: [row(1, "2026-12-05", 24000, null, "One-time payment")] },
  travel: { rows: [
    { ...row(1, "2026-11-01", 8000, "Paid", "Installment 1 · received"), partialInstallment: "Installment 1" },
    { ...row(2, "2026-11-01", 4000, null, "Installment 1 · remaining"), partialInstallment: "Installment 1" },
    row(3, "2026-11-06", 12000, "Processing", "Installment 2"),
    row(4, "2027-01-10", 22000, null, "Installment 3"),
  ] },
  paid: { closed: true, rows: [
    row(1, "2026-10-05", 10000, "Paid"),
    row(2, "2026-11-05", 10000, "Paid"),
  ] },
};

const correctionReason = ["Correction", "Billing error"];
const balanceReasons = [
  correctionReason,
  ["additional_fee", "Additional fee"],
  ["scholarship_adjustment", "Scholarship adjustment"],
  ["uniform_tournament_charge", "Uniform/tournament charge"],
];
const reductionReasons = [
  ["sibling_discount", "Sibling discount"],
  ["coach_staff_discount", "Coach/staff discount"],
  ["early_bird_discount", "Early-bird discount"],
  ["scholarship", "Scholarship"],
  ["financial_aid", "Financial aid"],
  ["manual_discount", "Manual discount"],
  ["waiver", "Fee waiver approved"],
];
const scheduleReasons = [
  ["family_payment_arrangement", "Payment arrangement with family"],
  ["payment_declined", "Payment declined"],
];

const staffReasonsKey = "club-ops.installment-prototype.staff-reasons";
let staffReasons = readStaffReasons();
const savedBills = new Map(Object.entries(fixtures));
const differenceRow = byId("difference-panel");
let billKey, saved, draft, nextId, reasonDirection, targetOwed, differenceAnchor, repeatInterval;
// The last schedule that matched the amount owed. Cancel in the difference panel returns to it.
let balancedDraft;
let differenceReview;

const editable = () => draft.filter((entry) => !entry.state);
const owed = (entries) => entries.reduce((total, entry) => {
  if (entry.state === "Paid") return total;
  const amount = typeof entry.amount === "number" ? entry.amount : cents(entry.amount);
  return total + (amount ?? 0);
}, 0);
const lockedAmount = (state) => draft.filter((entry) => entry.state === state)
  .reduce((sum, entry) => sum + cents(entry.amount), 0);
const changed = () => targetOwed !== owed(saved.rows) || draft.length !== saved.rows.length || draft.some((entry, index) => {
  const original = saved.rows[index];
  return entry.id !== original?.id || entry.date !== original.date || cents(entry.amount) !== original.amount;
});

// Keep focused fields clear of the sticky footer, which grows when it shows a message.
function reserveFooterSpace() {
  const bar = byId("save-bar");
  document.documentElement.style.scrollPaddingBottom = bar.hidden ? "" : bar.offsetHeight + 16 + "px";
}

function showError(message = "") {
  byId("error").textContent = message;
  byId("save-status").textContent = "";
  reserveFooterSpace();
}

function announce(message, saved = false) {
  const status = byId("save-status");
  status.classList.toggle("saved", saved);
  status.textContent = message;
  reserveFooterSpace();
}

window.addEventListener("resize", reserveFooterSpace);

// Native focus scrolling can leave the bottom of a control behind the sticky footer.
document.addEventListener("focusin", ({ target }) => {
  const bar = byId("save-bar");
  if (!byId("main").contains(target) || bar.hidden || bar.contains(target)) return;
  requestAnimationFrame(() => {
    if (target !== document.activeElement || bar.hidden) return;
    const overlap = target.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
    if (overlap > 0) window.scrollBy(0, overlap + 8);
  });
});

const plural = (count, noun) => count + " " + noun + (count === 1 ? "" : "s");

function loadBill(key) {
  billKey = key;
  saved = savedBills.get(key);
  draft = saved.rows.map((entry) => ({ ...entry, amount: dollars(entry.amount) }));
  targetOwed = owed(saved.rows);
  differenceAnchor = null;
  nextId = Math.max(0, ...draft.map((entry) => entry.id)) + 1;
  reasonDirection = undefined;
  byId("comment").value = "";
  repeatInterval = saved.repeatInterval || "month";
  byId("interval").value = repeatInterval;
  byId("notes").hidden = Boolean(saved.closed);
  byId("save-bar").hidden = Boolean(saved.closed);
  byId("helpers").hidden = Boolean(saved.closed);
  byId("edit-obligation").hidden = Boolean(saved.closed);
  closeObligationEditor();
  closeReasonEditor();
  showError();
  renderRows();
}

function displayNames() {
  const addedCount = draft.filter((entry) => entry.added).length;
  let position = 0;
  return new Map(draft.map((entry) => [entry.id, entry.added
    ? "New installment" + (addedCount > 1 ? " " + ++position : "")
    : entry.name]));
}

function makeInput(entry, field, type, label) {
  const input = document.createElement("input");
  input.type = type;
  input.dataset.id = entry.id;
  input.dataset.field = field;
  input.setAttribute("aria-label", label + (entry.partialInstallment ? " remaining" : "") + (field === "date" ? " due date" : " amount"));
  input.value = entry[field];
  if (type === "date") input.max = "9999-12-31";
  else {
    input.inputMode = "decimal";
    input.autocomplete = "off";
  }
  return input;
}

function rowButton(entry, action, label, name) {
  const button = document.createElement("button");
  button.className = action === "remove" ? "ghost danger" : "ghost";
  button.dataset.id = entry.id;
  button.dataset.action = action;
  button.textContent = label;
  button.setAttribute("aria-label", label + " " + name);
  return button;
}

function renderRowActions(cell, entry, label, partial) {
  const menu = document.createElement("div");
  menu.className = "row-menu";
  menu.id = "row-menu-" + entry.id;
  menu.popover = "auto";
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "Actions for " + label);
  const add = rowButton(entry, "after", "Add installment below", label);
  add.autofocus = true;
  menu.append(add);
  if (!entry.state) menu.append(rowButton(entry, "remove", partial ? "Remove remaining" : "Remove", label));

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ghost row-menu-trigger";
  trigger.setAttribute("aria-label", "Actions for " + label);
  trigger.popoverTargetElement = menu;
  cell.append(trigger, menu);
}

function renderRows() {
  const body = byId("rows");
  const names = displayNames();
  // Pair the display rows while keeping the paid and unpaid amounts separate in the draft.
  const paidParts = new Map(draft.filter(entry => entry.state === "Paid" && entry.partialInstallment)
    .map(entry => [entry.partialInstallment, entry]));
  const unpaidParts = new Set(editable().map(entry => entry.partialInstallment));
  byId("add").hidden = Boolean(saved.closed) || draft.length > 0;
  body.replaceChildren();
  if (!draft.length) {
    const line = body.insertRow();
    line.className = "empty-row";
    const message = line.insertCell();
    message.colSpan = 4;
    message.textContent = "No installments. Add one to schedule a payment.";
  }
  draft.forEach((entry) => {
    if (entry.state === "Paid" && entry.partialInstallment && unpaidParts.has(entry.partialInstallment)) return;
    const paidPart = entry.state ? null : paidParts.get(entry.partialInstallment);
    const label = entry.partialInstallment || names.get(entry.id);
    const line = body.insertRow();
    line.dataset.installmentId = entry.id;
    const title = document.createElement("strong");
    title.textContent = label;
    const name = line.insertCell();
    name.append(title);
    const date = line.insertCell();
    date.dataset.label = "Due date";
    const amount = line.insertCell();
    amount.dataset.label = "Amount";
    const actions = line.insertCell();
    if (!saved.closed) renderRowActions(actions, entry, label, Boolean(paidPart));
    if (entry.state) {
      line.className = "history";
      const badge = document.createElement("span");
      badge.className = entry.state === "Processing" ? "badge locked" : "badge";
      badge.textContent = entry.state;
      name.append(badge);
      date.textContent = day(entry.date);
      amount.textContent = money(cents(entry.amount));
      return;
    }
    if (paidPart) {
      line.className = "partial-payment";
      const badge = document.createElement("span");
      badge.className = "badge partial-status";
      badge.textContent = "Partially paid";
      name.append(badge);
      delete date.dataset.label;
      delete amount.dataset.label;
      date.append(partialCaption("Remaining due date"));
      amount.append(partialCaption(money(cents(paidPart.amount)) + " paid"), partialCaption("Remaining amount"));
    }
    date.append(makeInput(entry, "date", "date", label));
    const field = document.createElement("div");
    field.className = "money-input";
    const sign = document.createElement("span");
    sign.textContent = "$";
    sign.setAttribute("aria-hidden", "true");
    field.append(sign, makeInput(entry, "amount", "text", label));
    amount.append(field);
  });
  body.append(differenceRow);
  update();
}

function partialCaption(text) {
  const caption = document.createElement("small");
  caption.className = "small muted partial-caption";
  caption.textContent = text;
  return caption;
}

function setText(id, value) {
  const node = byId(id);
  if (node.textContent !== value) node.textContent = value;
}

function datedLaterPayments() {
  if (!validDate(differenceAnchor?.date || "")) return [];
  return editable().filter((entry) => validDate(entry.date) && entry.date > differenceAnchor.date
    && cents(entry.amount) !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

const maxInstallmentCents = 999999999;

function laterPayments(difference) {
  return datedLaterPayments().filter((entry) => {
    const revised = cents(entry.amount) + difference;
    return revised >= 0 && revised <= maxInstallmentCents;
  });
}

function spreadDifference(difference) {
  const adjustments = datedLaterPayments().filter((entry) => cents(entry.amount) > 0).map((entry) => {
    const amount = cents(entry.amount);
    return { entry, amount, applied: 0, capacity: difference < 0 ? amount : maxInstallmentCents - amount };
  });
  let remaining = Math.abs(difference);
  if (adjustments.length < 2 || adjustments.reduce((sum, item) => sum + item.capacity, 0) < remaining) return null;
  let available = adjustments.filter((item) => item.capacity > 0);
  while (remaining > 0) {
    const share = Math.floor(remaining / available.length);
    const capped = available.filter((item) => item.capacity <= share);
    if (!capped.length) {
      const extraCents = remaining % available.length;
      available.forEach((item, index) => { item.applied = share + (index < extraCents ? 1 : 0); });
      break;
    }
    capped.forEach((item) => {
      item.applied = item.capacity;
      remaining -= item.capacity;
    });
    available = available.filter((item) => item.capacity > share);
  }
  return adjustments.map((item) => ({
    entry: item.entry,
    amount: item.amount + Math.sign(difference) * item.applied,
  }));
}

function placeDifference() {
  const rows = byId("rows");
  const anchor = rows.querySelector(`[data-installment-id="${differenceAnchor?.id}"]`);
  if (anchor) {
    if (anchor.nextElementSibling !== differenceRow) anchor.after(differenceRow);
    return;
  }
  const removedAt = differenceAnchor?.removedAt;
  const nextRow = removedAt === undefined ? null : draft.slice(removedAt)
    .map(entry => rows.querySelector(`[data-installment-id="${entry.id}"]`)).find(Boolean);
  if (nextRow) {
    if (nextRow.previousElementSibling !== differenceRow) nextRow.before(differenceRow);
  } else if (rows.lastElementChild !== differenceRow) {
    rows.append(differenceRow);
  }
}

function updateDifference(incomplete, paid, scheduled) {
  const difference = targetOwed - scheduled;
  differenceRow.hidden = incomplete || difference === 0;
  // A partially typed amount hides the choices without starting a new resolution.
  if (incomplete) return;
  if (difference === 0) {
    byId("later-payment").replaceChildren();
    resolveOptions().forEach((option) => { option.checked = false; });
    setText("difference-review-note", "");
    differenceReview = null;
    differenceAnchor = null;
    return;
  }
  placeDifference();
  const proposedTotal = paid + scheduled;
  const review = differenceReview ??= { proposedTotal, needsLaterPayment: false, notice: "" };
  const totalOption = byId("resolve-total");
  if (totalOption.checked && review.proposedTotal !== proposedTotal) {
    totalOption.checked = false;
    review.notice = "The proposed bill total changed. Choose an option again.";
  }
  review.proposedTotal = proposedTotal;
  const more = difference > 0;
  const magnitude = money(Math.abs(difference));
  const keepTotal = "Bill total stays " + money(paid + targetOwed);
  setText("difference-message", magnitude + (more ? " left to schedule. Where should it go?"
    : " scheduled above the amount owed. Where should it come from?"));

  const choice = byId("later-payment");
  const selected = choice.value;
  const candidates = laterPayments(difference);
  const selectedIsEligible = candidates.some((entry) => String(entry.id) === selected);
  if (selected && !selectedIsEligible) {
    review.needsLaterPayment = true;
    const moveOption = byId("resolve-move");
    if (moveOption.checked) {
      moveOption.checked = false;
      review.notice = "That payment is no longer eligible. Choose another payment or option.";
    }
  }
  const placeholder = new Option("Choose a later payment", "");
  placeholder.disabled = true;
  choice.replaceChildren(placeholder, ...candidates.map((entry) => new Option(
    day(entry.date) + " · " + money(cents(entry.amount)), String(entry.id),
  )));
  if (selectedIsEligible) choice.value = selected;
  else if (review.needsLaterPayment || !candidates.length) choice.value = "";
  else choice.value = String(candidates[0].id);
  byId("move-choice").hidden = !candidates.length;
  setText("move-label", (more ? "Add to" : "Take from") + " one later payment");
  setText("move-note", keepTotal + ".");

  const spread = spreadDifference(difference);
  byId("spread-choice").hidden = !spread;
  if (spread) {
    const shares = spread.map(({ entry, amount }) => Math.abs(amount - cents(entry.amount)));
    const each = (Math.min(...shares) === Math.max(...shares) ? "" : "About ") + money(Math.min(...shares));
    setText("spread-label", "Spread across " + spread.length + " later payments");
    setText("spread-note", each + (more ? " more" : " less") + " each. " + keepTotal + ".");
  }

  setText("total-label", (more ? "Reduce" : "Increase") + " the bill total to " + money(proposedTotal));
  setText("new-obligation", "Amount owed becomes " + money(scheduled) + ".");

  byId("no-later-payment").hidden = Boolean(candidates.length || spread);
  setText("no-later-payment", validDate(differenceAnchor?.date || "")
    ? "No later unpaid payment can take " + magnitude + ". Edit another payment directly, or:"
    : "Give the edited installment a date to use a later payment, or:");

  const available = resolveOptions().filter((option) => !option.closest(".choice").hidden);
  if (!available.some((option) => option.checked)) {
    resolveOptions().forEach((option) => { option.checked = false; });
    if (!review.notice) {
      const safe = available.find((option) => option.value !== "total");
      if (safe) safe.checked = true;
    }
  }
  updateDifferenceActions();
}

const resolveOptions = () => [...document.querySelectorAll('input[name="resolve"]')];
function resolveChoice() {
  const selected = resolveOptions().find((option) => option.checked && !option.closest(".choice").hidden)?.value;
  if (selected === "move" && !byId("later-payment").value) return;
  return selected;
}

function updateDifferenceActions() {
  const ready = Boolean(resolveChoice());
  if (ready) differenceReview.notice = "";
  setText("difference-review-note", differenceReview.notice);
  byId("apply-difference").disabled = !ready;
}

function update() {
  const entries = editable();
  const incomplete = entries.some((entry) => cents(entry.amount) === null);
  const scheduled = entries.filter((entry) => cents(entry.amount) > 0);
  const dates = scheduled.map((entry) => entry.date).filter(validDate).sort();
  const processing = lockedAmount("Processing");
  const paid = lockedAmount("Paid");
  const total = owed(draft);
  if (!incomplete && total === targetOwed) balancedDraft = draft.map((entry) => ({ ...entry }));
  setText("obligation-total", money(paid + targetOwed));
  setText("owed", money(targetOwed));
  setText("paid", money(paid));
  const completeDates = dates.length === scheduled.length && !incomplete;
  setText("next", completeDates && dates.length ? day(dates[0]) : "—");
  setText("final", completeDates && dates.length ? day(dates.at(-1)) : "—");
  const savedOwed = owed(saved.rows);
  const totalChange = targetOwed - savedOwed;
  const processingNote = processing ? "Amount owed includes " + money(processing) + " processing." : "";
  setText("summary-note", saved.closed ? "" : totalChange
    ? ["Bill total " + (totalChange < 0 ? "reduced" : "increased") + " by " + money(Math.abs(totalChange))
      + " from " + money(paid + savedOwed) + ".", processingNote].filter(Boolean).join(" ")
    : processing ? processingNote + " Dates reflect editable installments."
    : "Editing installments keeps the bill total unless you choose to change it.");
  byId("summary-note").classList.toggle("is-changed", Boolean(totalChange));
  setText("save-totals", "Bill total " + money(paid + targetOwed)
    + (totalChange ? " (was " + money(paid + savedOwed) + ")" : "") + " · Amount owed " + money(targetOwed));
  updateDifference(incomplete, paid, total);
  setText("schedule-help", saved.closed ? "This bill is paid in full."
    : entries.some((entry) => cents(entry.amount) === 0) ? "Zero-dollar rows will be removed on save."
    : "Edit dates or amounts directly.");
  byId("split").disabled = entries.length < 2 || targetOwed - processing < entries.length;
  byId("repeat").disabled = dates.length < 2 || dates[0] === dates.at(-1);
  byId("interval").disabled = byId("repeat").disabled;
  updateRepeatHelp();
  updateReset();
  updateReasons(changed() ? Math.sign(targetOwed - owed(saved.rows)) : null);
}

function updateReasons(direction) {
  if (direction === reasonDirection) return;
  const selected = reasonDirection === null ? byId("treatment").value : "";
  reasonDirection = direction;
  renderReasons(selected);
}

function renderReasons(selected) {
  const treatment = byId("treatment");
  treatment.replaceChildren(new Option("Choose a reason", ""));

  function addGroup(label, reasons) {
    if (!reasons.length) return;
    const group = document.createElement("optgroup");
    group.label = label;
    group.append(...reasons.map(([value, name]) => new Option(name, value)));
    treatment.append(group);
  }

  if (reasonDirection === null || reasonDirection === 0) {
    addGroup("Payment circumstances", scheduleReasons);
  }
  addGroup("Billing corrections and fees", reasonDirection === 0 ? [correctionReason] : balanceReasons);
  if (reasonDirection === null || reasonDirection < 0) {
    addGroup("Discounts, aid, and waivers", reductionReasons);
  }
  addGroup("Staff-added reasons", staffReasons.map(name => ["staff:" + name, name]));
  treatment.append(new Option("Other", "other"));
  if (selected && Array.from(treatment.options).some(option => option.value === selected)) {
    treatment.value = selected;
  }
}

function readStaffReasons() {
  try {
    const reasons = JSON.parse(localStorage.getItem(staffReasonsKey));
    return Array.isArray(reasons) ? reasons.filter(name => typeof name === "string" && name.trim() && name.length <= 80) : [];
  } catch {
    return [];
  }
}

function closeReasonEditor() {
  byId("reason-editor").hidden = true;
  byId("add-reason").setAttribute("aria-expanded", "false");
  byId("reason-input").value = "";
  setText("reason-error", "");
}

function cancelReasonEditor() {
  closeReasonEditor();
  byId("add-reason").focus();
}

byId("add-reason").onclick = () => {
  if (!byId("reason-editor").hidden) return cancelReasonEditor();
  byId("reason-editor").hidden = false;
  byId("add-reason").setAttribute("aria-expanded", "true");
  byId("reason-input").focus();
};
byId("cancel-reason").onclick = cancelReasonEditor;
byId("reason-editor").onkeydown = event => {
  if (event.key === "Escape") cancelReasonEditor();
};
byId("reason-input").oninput = () => setText("reason-error", "");
byId("reason-editor").onsubmit = event => {
  event.preventDefault();
  const input = byId("reason-input");
  const name = input.value.trim().replace(/\s+/g, " ");
  const fail = message => {
    setText("reason-error", message);
    input.focus();
  };
  if (!name || name.length > 80) return fail("Enter a reason of up to 80 characters.");

  const previous = readStaffReasons();
  const existing = [...scheduleReasons, ...balanceReasons, ...reductionReasons].map(([, label]) => label);
  existing.push(...previous, "Other", "Choose a reason");
  if (existing.some(label => label.toLowerCase() === name.toLowerCase())) return fail("That reason already exists.");

  const next = [...previous, name];
  try {
    localStorage.setItem(staffReasonsKey, JSON.stringify(next));
  } catch {
    return fail("Couldn’t save this reason in this browser. Try again.");
  }
  staffReasons = next;
  renderReasons("staff:" + name);
  closeReasonEditor();
  showError();
  announce("Reason added and selected.");
  byId("treatment").focus();
};

function updateRepeatHelp() {
  const interval = byId("interval");
  const pending = interval.value !== repeatInterval;
  setText("repeat-help", byId("repeat").disabled ? "Enter different first and final unpaid dates to repeat payments."
    : pending ? "Not applied yet. Choose Rebuild schedule to switch to " + interval.selectedOptions[0].textContent.toLowerCase()
      + ". It keeps the first and final unpaid dates and splits the amount owed evenly."
    : "Keeps the first and final unpaid dates and splits the amount owed evenly.");
}

function updateReset() {
  byId("undo").disabled = !changed() && !byId("comment").value.trim()
    && byId("obligation-editor").hidden && repeatInterval === (saved.repeatInterval || "month");
}

function closeObligationEditor() {
  byId("obligation-editor").hidden = true;
  byId("edit-obligation").setAttribute("aria-expanded", "false");
  setText("obligation-error", "");
}

byId("edit-obligation").onclick = () => {
  byId("obligation-editor").hidden = false;
  byId("edit-obligation").setAttribute("aria-expanded", "true");
  const input = byId("obligation-input");
  input.value = dollars(lockedAmount("Paid") + targetOwed);
  setText("obligation-error", "");
  input.focus();
  input.select();
  updateReset();
};

byId("cancel-obligation").onclick = () => {
  closeObligationEditor();
  updateReset();
  byId("edit-obligation").focus();
};

byId("obligation-input").oninput = () => setText("obligation-error", "");

function splitAmount(entries, total) {
  const share = Math.floor(total / entries.length);
  entries.forEach((entry, index) => { entry.amount = dollars(share + (index < total % entries.length ? 1 : 0)); });
}

byId("obligation-editor").onsubmit = (event) => {
  event.preventDefault();
  const total = cents(byId("obligation-input").value);
  const paid = lockedAmount("Paid");
  const processing = lockedAmount("Processing");
  const entries = editable();
  if (total === null) return setText("obligation-error", "Enter an amount with up to two decimal places.");
  if (total < paid + processing) return setText("obligation-error", "The bill total can't be less than "
    + money(paid + processing) + ", the amount already paid or processing.");
  const unpaid = total - paid - processing;
  if (unpaid > 0 && unpaid < entries.length) return setText("obligation-error", "Remove installments or enter enough for at least one cent per installment.");
  if (total - paid === targetOwed && owed(draft) === targetOwed && entries.every((entry) => cents(entry.amount) !== null)) {
    closeObligationEditor();
    updateReset();
    byId("edit-obligation").focus();
    return;
  }
  targetOwed = total - paid;
  differenceAnchor = null;
  if (entries.length) splitAmount(entries, unpaid);
  else if (unpaid > 0) draft.push(row(nextId++, "", dollars(unpaid)));
  closeObligationEditor();
  showError();
  renderRows();
  const payments = editable().filter((entry) => cents(entry.amount) > 0).length;
  announce("Bill total changed to " + money(total) + ". " + money(unpaid) + " is split evenly across "
    + plural(payments, "unpaid payment") + ".");
  byId("edit-obligation").focus();
};

// Picking a later payment means the staff member wants that option.
byId("later-payment").onchange = () => {
  byId("resolve-move").checked = true;
  differenceReview.needsLaterPayment = false;
  updateDifferenceActions();
};
resolveOptions().forEach((option) => {
  option.onchange = updateDifferenceActions;
});

byId("apply-difference").onclick = () => {
  const actions = { move: moveDifference, spread: spreadDifferenceEvenly, total: adoptScheduledTotal };
  actions[resolveChoice()]?.();
};

// Cancel puts the schedule back the way it was before the edit that created the difference.
function cancelDifference() {
  if (!balancedDraft) return;
  const anchorId = differenceAnchor?.id;
  const anchorIndex = Math.max(0, draft.findIndex((entry) => entry.id === anchorId));
  draft = balancedDraft.map((entry) => ({ ...entry }));
  differenceAnchor = null;
  showError();
  renderRows();
  announce("Change canceled. Bill total stays " + money(lockedAmount("Paid") + targetOwed) + ".");
  const nearby = draft.find((entry) => entry.id === anchorId && !entry.state)
    || draft.slice(Math.min(anchorIndex, draft.length - 1)).find((entry) => !entry.state)
    || editable().at(-1);
  if (nearby) focusRow(nearby.id);
}

byId("cancel-difference").onclick = cancelDifference;
differenceRow.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  cancelDifference();
});

function moveDifference() {
  const difference = targetOwed - owed(draft);
  const selected = laterPayments(difference).find((entry) => String(entry.id) === byId("later-payment").value);
  if (!selected) return;
  selected.amount = dollars(cents(selected.amount) + difference);
  differenceAnchor = null;
  showError();
  renderRows();
  const magnitude = money(Math.abs(difference));
  announce((difference > 0 ? "Added " + magnitude + " to the " : "Took " + magnitude + " from the ")
    + day(selected.date) + " payment. Bill total stays " + money(lockedAmount("Paid") + targetOwed) + ".");
  focusRow(selected.id);
}

function spreadDifferenceEvenly() {
  const difference = targetOwed - owed(draft);
  const adjustments = spreadDifference(difference);
  if (!adjustments) return;
  const anchor = draft.find((entry) => entry.id === differenceAnchor?.id);
  adjustments.forEach(({ entry, amount }) => { entry.amount = dollars(amount); });
  differenceAnchor = null;
  showError();
  renderRows();
  announce("Spread " + money(Math.abs(difference)) + " across " + adjustments.length
    + " later payments. Bill total stays " + money(lockedAmount("Paid") + targetOwed) + ".");
  focusRow(anchor?.id ?? adjustments[0].entry.id);
}

function adoptScheduledTotal() {
  const before = targetOwed;
  targetOwed = owed(draft);
  differenceAnchor = null;
  showError();
  update();
  const needsReason = !byId("treatment").value;
  announce("Bill total " + (targetOwed < before ? "reduced" : "increased") + " to " + money(lockedAmount("Paid") + targetOwed)
    + ". Amount owed is now " + money(targetOwed) + "." + (needsReason ? " Choose a reason for the change." : ""));
  byId("treatment").focus();
}

function focusRow(id, field = "amount") {
  byId("rows").querySelector(`input[data-id="${id}"][data-field="${field}"]`)?.focus();
}

byId("bill").onchange = (event) => {
  if ((changed() || byId("comment").value.trim()) && !window.confirm("Discard the draft for this bill?")) {
    event.target.value = billKey;
    return;
  }
  loadBill(event.target.value);
};

byId("reset").onclick = () => {
  for (const [key, bill] of Object.entries(fixtures)) savedBills.set(key, bill);
  byId("bill").value = "tuition";
  loadBill("tuition");
  byId("bill").focus();
};

byId("undo").onclick = () => {
  if ((changed() || byId("comment").value.trim())
    && !window.confirm("Reset all unsaved changes to this bill? This can't be undone.")) return;
  loadBill(billKey);
  announce("All unsaved changes reset. Showing the last saved schedule.");
  byId("save-status").focus({ preventScroll: true });
};

byId("comment").oninput = () => { showError(); update(); };
byId("treatment").onchange = () => showError();

function insertInstallment(index) {
  const single = draft.find((entry) => entry.name === "One-time payment");
  if (single) single.name = "Installment " + single.id;
  const id = nextId++;
  draft.splice(index, 0, { ...row(id, "", ""), added: true });
  showError();
  renderRows();
  focusRow(id, "date");
}

byId("add").onclick = () => insertInstallment(0);

byId("rows").oninput = (event) => {
  const { id, field } = event.target.dataset;
  if (field !== "amount" && field !== "date") return;
  const entry = editable().find((item) => item.id === Number(id));
  if (!entry) return;
  entry[field] = event.target.value;
  if (field === "amount") differenceAnchor = entry;
  showError();
  update();
};

byId("rows").onchange = (event) => {
  const { id, field } = event.target.dataset;
  if (field !== "amount") return;
  const entry = editable().find((item) => item.id === Number(id));
  const value = cents(event.target.value);
  if (!entry || value === null) return;
  entry.amount = dollars(value);
  event.target.value = entry.amount;
};

byId("rows").onclick = (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || saved.closed) return;
  const { id, action } = button.dataset;
  const index = draft.findIndex((entry) => entry.id === Number(id));
  if (index < 0) return;
  if (action === "after") return insertInstallment(index + 1);
  const source = draft[index];
  if (action !== "remove" || source.state) return;
  showError();
  draft.splice(index, 1);
  differenceAnchor = { ...source, removedAt: index };
  renderRows();
  const next = draft.slice(index).find((entry) => !entry.state) || editable().at(-1);
  if (next) focusRow(next.id);
  else if (draft.length) byId("rows").querySelector(".row-menu-trigger").focus();
  else byId("add").focus();
};

// Splits what is owed (not whatever is currently typed) so this helper never changes the bill total.
byId("split").onclick = () => {
  const entries = editable();
  const total = targetOwed - lockedAmount("Processing");
  if (entries.length < 2 || total < entries.length) return;
  splitAmount(entries, total);
  differenceAnchor = null;
  showError();
  renderRows();
  announce("Split " + money(total) + " evenly across " + plural(entries.length, "unpaid payment")
    + ". Dates and bill total unchanged.");
};

const maxRepeatedInstallments = 120;

function rebuildSchedule() {
  const interval = byId("interval").value;
  const entries = editable();
  const scheduled = entries.filter((entry) => cents(entry.amount) > 0).sort((a, b) => a.date.localeCompare(b.date));
  const fail = (message) => showError(message);
  if (entries.some((entry) => cents(entry.amount) === null) || scheduled.some((entry) => !validDate(entry.date))) {
    return fail("Complete the installment amounts and dates before rebuilding.");
  }
  if (owed(draft) !== targetOwed) return fail("Resolve the amount difference before rebuilding the schedule.");
  const start = scheduled[0]?.date;
  const end = scheduled.at(-1)?.date;
  if (!start || start === end) return;
  const first = new Date(start + "T00:00:00Z");
  const dates = [start];
  for (let index = 1; dates.length < maxRepeatedInstallments; index++) {
    const date = new Date(first);
    if (interval === "month") {
      date.setUTCMonth(first.getUTCMonth() + index + 1, 0);
      date.setUTCDate(Math.min(first.getUTCDate(), date.getUTCDate()));
    } else date.setUTCDate(first.getUTCDate() + Number(interval) * index);
    if (date.getUTCFullYear() > 9999) break;
    const next = date.toISOString().slice(0, 10);
    if (next >= end) break;
    dates.push(next);
  }
  dates.push(end);
  if (dates.length > maxRepeatedInstallments) return fail("Choose a less frequent interval. The limit is 120 installments.");
  const unpaid = targetOwed - lockedAmount("Processing");
  if (unpaid < dates.length) return fail("Choose a less frequent interval so each payment is at least one cent.");
  const rebuilt = dates.map((date, index) => {
    const existing = scheduled[index];
    return existing ? { ...existing, date } : row(nextId++, date, "");
  });
  splitAmount(rebuilt, unpaid);
  draft = [...draft.filter((entry) => entry.state), ...rebuilt].sort((a, b) => a.date.localeCompare(b.date));
  repeatInterval = interval;
  differenceAnchor = null;
  showError();
  renderRows();
  const frequency = byId("interval").selectedOptions[0].textContent.toLowerCase();
  const count = scheduled.length === dates.length ? "with " + plural(dates.length, "unpaid installment")
    : "from " + scheduled.length + " to " + plural(dates.length, "unpaid installment");
  announce("Rebuilt " + frequency + " " + count + ", " + day(start) + " to " + day(end)
    + ". Amount owed stays " + money(targetOwed) + ".");
  const active = document.activeElement;
  if (active === byId("interval") || active === byId("repeat")) active.scrollIntoView({ block: "nearest" });
}

byId("repeat").onclick = rebuildSchedule;
byId("interval").onchange = updateRepeatHelp;

// Saved schedules read in date order. When every row uses the plain "Installment N" label,
// unpaid rows are renumbered after the locked history; otherwise only new rows get the next number.
function rowsToSave() {
  const kept = draft.filter((entry) => entry.state || cents(entry.amount) > 0)
    .map((entry) => ({ ...entry, amount: cents(entry.amount) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const numbered = /^Installment (\d+)$/;
  if (kept.every((entry) => entry.added || numbered.test(entry.name))) {
    let number = kept.filter((entry) => entry.state).length;
    kept.forEach((entry) => { if (!entry.state) entry.name = "Installment " + ++number; });
  } else {
    let number = Math.max(0, ...kept.filter((entry) => !entry.added)
      .map((entry) => Number(/^Installment (\d+)/.exec(entry.name)?.[1] ?? 0)));
    kept.forEach((entry) => { if (entry.added) entry.name = "Installment " + ++number; });
  }
  return kept.map(({ added, ...entry }) => entry);
}

byId("save").onclick = () => {
  if (saved.closed) return;
  if (!byId("obligation-editor").hidden) {
    setText("obligation-error", "Apply or cancel the new bill total before saving.");
    return byId("obligation-input").focus();
  }
  if (!byId("reason-editor").hidden) {
    setText("reason-error", "Add or cancel the new reason before saving.");
    return byId("reason-input").focus();
  }
  const entries = editable();
  const invalid = entries.find((entry) => cents(entry.amount) === null);
  if (invalid) {
    showError("Enter a dollar amount for each installment.");
    return focusRow(invalid.id);
  }
  const missingDate = entries.find((entry) => cents(entry.amount) > 0 && !validDate(entry.date));
  if (missingDate) {
    showError("Enter a due date for each installment with an amount.");
    return focusRow(missingDate.id, "date");
  }
  if (owed(draft) !== targetOwed) {
    showError("Choose what to do with the difference before saving.");
    return byId("difference-message").focus();
  }
  if (!changed()) return showError("Change an installment before saving.");
  const treatment = byId("treatment");
  if (!treatment.value) {
    showError("Choose a reason for the change.");
    return treatment.focus();
  }
  const adjustment = { reason: treatment.selectedOptions[0].textContent, comment: byId("comment").value.trim() };
  savedBills.set(billKey, {
    rows: rowsToSave(),
    repeatInterval,
    adjustments: [...(saved.adjustments || []), adjustment],
  });
  loadBill(billKey);
  announce("Adjustment saved in this demo. " + money(owed(draft)) + " owed.", true);
  byId("save-status").focus();
};

loadBill(byId("bill").value);
