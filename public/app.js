const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const preferences = (() => { try { return { language: "lt", theme: "light", ...JSON.parse(localStorage.getItem("saskaitago.preferences") || "{}") }; } catch { return { language: "lt", theme: "light" }; } })();
const state = { settings: {}, clients: [], invoices: [], view: "invoices", firstRunGuide: false, filter: "all", typeFilter: "all", invoicePage: 1, clientPage: 1, pageSize: 10, clientSearch: "", search: "", preferences };
function applyPreferences() { document.documentElement.lang = preferences.language; document.documentElement.dataset.theme = preferences.theme; window.saskaitaI18n?.apply(document, preferences.language); }
function savePreferences() { localStorage.setItem("saskaitago.preferences", JSON.stringify(preferences)); applyPreferences(); }
applyPreferences();
new MutationObserver((records) => { const added = new Set(); for (const record of records) for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) added.add(node); for (const node of added) window.saskaitaI18n?.apply(node, preferences.language); }).observe(document.body, { childList: true, subtree: true });
const esc = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const currency = (value) => `${Number(value || 0).toLocaleString(preferences.language === "en" ? "en-IE" : "lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const date = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString(preferences.language === "en" ? "en-IE" : "lt-LT") : "—";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const addDays = (dateValue, days) => { const d = new Date(`${dateValue}T12:00:00`); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

function friendlyError(error) {
  const message = String(error?.message || "");
  if (error?.name === "TypeError" || /failed to fetch|networkerror|fetch failed/i.test(message)) return preferences.language === "en" ? "Could not connect to the local workspace." : "Nepavyko prisijungti prie vietinės darbo vietos.";
  return message || (preferences.language === "en" ? "The action could not be completed." : "Nepavyko atlikti veiksmo");
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Nepavyko atlikti veiksmo");
  return body;
}

let customSelectMenu;
let activeCustomSelect;
let customSelectId = 0;

function closeCustomSelect() {
  if (!customSelectMenu) return;
  activeCustomSelect?.trigger.setAttribute("aria-expanded", "false");
  customSelectMenu.remove();
  customSelectMenu = undefined;
  activeCustomSelect = undefined;
}

function positionCustomSelectMenu() {
  if (!customSelectMenu || !activeCustomSelect) return;
  const rect = activeCustomSelect.trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const maxHeight = Math.max(120, Math.min(280, Math.max(spaceBelow, spaceAbove)));
  const openAbove = spaceBelow < 190 && spaceAbove > spaceBelow;
  customSelectMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`;
  customSelectMenu.style.width = `${rect.width}px`;
  customSelectMenu.style.maxHeight = `${maxHeight}px`;
  customSelectMenu.style.top = openAbove ? `${Math.max(8, rect.top - Math.min(maxHeight, customSelectMenu.scrollHeight) - 6)}px` : `${rect.bottom + 6}px`;
}

function openCustomSelect(control, focusSelected = false) {
  closeCustomSelect();
  const select = control.select;
  const options = [...select.options];
  const id = `select-list-${++customSelectId}`;
  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.id = id;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", control.label);
  menu.innerHTML = options.map((option, index) => `<button type="button" role="option" class="custom-select-option ${option.selected ? "selected" : ""}" data-index="${index}" aria-selected="${option.selected}" ${option.disabled ? "disabled" : ""}><span>${esc(option.textContent.trim())}</span><i aria-hidden="true">${option.selected ? "✓" : ""}</i></button>`).join("");
  document.body.append(menu);
  customSelectMenu = menu;
  activeCustomSelect = control;
  control.trigger.setAttribute("aria-expanded", "true");
  control.trigger.setAttribute("aria-controls", id);
  positionCustomSelectMenu();
  menu.addEventListener("click", (event) => {
    const optionButton = event.target.closest("[role=option]");
    if (!optionButton || optionButton.disabled) return;
    select.selectedIndex = Number(optionButton.dataset.index);
    control.refresh();
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    control.trigger.focus();
    closeCustomSelect();
  });
  menu.querySelectorAll("[role=option]").forEach((option) => option.addEventListener("pointerenter", () => {
    menu.querySelectorAll("[role=option]").forEach((item) => item.classList.remove("active"));
    option.classList.add("active");
  }));
  if (focusSelected) (menu.querySelector("[aria-selected=true]:not(:disabled)") || menu.querySelector("[role=option]:not(:disabled)"))?.focus();
}

function enhanceSelects(root = document) {
  root.querySelectorAll("select:not([data-customized])").forEach((select) => {
    select.dataset.customized = "true";
    const wrapper = document.createElement("span");
    wrapper.className = "custom-select";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select);
    const fieldLabel = select.closest(".field")?.querySelector("label")?.textContent.trim();
    const label = select.getAttribute("aria-label") || fieldLabel || select.name || "Pasirinkimas";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    trigger.setAttribute("aria-label", label);
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.disabled = select.disabled;
    trigger.innerHTML = `<span class="custom-select-value"></span><i class="custom-select-arrow" aria-hidden="true"></i>`;
    wrapper.append(trigger);
    select.classList.add("custom-select-native");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    const control = {
      select, trigger, label,
      refresh() {
        const selected = select.options[select.selectedIndex];
        trigger.querySelector(".custom-select-value").textContent = selected?.textContent.trim() || "";
        trigger.classList.toggle("is-placeholder", Boolean(selected?.disabled));
      },
    };
    control.refresh();
    trigger.addEventListener("click", () => {
      if (customSelectMenu && activeCustomSelect === control) closeCustomSelect();
      else openCustomSelect(control);
    });
    trigger.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openCustomSelect(control, true);
      }
    });
    select.addEventListener("change", control.refresh);
  });
}

document.addEventListener("click", (event) => {
  if (customSelectMenu && !customSelectMenu.contains(event.target) && !activeCustomSelect?.trigger.contains(event.target)) closeCustomSelect();
});
document.addEventListener("keydown", (event) => {
  if (!customSelectMenu) return;
  if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); const trigger = activeCustomSelect?.trigger; closeCustomSelect(); trigger?.focus(); return; }
  const options = [...customSelectMenu.querySelectorAll("[role=option]:not(:disabled)")];
  const current = options.indexOf(document.activeElement);
  let next = current;
  if (event.key === "ArrowDown") next = Math.min(options.length - 1, current + 1);
  else if (event.key === "ArrowUp") next = Math.max(0, current < 0 ? 0 : current - 1);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = options.length - 1;
  else if (event.key === "Tab") { closeCustomSelect(); return; }
  else return;
  event.preventDefault();
  options[next]?.focus();
}, true);
window.addEventListener("resize", positionCustomSelectMenu);
window.addEventListener("scroll", positionCustomSelectMenu, true);

function toast(message, type = "success") {
  const el = $("#toast"); el.className = `toast toast-${type} visible`; el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = `<span class="toast-icon" aria-hidden="true">${type === "error" ? "!" : "✓"}</span><span class="toast-message">${esc(window.saskaitaI18n?.translate(message, preferences.language) || message)}</span>`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("visible"), type === "error" ? 5000 : 3000);
}
function fieldErrorMessage(control) {
  const validity = control.validity;
  if (validity.valueMissing) return "Šį lauką būtina užpildyti.";
  if (validity.typeMismatch || validity.patternMismatch) return control.type === "email" ? "Įveskite galiojantį el. pašto adresą." : "Patikrinkite įvestą reikšmę.";
  if (validity.rangeUnderflow || validity.tooShort) return "Reikšmė per maža.";
  if (validity.rangeOverflow || validity.tooLong) return "Reikšmė per didelė.";
  if (validity.stepMismatch || validity.badInput) return "Įveskite galiojantį skaičių.";
  return "Patikrinkite įvestą reikšmę.";
}
function clearFieldError(control) {
  control.removeAttribute("aria-invalid");
  const field = control.closest(".field"); if (!field) return;
  field.classList.remove("field-invalid"); field.querySelector(".field-error")?.remove();
}
function validateControls(container) {
  const controls = [...container.querySelectorAll("input,select,textarea")].filter((control) => !control.disabled && !control.closest("[hidden]"));
  const invalid = controls.filter((control) => !control.checkValidity());
  controls.filter((control) => control.validity.valid).forEach(clearFieldError);
  for (const control of invalid) {
    const field = control.closest(".field"); control.setAttribute("aria-invalid", "true");
    if (field) { field.classList.add("field-invalid"); let message = field.querySelector(".field-error"); if (!message) { message = document.createElement("span"); message.className = "field-error"; field.append(message); } message.textContent = fieldErrorMessage(control); }
  }
  if (!invalid.length) return true;
  toast("Patikrinkite pažymėtus laukus", "error");
  const first = invalid[0], target = first.closest(".custom-select")?.querySelector(".custom-select-trigger") || first;
  target.scrollIntoView({ behavior: "smooth", block: "center" }); target.focus({ preventScroll: true }); return false;
}
function validateForm(form) { return validateControls(form); }
document.addEventListener("input", (event) => { if (event.target.matches("input,select,textarea") && event.target.validity.valid) clearFieldError(event.target); });
document.addEventListener("change", (event) => { if (event.target.matches("input,select,textarea") && event.target.validity.valid) clearFieldError(event.target); });
document.addEventListener("submit", (event) => { event.preventDefault(); validateForm(event.target); });
window.addEventListener("unhandledrejection", (event) => { toast(friendlyError(event.reason), "error"); });
window.addEventListener("error", (event) => { if (event.message) toast("Nepavyko atlikti veiksmo", "error"); });

function hydrateHeader() {
  const name = state.settings.company || (preferences.language === "en" ? "Your company" : "Jūsų įmonė");
  $("#profileName").textContent = name;
  $("#avatar").textContent = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SG";
  $("#navCount").textContent = state.invoices.length;
  const crumbs = { dashboard: "Dashboard", invoices: "Sąskaitos", clients: "Klientai", "settings-company": "Įmonės duomenys", "settings-program": "Programos nustatymai", help: "Naudojimo vadovas" };
  $("#pageCrumb").textContent = crumbs[state.view] || "Sąskaitos";
}

function render() {
  hydrateHeader();
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view || (button.dataset.view === "settings-company" && ["settings-program", "help"].includes(state.view))));
  if (state.view === "clients") renderClients();
  else if (state.view === "dashboard") renderDashboard();
  else if (state.view === "settings-company" || state.view === "settings-program") renderSettingsPage(state.view === "settings-program" ? "program" : "company");
  else if (state.view === "help") renderHelpPage();
  else renderInvoices();
}

function getVisibleInvoices() {
  const todayValue = today();
  return state.invoices.filter((invoice) => {
    const effective = invoice.status === "issued" && invoice.dueDate && invoice.dueDate < todayValue ? "overdue" : invoice.status;
    const matchesFilter = state.filter === "all" || effective === state.filter;
    const matchesType = state.typeFilter === "all" || invoice.type === state.typeFilter;
    const needle = state.search.trim().toLowerCase();
    const matchesSearch = !needle || `${invoice.number} ${invoice.client.name} ${invoice.client.companyCode}`.toLowerCase().includes(needle);
    return matchesFilter && matchesType && matchesSearch;
  });
}

function renderDashboard() {
  const invoices = state.invoices;
  const now = today(), month = now.slice(0, 7);
  const unpaid = invoices.filter((item) => item.status === "issued");
  const overdue = unpaid.filter((item) => item.dueDate && item.dueDate < now);
  const paid = invoices.filter((item) => item.status === "paid");
  const monthInvoices = invoices.filter((item) => item.issueDate?.startsWith(month));
  const recent = [...invoices].sort((a,b) => (b.issueDate || "").localeCompare(a.issueDate || "") || (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5);
  const typeNames = { proforma: "Išankstinė", vat: "PVM sąskaita", credit: "Kreditinė" };
  const statusNames = { issued: "Laukia apmokėjimo", paid: "Apmokėta", cancelled: "Atšaukta" };
  const getStatus = (invoice) => invoice.status === "issued" && invoice.dueDate && invoice.dueDate < now ? "overdue" : invoice.status;
  const isEmpty = invoices.length === 0;
  const startView = `<section class="dashboard-welcome"><div class="dashboard-welcome-copy"><span class="help-kicker">SASKAITAGO · DARBO VIETA</span><h2>Pradėkite dirbti</h2><p>Užpildykite įmonės duomenis, pridėkite klientą ir paruoškite pirmą dokumentą. Jūsų apžvalga atsiras čia.</p><div class="dashboard-quick-actions"><button class="primary-button" data-action="new-invoice">＋ Kurti sąskaitą</button><button class="secondary-button" data-action="new-client">Pridėti klientą</button></div></div><div class="dashboard-welcome-art">${uiIcon("document")}</div></section><div class="dashboard-setup-grid"><section class="dashboard-setup-card"><span>01</span><div><b>Įmonės informacija</b><p>Nurodykite rekvizitus, kurie bus spausdinami sąskaitose.</p><button class="dashboard-text-link" data-view="settings-company">Atidaryti nustatymus →</button></div></section><section class="dashboard-setup-card"><span>02</span><div><b>Klientų sąrašas</b><p>Išsaugokite pirkėjų duomenis, kad galėtumėte juos greitai pasirinkti.</p><button class="dashboard-text-link" data-action="new-client">Pridėti klientą →</button></div></section><section class="dashboard-setup-card"><span>03</span><div><b>Pirmas dokumentas</b><p>Sąskaitos, išankstinės ir kreditinės valdomos vienoje vietoje.</p><button class="dashboard-text-link" data-action="new-invoice">Sukurti sąskaitą →</button></div></section></div>`;
  const overview = `<div class="dashboard-stats"><article class="dashboard-stat"><span class="dashboard-stat-label">Neapmokėta</span><span class="dashboard-stat-icon amber">${uiIcon("wallet")}</span><b>${currency(unpaid.reduce((sum,item) => sum + item.total, 0))}</b><small>${unpaid.length} sąskaitos · ${overdue.length} vėluoja</small></article><article class="dashboard-stat"><span class="dashboard-stat-label">Apmokėta</span><span class="dashboard-stat-icon green">${uiIcon("check")}</span><b>${currency(paid.reduce((sum,item) => sum + item.total, 0))}</b><small>${paid.length} apmokėta dokumentų</small></article><article class="dashboard-stat"><span class="dashboard-stat-label">Šį mėnesį</span><span class="dashboard-stat-icon blue">${uiIcon("document")}</span><b>${monthInvoices.length}</b><small>${currency(monthInvoices.reduce((sum,item) => sum + item.total, 0))} dokumentų suma</small></article><article class="dashboard-stat"><span class="dashboard-stat-label">Klientai</span><span class="dashboard-stat-icon violet">${uiIcon("building")}</span><b>${state.clients.length}</b><small>Išsaugota klientų</small></article></div><div class="dashboard-section-head"><div><h2>Naujausi dokumentai</h2><p>Paskutiniai sukurti dokumentai ir jų būsenos.</p></div><button class="secondary-button" data-view="invoices">Visos sąskaitos</button></div>${recent.length ? `<div class="table-card dashboard-recent"><table class="invoice-table"><thead><tr><th>Dokumentas</th><th>Klientas</th><th>Data</th><th>Būsena</th><th>Suma</th><th></th></tr></thead><tbody>${recent.map((invoice) => { const status=getStatus(invoice); return `<tr><td><div class="client-name">${esc(invoice.number)}</div><div class="sub-line">${typeNames[invoice.type] || "Dokumentas"}</div></td><td>${esc(invoice.client?.name || "—")}</td><td>${date(invoice.issueDate)}</td><td><span class="status status-${status}">${status === "overdue" ? "Vėluoja" : statusNames[status] || status}</span></td><td class="amount-cell">${currency(invoice.total)}</td><td><button class="tiny-button" data-action="print" data-id="${esc(invoice.id)}">Peržiūrėti</button></td></tr>`; }).join("")}</tbody></table></div>` : ""}`;
  $("#content").innerHTML = `<div class="page-head dashboard-page-head"><div><div class="eyebrow">SASKAITAGO · APŽVALGA</div><h1>Dashboard</h1><p>Jūsų veiklos santrauka vienoje vietoje.</p></div><div class="dashboard-quick-actions"><button class="secondary-button" data-action="new-client">＋ Klientas</button><button class="primary-button" data-action="new-invoice">＋ Nauja sąskaita</button></div></div>${isEmpty ? startView : overview}`;
}

function paginationMarkup(page, pageCount, action) {
  if (pageCount <= 1) return "";
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount].filter((n) => n >= 1 && n <= pageCount))];
  let previous = 0;
  const buttons = pages.map((number) => {
    const gap = number - previous > 1 ? `<span class="pagination-gap">…</span>` : "";
    previous = number;
    return `${gap}<button class="page-button ${number === page ? "current" : ""}" data-action="${action}" data-page="${number}" ${number === page ? 'aria-current="page"' : ""}>${number}</button>`;
  }).join("");
  return `<nav class="pagination" aria-label="Puslapių navigacija"><button class="page-button" data-action="${action}" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>←</button>${buttons}<button class="page-button" data-action="${action}" data-page="${page + 1}" ${page >= pageCount ? "disabled" : ""}>→</button></nav>`;
}

function renderInvoices() {
  $("#content").classList.add("content-wide");
  const invoices = state.invoices;
  const visible = getVisibleInvoices();
  const openTotal = invoices.filter((item) => item.status === "issued").reduce((sum, item) => sum + item.total, 0);
  const paidTotal = invoices.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.total, 0);
  const monthStart = today().slice(0, 7);
  const monthCount = invoices.filter((item) => item.issueDate.startsWith(monthStart)).length;
  const pageCount = Math.max(1, Math.ceil(visible.length / state.pageSize));
  state.invoicePage = Math.min(state.invoicePage, pageCount);
  const pageItems = visible.slice((state.invoicePage - 1) * state.pageSize, state.invoicePage * state.pageSize);
  const rows = pageItems.map((invoice) => {
    const overdue = invoice.status === "issued" && invoice.dueDate && invoice.dueDate < today();
    const status = overdue ? "overdue" : invoice.status;
    const label = { issued: "Laukia apmokėjimo", paid: "Apmokėta", overdue: "Vėluoja", cancelled: "Atšaukta" }[status] || status;
    const type = { proforma: "Išankstinė", vat: "Sąskaita faktūra", credit: "Kreditinė" }[invoice.type];
    return `<tr><td><button class="number-link" data-action="print" data-id="${invoice.id}">${esc(invoice.number)}</button><div class="sub-line">${type}</div></td><td><div class="client-name">${esc(invoice.client.name)}</div><div class="sub-line">${esc(invoice.client.companyCode || invoice.client.email)}</div></td><td>${date(invoice.issueDate)}</td><td>${date(invoice.dueDate)}</td><td><span class="status status-${status}">${label}</span></td><td class="amount-cell">${currency(invoice.total)}</td><td><div class="row-actions"><button class="tiny-button" data-action="print" data-id="${invoice.id}">PDF</button>${invoice.status === "issued" ? `<button class="tiny-button" data-action="paid" data-id="${invoice.id}">Apmokėta</button>` : ""}</div></td></tr>`;
  }).join("");
  $("#content").innerHTML = `<div class="page-head"><div><div class="eyebrow">SaskaitaGO · DARBO VIETA</div><h1>Sąskaitos</h1><p>Visi jūsų įmonės pardavimo dokumentai vienoje vietoje.</p></div><button class="primary-button" data-action="new-invoice"><span class="button-icon">＋</span> Nauja sąskaita</button></div>
    <div class="stats"><div class="stat-card blue"><div class="stat-top">Laukia apmokėjimo<span class="stat-icon">◷</span></div><div class="stat-value">${currency(openTotal)}</div><div class="stat-foot">${invoices.filter((i) => i.status === "issued").length} neapmokėtos sąskaitos</div></div><div class="stat-card"><div class="stat-top">Apmokėta iš viso<span class="stat-icon">✓</span></div><div class="stat-value">${currency(paidTotal)}</div><div class="stat-foot">${invoices.filter((i) => i.status === "paid").length} apmokėtos sąskaitos</div></div><div class="stat-card orange"><div class="stat-top">Šį mėnesį išrašyta<span class="stat-icon">▤</span></div><div class="stat-value">${monthCount}</div><div class="stat-foot">dokumentai ${new Date().toLocaleDateString(preferences.language === "en" ? "en-IE" : "lt-LT", { month: "long", year: "numeric" })}</div></div></div>
    <div class="toolbar invoice-toolbar"><div class="tabs">${[["all", "Visos"], ["issued", "Laukia apmokėjimo"], ["paid", "Apmokėtos"], ["overdue", "Vėluoja"]].map(([key, label]) => `<button class="tab ${state.filter === key ? "selected" : ""}" data-filter="${key}">${label}</button>`).join("")}</div><div class="list-tools"><label class="filter-label">Dokumento tipas<select id="invoiceTypeFilter"><option value="all" ${state.typeFilter === "all" ? "selected" : ""}>Visi tipai</option><option value="proforma" ${state.typeFilter === "proforma" ? "selected" : ""}>Išankstinės</option><option value="vat" ${state.typeFilter === "vat" ? "selected" : ""}>PVM sąskaitos</option><option value="credit" ${state.typeFilter === "credit" ? "selected" : ""}>Kreditinės</option></select></label><input class="search" id="searchInput" placeholder="Numeris arba klientas…" value="${esc(state.search)}"></div></div>
    <div class="table-card">${rows ? `<table class="invoice-table"><thead><tr><th>Sąskaita</th><th>Klientas</th><th>Išrašyta</th><th>Apmokėti iki</th><th>Statusas</th><th>Suma</th><th></th></tr></thead><tbody>${rows}</tbody></table><div class="table-footer"><span>Rodoma ${visible.length ? (state.invoicePage - 1) * state.pageSize + 1 : 0}–${Math.min(state.invoicePage * state.pageSize, visible.length)} iš ${visible.length} dokumentų</span><span>Valiuta · EUR</span>${paginationMarkup(state.invoicePage, pageCount, "invoice-page")}</div>` : `<div class="empty-state"><div class="empty-icon">▤</div><h3>${invoices.length ? "Sąskaitų nerasta" : "Jūsų pirmoji sąskaita laukia"}</h3><p>${invoices.length ? "Pakeiskite paieškos frazę arba pasirinkite kitą filtrą." : "Sukurkite sąskaitą klientui. Numeracija, sumos ir PVM bus apskaičiuoti automatiškai."}</p>${invoices.length ? "" : `<button class="primary-button" data-action="new-invoice">＋ Kurti pirmą sąskaitą</button>`}</div>`}</div>`;
  enhanceSelects($("#content"));
  $("#searchInput")?.addEventListener("input", (event) => { state.search = event.target.value; state.invoicePage = 1; const pos = event.target.selectionStart; renderInvoices(); const next = $("#searchInput"); next.focus(); next.setSelectionRange(pos, pos); });
  $("#invoiceTypeFilter")?.addEventListener("change", (event) => { state.typeFilter = event.target.value; state.invoicePage = 1; renderInvoices(); });
}

function contactIcon(type) {
  const paths = {
    email: `<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path>`,
    phone: `<path d="M7 3h3l2 5-2 2a15 15 0 0 0 4 4l2-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 5 5a2 2 0 0 1 2-2Z"></path>`,
    address: `<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle>`,
  };
  return `<svg class="client-contact-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[type]}</svg>`;
}

function renderClients() {
  $("#content").classList.add("content-wide");
  const needle = state.clientSearch.trim().toLocaleLowerCase("lt-LT");
  const filtered = state.clients.filter((client) => !needle || `${client.name} ${client.companyCode} ${client.vatCode} ${client.email} ${client.phone}`.toLocaleLowerCase("lt-LT").includes(needle));
  const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.clientPage = Math.min(state.clientPage, pageCount);
  const pageItems = filtered.slice((state.clientPage - 1) * state.pageSize, state.clientPage * state.pageSize);
  const rows = pageItems.map((client) => `<tr><td><div class="client-name">${esc(client.name)}</div><div class="sub-line">${client.companyCode ? `Įm. kodas ${esc(client.companyCode)}` : "Klientas"}</div></td><td>${esc(client.vatCode || "—")}</td><td>${esc(client.email || "—")}</td><td>${esc(client.phone || "—")}</td><td>${esc(client.address || "—")}</td><td><div class="row-actions"><button class="tiny-button" data-action="edit-client" data-id="${esc(client.id)}">Redaguoti</button><button class="tiny-button danger-button" data-action="delete-client" data-id="${esc(client.id)}">Ištrinti</button></div></td></tr>`).join("");
  $("#content").innerHTML = `<div class="page-head"><div><div class="eyebrow">SaskaitaGO · DARBO VIETA</div><h1>Klientai</h1><p>Klientų duomenys išsaugomi tik šiame kompiuteryje.</p></div><button class="primary-button" data-action="new-client">＋ Pridėti klientą</button></div>${state.clients.length ? `<div class="toolbar client-toolbar"><span class="client-count">Klientai · ${filtered.length}</span><div class="list-tools"><input class="search" id="clientSearchInput" placeholder="Pavadinimas, kodas, el. paštas…" value="${esc(state.clientSearch)}"></div></div><div class="table-card"><table class="invoice-table client-table"><thead><tr><th>Klientas</th><th>PVM kodas</th><th>El. paštas</th><th>Telefonas</th><th>Adresas</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty-inline">Pagal paiešką klientų nerasta.</td></tr>`}</tbody></table><div class="table-footer"><span>Rodoma ${filtered.length ? (state.clientPage - 1) * state.pageSize + 1 : 0}–${Math.min(state.clientPage * state.pageSize, filtered.length)} iš ${filtered.length} klientų</span>${paginationMarkup(state.clientPage, pageCount, "client-page")}</div></div>` : `<div class="table-card empty-state"><div class="empty-icon">♧</div><h3>Klientų sąrašas tuščias</h3><p>Klientas bus įtrauktas automatiškai, kai išrašysite pirmą sąskaitą.</p><button class="secondary-button" data-action="new-client">Pridėti klientą</button></div>`}`;
  $("#clientSearchInput")?.addEventListener("input", (event) => { state.clientSearch = event.target.value; state.clientPage = 1; const pos = event.target.selectionStart; renderClients(); const next = $("#clientSearchInput"); next.focus(); next.setSelectionRange(pos, pos); });
}

function modal(title, subtitle, body, footer = "", wide = false, headerExtra = "") {
  $("#modalRoot").innerHTML = `<div class="modal-backdrop" data-action="backdrop"><section class="modal ${wide ? "wide" : ""} ${headerExtra ? "invoice-modal" : ""}" role="dialog" aria-modal="true"><header class="modal-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div><button class="close-button" data-action="close">×</button></header>${headerExtra}<div class="modal-body">${body}</div>${footer ? `<footer class="modal-foot">${footer}</footer>` : ""}</section></div>`;
}
function closeModal() { $("#modalRoot").innerHTML = ""; }

function renderOnboarding(step = 1) {
  const s = state.settings;
  const business = s.businessType || "individual";
  const isIndividual = business === "individual";
  const vatStatus = s.vatStatus || "none";
  const steps = ["Veiklos forma", "Duomenys", "PVM statusas", "Logotipas"];
  const active = Math.max(1, Math.min(4, step));
  const stepContent = active === 1 ? `
    <div class="onboarding-intro"><span class="eyebrow">SaskaitaGO · PRADĖKIME</span><h1>Susikurkite savo darbo vietą</h1><p>Pasirinkite šalį ir veiklos formą. Šiuo metu palaikoma Lietuva.</p></div>
    <div class="field"><label>Šalis</label><select name="country" disabled><option value="LT" selected>Lietuva</option></select><span class="hint">Kitų šalių palaikymą pridėsime vėliau.</span></div>
    <div class="section-title">Jūsų veiklos forma</div><div class="choice-grid">
      ${[["individual","Individuali veikla pagal pažymą","Veikiu kaip fizinis asmuo"],["mb","Mažoji bendrija (MB)","Mažosios bendrijos apskaita"],["uab","Uždaroji akcinė bendrovė (UAB)","UAB apskaita"]].map(([value,title,sub])=>`<label class="choice-card ${business===value?"selected":""}"><input type="radio" name="businessType" value="${value}" ${business===value?"checked":""}><span><b>${title}</b><small>${sub}</small></span><i></i></label>`).join("")}
    </div>` : active === 2 ? `
    <div class="onboarding-intro"><span class="eyebrow">2 ŽINGSNIS IŠ 4</span><h1>${isIndividual?"Jūsų duomenys":"Įmonės duomenys"}</h1><p>Ši informacija bus pateikta jūsų išrašomuose dokumentuose.</p></div>
    <div class="form-grid">
      ${isIndividual ? `<div class="field"><label>Vardas *</label><input name="firstName" required value="${esc(s.firstName||"")}" autocomplete="given-name"></div><div class="field"><label>Pavardė *</label><input name="lastName" required value="${esc(s.lastName||"")}" autocomplete="family-name"></div><div class="field"><label>Individualios veiklos pažymos numeris</label><input name="activityNumber" required value="${esc(s.activityNumber||"")}" placeholder="Pažymos numeris"></div><div class="field"><label>Asmens kodas <span class="optional">(neprivaloma)</span></label><input name="personalCode" value="${esc(s.personalCode||"")}" autocomplete="off"><span class="hint">Asmens kodą įveskite tik jei norite, kad jis būtų nurodytas dokumentuose.</span></div>` : `<div class="field full"><label>Įmonės pavadinimas *</label><input name="company" required value="${esc((s.company||"").toLocaleUpperCase("lt-LT"))}" placeholder="Įmonės pavadinimas" autocomplete="organization"></div><div class="field"><label>Įmonės kodas *</label><input name="companyCode" required value="${esc(s.companyCode||"")}" inputmode="numeric"></div><div class="field"><label>Atstovo vardas *</label><input name="representativeName" required value="${esc(s.representativeName||"")}" placeholder="Vardas ir pavardė" autocomplete="name"></div>`}
      <div class="field full"><label>Adresas *</label><input name="address" required value="${esc(s.address||"")}" autocomplete="street-address"></div>
      <div class="field"><label>El. paštas</label><input name="email" type="email" value="${esc(s.email||"")}" autocomplete="email"></div><div class="field"><label>Telefonas</label><input name="phone" type="tel" value="${esc(s.phone||"")}" autocomplete="tel"></div>
    </div>` : active === 3 ? `
    <div class="onboarding-intro"><span class="eyebrow">3 ŽINGSNIS IŠ 4</span><h1>Ar esate PVM mokėtojas?</h1><p>Pasirinkimas nustato dokumento pavadinimą ir numatytą PVM tarifą. Jį galėsite keisti nustatymuose.</p></div>
    <div class="choice-grid vat-choices">
      ${[["none","Ne PVM mokėtojas","Dokumentas: Sąskaita faktūra. PVM suma neskaičiuojama."],["standard","PVM mokėtojas","Dokumentas: PVM sąskaita faktūra. Įveskite PVM kodą."],["svs","PVM mokėtojas, taikantis SVS Lietuvoje","PVM kodas nurodomas, tačiau PVM tarifas priklauso nuo sandorio."]].map(([value,title,sub])=>`<label class="choice-card ${vatStatus===value?"selected":""}"><input type="radio" name="vatStatus" value="${value}" ${vatStatus===value?"checked":""}><span><b>${title}</b><small>${sub}</small></span><i></i></label>`).join("")}
    </div><div class="field vat-code-field" ${vatStatus==="none"?"hidden":""}><label>PVM mokėtojo kodas *</label><input name="vatCode" value="${esc(s.vatCode||"")}" placeholder="LT100000000000" ${vatStatus==="none"?"":"required"}><span class="hint">Jei nesate tikri dėl SVS taikymo ar tarifo, pasitikslinkite su VMI arba buhalteriu.</span></div>` : `
    <div class="onboarding-intro"><span class="eyebrow">4 ŽINGSNIS IŠ 4</span><h1>Pridėkite savo logotipą</h1><p>Logotipas bus rodomas sąskaitos viršuje. Taip pat galite pridėti mokėjimo rekvizitus.</p></div>
    <div class="field"><label>Logotipas</label><input type="file" id="onboardingLogoFile" accept="image/png,image/jpeg,image/webp,image/svg+xml"><input type="hidden" name="logo" value="${esc(s.logo||"")}"><div class="settings-logo-row" id="onboardingLogoPreview">${s.logo?`<img class="logo-preview" src="${esc(s.logo)}" alt="Logotipas">`:`<span class="hint">Pasirinkite PNG, JPG, WEBP arba SVG failą (iki 140 KB).</span>`}</div></div>
    <div class="section-title">Mokėjimo rekvizitai <span class="optional">(neprivaloma)</span></div><div class="form-grid"><div class="field"><label>IBAN</label><input name="iban" value="${esc(s.iban||"")}" placeholder="LT00 0000 0000 0000 0000"></div><div class="field"><label>Bankas</label><input name="bank" value="${esc(s.bank||"")}"></div><div class="field"><label>El. paštas</label><input name="email" type="email" value="${esc(s.email||"")}"></div><div class="field"><label>Telefonas</label><input name="phone" type="tel" value="${esc(s.phone||"")}"></div></div>
    <div class="onboarding-note"><b>Prieš išrašant pirmą sąskaitą</b><span>Patikrinkite, ar įvesti duomenys teisingi. SaskaitaGO išsaugo duomenis tik šiame kompiuteryje.</span></div>`;
  const content = `<div class="onboarding-shell"><aside class="onboarding-side"><a class="brand" href="/" aria-label="SaskaitaGO"><span class="brand-mark"><img class="brand-app-icon" src="/saskaitago-icon.svg" alt=""></span><span>Saskaita<span class="brand-light">GO</span></span></a><div class="onboarding-side-copy"><div class="eyebrow">SĄSKAITOS PAPRASTAI</div><h2>Jūsų sąskaitų darbo vieta.</h2><p>Viskas veikia šiame kompiuteryje. Jūsų duomenys lieka pas jus.</p></div><div class="powered-by"><span>POWERED BY</span><a href="https://cloudcore.lt" target="_blank" rel="noopener noreferrer">CLOUDCORE <i>↗</i></a></div></aside><main class="onboarding-main"><div class="onboarding-progress"><span>PRADINIS NUSTATYMAS</span><span>${active} / 4</span></div><div class="progress-track"><i style="width:${active*25}%"></i></div><div class="onboarding-steps">${steps.map((label,index)=>`<span class="${index+1===active?"current":index+1<active?"done":""}"><i>${index+1<active?"✓":index+1}</i>${label}</span>`).join("")}</div><form id="onboardingForm" data-step="${active}">${stepContent}<div class="onboarding-actions">${active>1?`<button class="secondary-button" type="button" data-action="onboarding-back">Atgal</button>`:`<span></span>`}${active<4?`<button class="primary-button" type="button" data-action="onboarding-next">Tęsti <span>→</span></button>`:`<button class="primary-button" type="button" data-action="onboarding-save">Išsaugoti ir pradėti <span>→</span></button>`}</div></form></main></div>`;
  $(".app-shell").hidden = true; $("#modalRoot").innerHTML = ""; $("#onboardingRoot").innerHTML = content;
  const form = $("#onboardingForm");
  enhanceSelects(form);
  form.addEventListener("change", (event) => {
    if (event.target.name === "businessType") { s.businessType = event.target.value; renderOnboarding(1); }
    if (event.target.name === "vatStatus") { s.vatCode = form.elements.vatCode?.value || s.vatCode || ""; s.vatStatus = event.target.value; renderOnboarding(3); }
    $$(".choice-card", form).forEach((card) => card.classList.toggle("selected", card.querySelector("input")?.checked));
  });
  $("#onboardingLogoFile")?.addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 140_000) { toast("Logotipas turi būti mažesnis nei 140 KB", "error"); event.target.value = ""; return; }
    const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    s.logo = encoded; $("input[name=logo]", form).value = encoded; $("#onboardingLogoPreview").innerHTML = `<img class="logo-preview" src="${encoded}" alt="Logotipas">`;
  });
}

function collectOnboardingStep(form) {
  const values = Object.fromEntries(new FormData(form));
  if (values.company) values.company = values.company.toLocaleUpperCase("lt-LT");
  Object.assign(state.settings, values);
  if (values.firstName || values.lastName) state.settings.company = [values.firstName || state.settings.firstName, values.lastName || state.settings.lastName].filter(Boolean).join(" ");
}

function openSettings() {
  state.view = "settings-company"; render();
}

function uiIcon(name) {
  const paths = {
    building: '<path d="M4 20V6.5L12 3l8 3.5V20H4Z"/><path d="M8 8h1m6 0h1M8 11h1m6 0h1M10 20v-5h4v5"/>',
    wallet: '<rect x="3.5" y="6" width="17" height="14" rx="2.5"/><path d="M16 14h4.5M6 6V4.5A1.5 1.5 0 0 1 7.5 3h11"/><circle cx="16" cy="14" r=".7"/>',
    document: '<path d="M7 3.5h7l4 4v13H7a2 2 0 0 1-2-2v-12a3 3 0 0 1 2-3Z"/><path d="M14 3.5v4h4M9 12h6m-6 3.5h6"/>',
    sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v2"/>',
    check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
    folder: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-10Z"/><path d="M3.5 10h17"/>',
    book: '<path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v16H7a2.5 2.5 0 0 0-2.5 2v-15.5Z"/><path d="M4.5 18.5A2.5 2.5 0 0 1 7 16h12.5M9 7h6m-6 3h6"/>',
    settings: '<path d="M4 6h6m4 0h6M4 12h2m4 0h10M4 18h8m4 0h4"/><circle cx="12" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>',
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.document}</svg>`;
}

function renderSettingsPage(section = "company") {
  const s = state.settings;
  const company = section === "company";
  const representativeFields = ["mb", "uab"].includes(s.businessType) ? `<div class="field full"><label>Atstovo vardas</label><input name="representativeName" value="${esc(s.representativeName)}" placeholder="Vardas ir pavardė" autocomplete="name"></div>` : "";
  const outputDirectoryCard = `<section class="settings-card output-directory-card"><div class="settings-card-head"><span class="settings-symbol">${uiIcon("folder")}</span><div><h2>PDF išvesties aplankas</h2><p>Pasirinkite vietą, kurioje programa išsaugos sąskaitų PDF failus.</p></div></div><div class="output-directory-row"><input form="settingsForm" id="outputDirectory" name="outputDirectory" value="${esc(s.outputDirectory || "")}" placeholder="Pasirinkite aplanką savo kompiuteryje"><button type="button" class="secondary-button" data-action="choose-output-directory">${uiIcon("folder")} Pasirinkti aplanką</button></div><span class="hint">Išsaugant PDF failą, jis bus įrašytas į šį aplanką. Jei aplankas nepasirinktas, galėsite nurodyti vietą kiekvieną kartą.</span></section>`;
  const companyForm = `<form id="settingsForm" class="settings-form"><section class="settings-card"><div class="settings-card-head"><span class="settings-symbol">${uiIcon("building")}</span><div><h2>Įmonės profilis</h2><p>Ši informacija rodoma jūsų išrašomuose dokumentuose.</p></div></div><div class="form-grid"><div class="field full"><label>Įmonės pavadinimas *</label><input name="company" required value="${esc((s.company||"").toLocaleUpperCase("lt-LT"))}" placeholder="UAB Pavyzdys"></div><div class="field"><label>Įmonės kodas</label><input name="companyCode" value="${esc(s.companyCode)}"></div><div class="field"><label>PVM mokėtojo kodas</label><input name="vatCode" value="${esc(s.vatCode)}" placeholder="LT100000000000"></div><div class="field full"><label>Adresas</label><input name="address" value="${esc(s.address)}"></div>${representativeFields}<div class="field"><label>El. paštas</label><input type="email" name="email" value="${esc(s.email)}"></div><div class="field"><label>Telefonas</label><input name="phone" value="${esc(s.phone)}"></div></div></section><section class="settings-card"><div class="settings-card-head"><span class="settings-symbol">${uiIcon("wallet")}</span><div><h2>Mokėjimo rekvizitai</h2><p>Banko informacija, įtraukiama į sąskaitas.</p></div></div><div class="form-grid"><div class="field"><label>IBAN</label><input name="iban" value="${esc(s.iban)}" placeholder="LT00 0000 0000 0000 0000"></div><div class="field"><label>Bankas</label><input name="bank" value="${esc(s.bank)}"></div></div></section><section class="settings-card"><div class="settings-card-head"><span class="settings-symbol">${uiIcon("document")}</span><div><h2>Dokumentai</h2><p>Numatytosios sąskaitų reikšmės ir prekės ženklas.</p></div></div><div class="form-grid"><div class="field"><label>Sąskaitų serijos prefiksas</label><input name="series" maxlength="12" value="${esc(s.series || "SG")}"><span class="hint">Pavyzdys: SG-${new Date().getFullYear()}-0001. Išankstinėms ir kreditinėms naudojamos IS ir KR serijos.</span></div><div class="field"><label>Apmokėjimo terminas (dienomis)</label><input name="paymentTermDays" type="number" min="1" max="365" step="1" required value="${esc(s.paymentTermDays ?? 14)}"><span class="hint">Automatiškai siūlomas terminas naujoms sąskaitoms.</span></div><div class="field full"><label>Įmonės logotipas</label><input type="file" id="logoFile" class="logo-file-input" accept="image/png,image/jpeg,image/webp,image/svg+xml"><input type="hidden" name="logo" value="${esc(s.logo)}"><div class="logo-uploader"><div class="logo-dropzone ${s.logo ? "has-logo" : ""}" id="logoDropzone" role="button" tabindex="0" aria-label="Įkelti įmonės logotipą"><div class="logo-preview-wrap" id="logoPreview">${s.logo ? `<img src="${esc(s.logo)}" alt="Įmonės logotipo peržiūra">` : `<span class="logo-upload-icon">${uiIcon("document")}</span>`}</div><div class="logo-drop-copy"><b id="logoUploadTitle">${s.logo ? "Logotipas įkeltas" : "Nutempkite logotipą čia"}</b><span id="logoUploadHint">${s.logo ? "Peržiūrėkite, pakeiskite arba pašalinkite vaizdą." : "arba pasirinkite failą iš savo įrenginio"}</span></div><span class="logo-upload-action">${s.logo ? "Pakeisti" : "Pasirinkti failą"}</span></div><div class="logo-upload-footer"><span>PNG, JPG, WEBP arba SVG · iki 140 KB</span>${s.logo ? `<button class="logo-remove" type="button" data-action="logo-remove">Pašalinti logotipą</button>` : ""}</div></div></div></div></section></form>`;
  const programForm = `<form id="settingsForm" class="settings-form"><section class="settings-card"><div class="settings-card-head"><span class="settings-symbol">${uiIcon("sliders")}</span><div><h2>Programos išvaizda</h2><p>Pasirinkite patogią kalbą ir spalvų temą.</p></div></div><div class="form-grid"><div class="field"><label>Sąsajos kalba</label><select name="uiLanguage"><option value="lt" ${(s.uiLanguage || preferences.language) === "lt" ? "selected" : ""}>Lietuvių</option><option value="en" ${(s.uiLanguage || preferences.language) === "en" ? "selected" : ""}>English</option></select></div><div class="field"><label>Spalvų tema</label><select name="uiTheme"><option value="light" ${(s.uiTheme || preferences.theme) === "light" ? "selected" : ""}>Šviesi</option><option value="dark" ${(s.uiTheme || preferences.theme) === "dark" ? "selected" : ""}>Tamsi</option></select></div></div></section>${outputDirectoryCard}<section class="settings-card settings-info"><div class="settings-card-head"><span class="settings-symbol">${uiIcon("lock")}</span><div><h2>Duomenų saugojimas</h2><p>Darbo vieta veikia šiame kompiuteryje. Įmonės, klientų ir sąskaitų duomenys saugomi vietinėje programos darbo vietoje.</p></div></div></section></form>`;
  $("#content").innerHTML = `<div class="page-head settings-page-head"><div><div class="eyebrow">SASKAITAGO · KONFIGŪRACIJA</div><h1>Nustatymai</h1><p>${company ? "Tvarkykite įmonės rekvizitus, kurie naudojami sąskaitose." : "Pritaikykite programą savo darbo aplinkai."}</p></div><button class="primary-button" data-action="save-settings">Išsaugoti pakeitimus</button></div><div class="settings-layout"><nav class="settings-tabs" aria-label="Nustatymų skyriai"><button class="settings-tab ${company ? "active" : ""}" data-view="settings-company"><span>${uiIcon("building")}</span><b>Įmonė</b><small>Rekvizitai ir dokumentai</small></button><button class="settings-tab ${!company ? "active" : ""}" data-view="settings-program"><span>${uiIcon("settings")}</span><b>Programa</b><small>Kalba, tema ir duomenys</small></button><button class="settings-tab" data-view="help"><span>${uiIcon("book")}</span><b>Naudojimo vadovas</b><small>Darbo su programa instrukcija</small></button></nav><div class="settings-main">${company ? companyForm : programForm}<div class="settings-savebar"><span>Pakeitimai įsigalios išsaugojus.</span><button class="primary-button" data-action="save-settings">Išsaugoti pakeitimus</button></div></div></div>`;
  enhanceSelects($("#settingsForm"));
  if (!company) return;
  const fileInput = $("#logoFile"), dropzone = $("#logoDropzone");
  const loadLogo = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { toast("Pasirinkite PNG, JPG, WEBP arba SVG vaizdą", "error"); return; }
    if (file.size > 140_000) { toast("Logotipas turi būti mažesnis nei 140 KB", "error"); fileInput.value = ""; return; }
    const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    $("input[name=logo]").value = encoded;
    $("#logoPreview").innerHTML = `<img src="${encoded}" alt="Įmonės logotipo peržiūra">`;
    $("#logoUploadTitle").textContent = "Logotipas įkeltas";
    $("#logoUploadHint").textContent = "Peržiūrėkite, pakeiskite arba pašalinkite vaizdą.";
    dropzone.classList.add("has-logo");
    dropzone.querySelector(".logo-upload-action").textContent = "Pakeisti";
    $(".logo-upload-footer").innerHTML = `<span>PNG, JPG, WEBP arba SVG · iki 140 KB</span><button class="logo-remove" type="button" data-action="logo-remove">Pašalinti logotipą</button>`;
  };
  dropzone.addEventListener("click", (event) => { if (!event.target.closest("button")) fileInput.click(); });
  dropzone.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener("change", () => loadLogo(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((type) => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((type) => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.remove("dragging"); }));
  dropzone.addEventListener("drop", (event) => loadLogo(event.dataTransfer.files[0]));
}

function renderHelpPage() {
  if (state.firstRunGuide) { localStorage.setItem("saskaitago.guideSeen", "1"); state.firstRunGuide = false; }
  $("#content").innerHTML = `<div class="page-head settings-page-head"><div><div class="eyebrow">SASKAITAGO · PAGALBA</div><h1>Nustatymai</h1><p>Programos nustatymai ir darbo su dokumentais instrukcija.</p></div><button class="primary-button" data-action="begin-work">Pradėti dirbti</button></div><div class="settings-layout"><nav class="settings-tabs" aria-label="Nustatymų skyriai"><button class="settings-tab" data-view="settings-company"><span>${uiIcon("building")}</span><b>Įmonė</b><small>Rekvizitai ir dokumentai</small></button><button class="settings-tab" data-view="settings-program"><span>${uiIcon("settings")}</span><b>Programa</b><small>Kalba, tema ir duomenys</small></button><button class="settings-tab active" data-view="help"><span>${uiIcon("book")}</span><b>Naudojimo vadovas</b><small>Darbo su programa instrukcija</small></button></nav><div class="settings-main"><div class="help-grid"><section class="settings-card help-intro"><span class="help-kicker">PRADŽIA</span><h2>Kasdienis darbas su SaskaitaGO</h2><p>Programa padeda tvarkyti klientus, rengti pardavimo dokumentus ir sekti jų apmokėjimą. Duomenys saugomi šio kompiuterio darbo vietoje.</p></section><section class="settings-card help-card"><span class="help-number">01</span><h2>Įveskite įmonės duomenis</h2><p>Nustatymų skiltyje „Įmonė“ įrašykite pavadinimą, registracijos duomenis ir banko rekvizitus. Jie bus naudojami dokumentuose.</p></section><section class="settings-card help-card"><span class="help-number">02</span><h2>Sukurkite klientą</h2><p>Atidarykite „Klientai“ ir pasirinkite „Pridėti klientą“. Išsaugoti klientai bus pasiekiami kuriant sąskaitą.</p></section><section class="settings-card help-card"><span class="help-number">03</span><h2>Išrašykite dokumentą</h2><p>Sąskaitose pasirinkite „Nauja sąskaita“, nurodykite klientą, datas ir eilutes. Sistema apskaičiuos sumas pagal pasirinktus PVM tarifus.</p></section><section class="settings-card help-card"><span class="help-number">04</span><h2>Sekite apmokėjimą</h2><p>Sąskaitų sąraše filtruokite dokumentus pagal būseną. Gavę apmokėjimą pažymėkite sąskaitą kaip apmokėtą.</p></section><section class="settings-card help-card"><span class="help-number">05</span><h2>Dokumentų tipai</h2><p>Išankstinė sąskaita skirta avansui, PVM sąskaita faktūra – pardavimui, o kreditinė sąskaita susiejama su anksčiau išrašytu dokumentu.</p></section><section class="settings-card help-note"><b>Prieš pradedant</b><p>Patikrinkite pirkėjo duomenis, datas, PVM taikymą ir mokėjimo informaciją. Teisingą mokestinį režimą įvertinkite pagal savo sandorį.</p><button class="secondary-button" data-view="settings-company">Atidaryti įmonės nustatymus</button></section></div></div></div>`;
}

function clientFields(client = {}, prefix = "client") {
  return `<div class="form-grid"><div class="field full"><label>Klientas / įmonė *</label><input name="${prefix}Name" required value="${esc((client.name||"").toLocaleUpperCase("lt-LT"))}" placeholder="Pirkėjo pavadinimas"></div><div class="field"><label>Įmonės kodas</label><input name="${prefix}CompanyCode" value="${esc(client.companyCode)}"></div><div class="field"><label>PVM kodas</label><input name="${prefix}VatCode" value="${esc(client.vatCode)}"></div><div class="field full"><label>Adresas</label><input name="${prefix}Address" value="${esc(client.address)}"></div><div class="field"><label>El. paštas</label><input type="email" name="${prefix}Email" value="${esc(client.email)}"></div><div class="field"><label>Telefonas</label><input name="${prefix}Phone" value="${esc(client.phone)}"></div></div>`;
}

function openNewClient() {
  modal("Naujas klientas", "Kliento duomenys bus išsaugoti šiame kompiuteryje.", `<form id="clientForm">${clientFields()}</form>`, `<button class="secondary-button" data-action="close">Atšaukti</button><button class="primary-button" data-action="save-client">Išsaugoti klientą</button>`);
}

function openEditClient(client) {
  modal("Redaguoti klientą", "Pakeitimai bus taikomi būsimiems dokumentams.", `<form id="clientForm">${clientFields(client)}</form>`, `<button class="secondary-button" data-action="close">Atšaukti</button><button class="primary-button" data-action="update-client" data-id="${esc(client.id)}">Išsaugoti pakeitimus</button>`);
}

function isVatRegistered() {
  return ["standard", "svs"].includes(state.settings.vatStatus) || Boolean(state.settings.vatCode?.trim());
}

function itemRow(item = {}) {
  const qty = item.quantity ?? 1, price = item.unitPrice ?? "", vat = item.vatRate ?? (isVatRegistered() ? 21 : 0);
  const rates = isVatRegistered() ? [21, 9, 5, 0] : [0];
  return `<div class="item-row"><input name="description" placeholder="Paslaugos arba prekės pavadinimas" value="${esc(item.description)}" required><input name="quantity" type="number" min="0.01" step="0.01" value="${qty}" aria-label="Kiekis"><input name="unitPrice" type="number" min="0" step="0.01" value="${price}" placeholder="0,00" aria-label="Vieneto kaina"><select name="vatRate" aria-label="PVM tarifas">${rates.map((rate) => `<option value="${rate}" ${Number(vat) === rate ? "selected" : ""}>${rate}%</option>`).join("")}</select><span class="line-total">—</span><button class="remove-item" type="button" data-action="remove-item" title="Pašalinti">×</button></div>`;
}

function openNewInvoice() {
  const clientOptions = state.clients.map((client) => `<option value="${client.id}">${esc(client.name)}</option>`).join("");
  const vatOptions = state.invoices.filter((invoice) => invoice.type === "vat").map((invoice) => `<option value="${invoice.id}">${esc(invoice.number)} · ${esc(invoice.client.name)} · ${currency(invoice.total)}</option>`).join("");
  const proformaOptions = state.invoices.filter((invoice) => invoice.type === "proforma").map((invoice) => `<option value="${invoice.id}">${esc(invoice.number)} · ${esc(invoice.client.name)} · ${currency(invoice.total)}</option>`).join("");
  const typeSwitch = `<div class="invoice-type-switch" role="tablist" aria-label="Sąskaitos tipas"><button class="type-choice" type="button" role="tab" aria-selected="false" data-type="proforma">Išankstinė</button><button class="type-choice active" type="button" role="tab" aria-selected="true" data-type="vat">Sąskaita faktūra</button><button class="type-choice" type="button" role="tab" aria-selected="false" data-type="credit">Kreditinė</button></div>`;
  const body = `<form id="invoiceForm">
    <input type="hidden" name="type" value="vat"><div class="alert" id="creditAlert" hidden>Kreditinės sąskaitos eilutės ir suma bus įrašytos su minuso ženklu.</div>
    <div class="section-title">Pirkėjas</div><div class="invoice-client-select" id="invoiceClientPicker"><div class="field"><label>Klientas / įmonė *</label><select id="savedClient" required><option value="">Pasirinkite klientą iš sąrašo</option>${clientOptions}</select></div><button class="secondary-button" type="button" data-action="invoice-new-client">＋ Sukurti naują klientą</button></div><div class="client-fields" id="invoiceClientFields" hidden></div>
    <div class="form-grid" style="margin-top:13px"><div class="field"><label>Išrašymo data</label><input name="issueDate" type="date" value="${today()}" required></div><div class="field"><label>Apmokėti iki</label><input name="dueDate" type="date" value="${addDays(today(), Number(state.settings.paymentTermDays ?? 14))}"></div>
    <div class="field full" id="proformaField" hidden><label>Išankstinė sąskaita</label><select name="proformaInvoiceId"><option value="">Be išankstinės sąskaitos</option>${proformaOptions}</select></div>
    <div class="field full" id="relatedField" hidden><label>Kredituojama sąskaita *</label><select name="relatedInvoiceId"><option value="">Pasirinkti sąskaitą</option>${vatOptions}</select></div>
    <div class="field full" id="advanceField" hidden><label>Įskaitytas avansas (€)</label><input name="advanceApplied" type="number" min="0" step="0.01" value="0"><span class="hint">Sąskaitoje bus rodomos visa suma, įskaitytas avansas ir likutis.</span></div></div>
    <div class="section-title">Prekės ir paslaugos</div><div class="items-editor"><div class="item-head"><span>Aprašymas</span><span>Kiekis</span><span>Kaina €</span><span>PVM</span><span>Suma</span><span></span></div><div id="itemsList">${itemRow()}</div></div>
    <div class="items-bottom"><button type="button" class="ghost-button" data-action="add-item">＋ Pridėti eilutę</button><div class="totals-preview"><span>Be PVM <b id="subtotalPreview">0,00 €</b></span><span>PVM <b id="vatPreview">0,00 €</b></span><span>Iš viso <b id="totalPreview">0,00 €</b></span></div></div>
    <div class="field" style="margin-top:15px"><label>Pastabos</label><textarea name="notes" placeholder="Papildoma informacija pirkėjui"></textarea></div></form>`;
  modal("Nauja sąskaita", "Numeris ir sumos bus apskaičiuoti automatiškai.", body, `<button class="secondary-button" data-action="close">Atšaukti</button><button class="primary-button" data-action="save-invoice">Išrašyti sąskaitą</button>`, true, typeSwitch);
  const form = $("#invoiceForm");
  enhanceSelects(form);
  form.addEventListener("input", updateInvoicePreview);
  form.addEventListener("change", updateInvoicePreview);
  form.elements.issueDate.addEventListener("change", () => { const dueDate = form.elements.dueDate; if (dueDate.dataset.userEdited !== "true") dueDate.value = addDays(form.elements.issueDate.value, Number(state.settings.paymentTermDays ?? 14)); });
  form.elements.dueDate.addEventListener("input", () => { form.elements.dueDate.dataset.userEdited = "true"; });
  $("#savedClient").addEventListener("change", updateInvoicePreview);
  updateInvoicePreview();
}

function updateInvoicePreview() {
  const form = $("#invoiceForm"); if (!form) return;
  const type = form.elements.type.value;
  const sign = type === "credit" ? -1 : 1;
  $$(".type-choice", $("#modalRoot")).forEach((button) => { const selected = button.dataset.type === type; button.classList.toggle("active", selected); button.setAttribute("aria-selected", String(selected)); });
  $("#creditAlert").hidden = type !== "credit";
  $("#relatedField").hidden = type !== "credit";
  form.elements.relatedInvoiceId.required = type === "credit";
  $("#proformaField").hidden = type !== "vat";
  $("#advanceField").hidden = type !== "vat";
  $("[data-action=save-invoice]").textContent = type === "proforma" ? "Išrašyti išankstinę" : type === "credit" ? "Išrašyti kreditinę" : "Išrašyti sąskaitą";
  let subtotal = 0, vatTotal = 0;
  $$(".item-row", form).forEach((row) => {
    const quantity = Math.max(0, Number($("[name=quantity]", row).value) || 0);
    const price = Math.max(0, Number($("[name=unitPrice]", row).value) || 0);
    const vat = Math.max(0, Number($("[name=vatRate]", row).value) || 0);
    const line = Math.round(quantity * price * 100) / 100;
    const lineVat = Math.round(line * vat) / 100;
    subtotal += line; vatTotal += lineVat;
    $(".line-total", row).textContent = currency(sign * (line + lineVat));
  });
  subtotal = Math.round(subtotal * 100) / 100; vatTotal = Math.round(vatTotal * 100) / 100;
  $("#subtotalPreview").textContent = currency(sign * subtotal); $("#vatPreview").textContent = currency(sign * vatTotal); $("#totalPreview").textContent = currency(sign * (subtotal + vatTotal));
}

function readClient(form, prefix = "client") {
  return {
    id: prefix === "client" ? $("#savedClient")?.value || "" : "",
    name: form.elements[`${prefix}Name`].value.trim().toLocaleUpperCase("lt-LT"), companyCode: form.elements[`${prefix}CompanyCode`].value.trim(),
    vatCode: form.elements[`${prefix}VatCode`].value.trim(), address: form.elements[`${prefix}Address`].value.trim(),
    email: form.elements[`${prefix}Email`].value.trim(), phone: form.elements[`${prefix}Phone`].value.trim(),
  };
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action], [data-filter], [data-type], [data-view]");
  if (!target) return;
  if (target.dataset.view) { state.view = target.dataset.view; render(); return; }
  if (target.dataset.filter) { state.filter = target.dataset.filter; state.invoicePage = 1; renderInvoices(); return; }
  if (target.dataset.type) { $("#invoiceForm").elements.type.value = target.dataset.type; updateInvoicePreview(); return; }
  const action = target.dataset.action;
  try {
    if (action === "begin-work") { localStorage.setItem("saskaitago.guideSeen", "1"); state.view = "invoices"; render(); return; }
    if (action === "choose-output-directory") {
      if (!window.saskaitago?.chooseInvoiceFolder) { toast("Aplanko pasirinkimas pasiekiamas darbalaukio programoje", "error"); return; }
      const directory = await window.saskaitago.chooseInvoiceFolder();
      if (directory) {
        const form = $("#settingsForm");
        const payload = { ...state.settings, ...Object.fromEntries(new FormData(form)), outputDirectory: directory };
        const result = await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
        state.settings = result.settings;
        Object.assign(preferences, { language: payload.uiLanguage || preferences.language, theme: payload.uiTheme || preferences.theme });
        savePreferences();
        $("#outputDirectory").value = directory;
        toast("PDF aplankas pasirinktas ir išsaugotas. Nauji PDF bus kuriami šiame aplanke.");
      }
      return;
    }
    if (action === "logo-remove") {
      $("input[name=logo]", $("#settingsForm")).value = ""; $("#logoFile").value = "";
      const zone = $("#logoDropzone"); zone.classList.remove("has-logo");
      $("#logoPreview").innerHTML = `<span class="logo-upload-icon">${uiIcon("document")}</span>`;
      $("#logoUploadTitle").textContent = "Nutempkite logotipą čia"; $("#logoUploadHint").textContent = "arba pasirinkite failą iš savo įrenginio";
      zone.querySelector(".logo-upload-action").textContent = "Pasirinkti failą";
      $(".logo-upload-footer").innerHTML = "<span>PNG, JPG, WEBP arba SVG · iki 140 KB</span>"; return;
    }
    if (action === "onboarding-back") { const form = $("#onboardingForm"); collectOnboardingStep(form); return renderOnboarding(Number(form.dataset.step)-1); }
    if (action === "onboarding-next" || action === "onboarding-save") {
      const form = $("#onboardingForm"); if (!validateForm(form)) return; collectOnboardingStep(form);
      const step = Number(form.dataset.step);
      if (action === "onboarding-next") return renderOnboarding(step+1);
      const payload = { ...state.settings, company: state.settings.company || [state.settings.firstName,state.settings.lastName].filter(Boolean).join(" "), onboardingCompleted: true };
      const result = await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
      state.settings = result.settings; $("#onboardingRoot").innerHTML = ""; $(".app-shell").hidden = false; state.firstRunGuide = true; state.view = "help"; render(); toast("Darbo vieta paruošta"); return;
    }
    if (action === "new-invoice") return openNewInvoice();
    if (action === "new-client") return openNewClient();
    if (action === "invoice-page") { state.invoicePage = Number(target.dataset.page) || 1; renderInvoices(); return; }
    if (action === "client-page") { state.clientPage = Number(target.dataset.page) || 1; renderClients(); return; }
    if (action === "edit-client") { const client = state.clients.find((item) => item.id === target.dataset.id); if (client) openEditClient(client); return; }
    if (action === "delete-client") {
      const client = state.clients.find((item) => item.id === target.dataset.id); if (!client) return;
      if (!window.confirm(`Ištrinti klientą „${client.name}“? Jau išrašytos sąskaitos nebus pakeistos.`)) return;
      await api(`/api/clients/${encodeURIComponent(client.id)}`, { method: "DELETE" });
      state.clients = state.clients.filter((item) => item.id !== client.id); render(); toast("Klientas ištrintas"); return;
    }
    if (action === "invoice-new-client") {
      const picker = $("#invoiceClientPicker"), fields = $("#invoiceClientFields"), select = $("#savedClient");
      picker.hidden = true; fields.hidden = false; select.required = false; fields.innerHTML = `${clientFields()}<div class="invoice-client-actions"><button class="ghost-button invoice-client-back" type="button" data-action="invoice-use-existing">← Pasirinkti iš bazės</button><button class="primary-button" type="button" data-action="invoice-save-new-client">Išsaugoti klientą</button></div>`;
      fields.querySelector("input[name=clientName]")?.focus(); return;
    }
    if (action === "invoice-save-new-client") {
      const fields = $("#invoiceClientFields");
      if (!validateControls(fields)) return;
      const form = $("#invoiceForm"), client = readClient(form); delete client.id;
      const result = await api("/api/clients", { method: "POST", body: JSON.stringify(client) });
      state.clients.unshift(result.client);
      const select = $("#savedClient"), option = new Option(result.client.name, result.client.id, true, true); select.add(option); select.required = true;
      const triggerValue = select.parentElement.querySelector(".custom-select-value"); if (triggerValue) triggerValue.textContent = result.client.name;
      select.parentElement.querySelector(".custom-select-trigger")?.classList.remove("is-placeholder");
      fields.hidden = true; fields.innerHTML = ""; $("#invoiceClientPicker").hidden = false; updateInvoicePreview(); toast("Klientas išsaugotas ir pasirinktas"); return;
    }
    if (action === "invoice-use-existing") {
      const picker = $("#invoiceClientPicker"), fields = $("#invoiceClientFields"), select = $("#savedClient");
      fields.hidden = true; fields.innerHTML = ""; picker.hidden = false; select.required = true; select.focus(); return;
    }
    if (action === "close" || (action === "backdrop" && event.target === target)) return closeModal();
    if (action === "print") { const id = target.dataset.id; if (window.saskaitago?.openInvoiceWindow) return window.saskaitago.openInvoiceWindow(id); window.location.assign(`/invoice/${encodeURIComponent(id)}`); return; }
    if (action === "remove-item") { target.closest(".item-row").remove(); updateInvoicePreview(); return; }
    if (action === "add-item") { $("#itemsList").insertAdjacentHTML("beforeend", itemRow()); enhanceSelects($("#itemsList")); updateInvoicePreview(); return; }
    if (action === "save-settings") {
      const form = $("#settingsForm"); if (!validateForm(form)) return;
      const payload = { ...state.settings, ...Object.fromEntries(new FormData(form)) };
      const nextPreferences = { language: payload.uiLanguage || preferences.language, theme: payload.uiTheme || preferences.theme };
      if (payload.company) payload.company = payload.company.toLocaleUpperCase("lt-LT");
      const result = await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
      state.settings = result.settings; Object.assign(preferences, nextPreferences); savePreferences(); render(); toast("Nustatymai išsaugoti"); return;
    }
    if (action === "save-client") {
      const form = $("#clientForm"); if (!validateForm(form)) return;
      const client = readClient(form);
      const result = await api("/api/clients", { method: "POST", body: JSON.stringify(client) });
      state.clients.unshift(result.client); closeModal(); render(); toast("Klientas išsaugotas"); return;
    }
    if (action === "update-client") {
      const form = $("#clientForm"); if (!validateForm(form)) return;
      const client = readClient(form); client.id = target.dataset.id;
      const result = await api(`/api/clients/${encodeURIComponent(client.id)}`, { method: "PUT", body: JSON.stringify(client) });
      state.clients = state.clients.map((item) => item.id === result.client.id ? result.client : item);
      closeModal(); render(); toast("Kliento duomenys atnaujinti"); return;
    }
    if (action === "save-invoice") {
      if (!state.settings.company) { toast("Pirmiausia įrašykite savo įmonės duomenis", "error"); return openSettings(); }
      const form = $("#invoiceForm"); if (!validateForm(form)) return;
      const selected = state.clients.find((item) => item.id === $("#savedClient").value);
      const client = selected || readClient(form);
      const items = $$(".item-row", form).map((row) => ({ description: $("[name=description]", row).value, quantity: $("[name=quantity]", row).value, unitPrice: $("[name=unitPrice]", row).value, vatRate: $("[name=vatRate]", row).value }));
      const relatedInvoiceId = form.elements.type.value === "proforma" ? "" : form.elements.type.value === "credit" ? form.elements.relatedInvoiceId.value : form.elements.proformaInvoiceId.value;
      const payload = { type: form.elements.type.value, client, issueDate: form.elements.issueDate.value, dueDate: form.elements.dueDate.value, relatedInvoiceId, advanceApplied: form.elements.advanceApplied?.value || 0, notes: form.elements.notes.value, items };
      const result = await api("/api/invoices", { method: "POST", body: JSON.stringify(payload) });
      state.invoices.unshift(result.invoice); state.clients = [...new Map([result.invoice.client, ...state.clients].map((item) => [item.id, item])).values()];
      closeModal(); render();
      if (state.settings.outputDirectory && window.saskaitago?.saveInvoicePdf) {
        try {
          await window.saskaitago.saveInvoicePdf(result.invoice.id, state.settings.outputDirectory, true);
          toast(`Išrašyta sąskaita ${result.invoice.number} · PDF išsaugotas`);
        } catch (error) {
          toast(`Sąskaita ${result.invoice.number} išrašyta, bet PDF neišsaugotas: ${friendlyError(error)}`, "error");
        }
      } else toast(`Išrašyta sąskaita ${result.invoice.number}`);
      return;
    }
    if (action === "paid") {
      const result = await api(`/api/invoices/${encodeURIComponent(target.dataset.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: "paid" }) });
      state.invoices = state.invoices.map((item) => item.id === result.invoice.id ? result.invoice : item); render(); toast("Sąskaita pažymėta kaip apmokėta");
    }
  } catch (error) { toast(friendlyError(error), "error"); }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("input[name=company], input[name=clientName]")) {
    const input = event.target, start = input.selectionStart, end = input.selectionEnd;
    input.value = input.value.toLocaleUpperCase("lt-LT");
    input.setSelectionRange(start, end);
  }
  if (event.target.matches(".item-row input, .item-row select")) updateInvoicePreview();
});
$("#settingsButton").addEventListener("click", openSettings);
$("#topSettings").addEventListener("click", openSettings);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

api("/api/workspace").then((workspace) => { Object.assign(state, workspace); Object.assign(preferences, { language: workspace.settings.uiLanguage || preferences.language, theme: workspace.settings.uiTheme || preferences.theme }); savePreferences(); if (!state.settings.onboardingCompleted) renderOnboarding(1); else { $(".app-shell").hidden = false; state.firstRunGuide = !localStorage.getItem("saskaitago.guideSeen"); if (state.firstRunGuide) state.view = "help"; render(); } }).catch((error) => {
  toast(friendlyError(error), "error");
  $(".app-shell").hidden = false;
  $("#content").innerHTML = `<div class="table-card empty-state"><h3>Nepavyko atidaryti darbo vietos</h3><p>${esc(error.message)}</p></div>`;
});
