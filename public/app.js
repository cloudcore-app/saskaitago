const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { settings: {}, clients: [], invoices: [], view: "invoices", filter: "all", search: "" };
const esc = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const currency = (value) => `${Number(value || 0).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const date = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("lt-LT") : "—";
const today = () => new Date().toISOString().slice(0, 10);

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Nepavyko atlikti veiksmo");
  return body;
}

function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("visible");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("visible"), 2800);
}

function hydrateHeader() {
  const name = state.settings.company || "Jūsų įmonė";
  $("#profileName").textContent = name;
  $("#avatar").textContent = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SG";
  $("#navCount").textContent = state.invoices.length;
  $("#pageCrumb").textContent = state.view === "clients" ? "Klientai" : "Sąskaitos";
}

function render() {
  hydrateHeader();
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  if (state.view === "clients") renderClients(); else renderInvoices();
}

function getVisibleInvoices() {
  const todayValue = today();
  return state.invoices.filter((invoice) => {
    const effective = invoice.status === "issued" && invoice.dueDate && invoice.dueDate < todayValue ? "overdue" : invoice.status;
    const matchesFilter = state.filter === "all" || effective === state.filter;
    const needle = state.search.trim().toLowerCase();
    const matchesSearch = !needle || `${invoice.number} ${invoice.client.name} ${invoice.client.companyCode}`.toLowerCase().includes(needle);
    return matchesFilter && matchesSearch;
  });
}

function renderInvoices() {
  const invoices = state.invoices;
  const visible = getVisibleInvoices();
  const openTotal = invoices.filter((item) => item.status === "issued").reduce((sum, item) => sum + item.total, 0);
  const paidTotal = invoices.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.total, 0);
  const monthStart = today().slice(0, 7);
  const monthCount = invoices.filter((item) => item.issueDate.startsWith(monthStart)).length;
  const rows = visible.map((invoice) => {
    const overdue = invoice.status === "issued" && invoice.dueDate && invoice.dueDate < today();
    const status = overdue ? "overdue" : invoice.status;
    const label = { issued: "Laukia apmokėjimo", paid: "Apmokėta", overdue: "Vėluoja", cancelled: "Atšaukta" }[status] || status;
    const type = { proforma: "Išankstinė", vat: "Sąskaita faktūra", credit: "Kreditinė" }[invoice.type];
    return `<tr><td><button class="number-link" data-action="print" data-id="${invoice.id}">${esc(invoice.number)}</button><div class="sub-line">${type}</div></td><td><div class="client-name">${esc(invoice.client.name)}</div><div class="sub-line">${esc(invoice.client.companyCode || invoice.client.email)}</div></td><td>${date(invoice.issueDate)}</td><td>${date(invoice.dueDate)}</td><td><span class="status status-${status}">${label}</span></td><td class="amount-cell">${currency(invoice.total)}</td><td><div class="row-actions"><button class="tiny-button" data-action="print" data-id="${invoice.id}">PDF</button>${invoice.status === "issued" ? `<button class="tiny-button" data-action="paid" data-id="${invoice.id}">Apmokėta</button>` : ""}</div></td></tr>`;
  }).join("");
  $("#content").innerHTML = `<div class="page-head"><div><div class="eyebrow">SASKAITAGO · DARBO VIETA</div><h1>Sąskaitos</h1><p>Visi jūsų įmonės pardavimo dokumentai vienoje vietoje.</p></div><button class="primary-button" data-action="new-invoice"><span class="button-icon">＋</span> Nauja sąskaita</button></div>
    <div class="stats"><div class="stat-card blue"><div class="stat-top">Laukia apmokėjimo<span class="stat-icon">◷</span></div><div class="stat-value">${currency(openTotal)}</div><div class="stat-foot">${invoices.filter((i) => i.status === "issued").length} neapmokėtos sąskaitos</div></div><div class="stat-card"><div class="stat-top">Apmokėta iš viso<span class="stat-icon">✓</span></div><div class="stat-value">${currency(paidTotal)}</div><div class="stat-foot">${invoices.filter((i) => i.status === "paid").length} apmokėtos sąskaitos</div></div><div class="stat-card orange"><div class="stat-top">Šį mėnesį išrašyta<span class="stat-icon">▤</span></div><div class="stat-value">${monthCount}</div><div class="stat-foot">dokumentai ${new Date().toLocaleDateString("lt-LT", { month: "long", year: "numeric" })}</div></div></div>
    <div class="toolbar"><div class="tabs">${[["all", "Visos"], ["issued", "Laukia apmokėjimo"], ["paid", "Apmokėtos"], ["overdue", "Vėluoja"]].map(([key, label]) => `<button class="tab ${state.filter === key ? "selected" : ""}" data-filter="${key}">${label}</button>`).join("")}</div><input class="search" id="searchInput" placeholder="Ieškoti pagal numerį, klientą…" value="${esc(state.search)}"></div>
    <div class="table-card">${rows ? `<table class="invoice-table"><thead><tr><th>Sąskaita</th><th>Klientas</th><th>Išrašyta</th><th>Apmokėti iki</th><th>Statusas</th><th>Suma</th><th></th></tr></thead><tbody>${rows}</tbody></table><div class="table-footer"><span>Rodoma ${visible.length} iš ${invoices.length} dokumentų</span><span>Valiuta · EUR</span></div>` : `<div class="empty-state"><div class="empty-icon">▤</div><h3>${invoices.length ? "Sąskaitų nerasta" : "Jūsų pirmoji sąskaita laukia"}</h3><p>${invoices.length ? "Pakeiskite paieškos frazę arba pasirinkite kitą filtrą." : "Sukurkite sąskaitą klientui. Numeracija, sumos ir PVM bus apskaičiuoti automatiškai."}</p>${invoices.length ? "" : `<button class="primary-button" data-action="new-invoice">＋ Kurti pirmą sąskaitą</button>`}</div>`}</div>`;
  $("#searchInput")?.addEventListener("input", (event) => { state.search = event.target.value; const pos = event.target.selectionStart; renderInvoices(); const next = $("#searchInput"); next.focus(); next.setSelectionRange(pos, pos); });
}

function renderClients() {
  const cards = state.clients.map((client) => `<article class="client-card"><h3>${esc(client.name)}</h3><div class="client-id">${client.companyCode ? `Įm. kodas ${esc(client.companyCode)}` : "Klientas"}${client.vatCode ? ` · PVM ${esc(client.vatCode)}` : ""}</div>${client.email ? `<p>✉ ${esc(client.email)}</p>` : ""}${client.phone ? `<p>☎ ${esc(client.phone)}</p>` : ""}${client.address ? `<p>⌖ ${esc(client.address)}</p>` : ""}</article>`).join("");
  $("#content").innerHTML = `<div class="page-head"><div><div class="eyebrow">SASKAITAGO · DARBO VIETA</div><h1>Klientai</h1><p>Klientų duomenys išsaugomi tik šiame kompiuteryje.</p></div><button class="primary-button" data-action="new-client">＋ Pridėti klientą</button></div>${cards ? `<div class="client-grid">${cards}</div>` : `<div class="table-card empty-state"><div class="empty-icon">♧</div><h3>Klientų sąrašas tuščias</h3><p>Klientas bus įtrauktas automatiškai, kai išrašysite pirmą sąskaitą.</p><button class="secondary-button" data-action="new-client">Pridėti klientą</button></div>`}`;
}

function modal(title, subtitle, body, footer = "", wide = false) {
  $("#modalRoot").innerHTML = `<div class="modal-backdrop" data-action="backdrop"><section class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true"><header class="modal-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div><button class="close-button" data-action="close">×</button></header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-foot">${footer}</footer>` : ""}</section></div>`;
}
function closeModal() { $("#modalRoot").innerHTML = ""; }

function openSettings() {
  const s = state.settings;
  const body = `<form id="settingsForm"><div class="section-title">Įmonės duomenys</div><div class="form-grid"><div class="field full"><label>Įmonės pavadinimas *</label><input name="company" required value="${esc(s.company)}" placeholder="UAB Pavyzdys"></div><div class="field"><label>Įmonės kodas</label><input name="companyCode" value="${esc(s.companyCode)}"></div><div class="field"><label>PVM mokėtojo kodas</label><input name="vatCode" value="${esc(s.vatCode)}" placeholder="LT100000000000"></div><div class="field full"><label>Adresas</label><input name="address" value="${esc(s.address)}"></div><div class="field"><label>El. paštas</label><input type="email" name="email" value="${esc(s.email)}"></div><div class="field"><label>Telefonas</label><input name="phone" value="${esc(s.phone)}"></div></div><div class="section-title">Mokėjimo rekvizitai</div><div class="form-grid"><div class="field"><label>IBAN</label><input name="iban" value="${esc(s.iban)}" placeholder="LT00 0000 0000 0000 0000"></div><div class="field"><label>Bankas</label><input name="bank" value="${esc(s.bank)}"></div></div><div class="section-title">Sąskaitų numeracija</div><div class="form-grid"><div class="field"><label>Serijos prefiksas</label><input name="series" maxlength="12" value="${esc(s.series || "SG")}"><span class="hint">Pavyzdys: SG-${new Date().getFullYear()}-0001. Išankstinėms ir kreditinėms naudojamos serijos IS ir KR.</span></div><div class="field"><label>Įmonės logotipas</label><input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp,image/svg+xml"><input type="hidden" name="logo" value="${esc(s.logo)}"><div class="settings-logo-row" id="logoPreview">${s.logo ? `<img class="logo-preview" src="${esc(s.logo)}" alt="Logotipas">` : `<span class="hint">Logotipas dar neįkeltas</span>`}</div></div></div></form>`;
  modal("Įmonės nustatymai", "Šie duomenys bus naudojami jūsų sąskaitose.", body, `<button class="secondary-button" data-action="close">Atšaukti</button><button class="primary-button" data-action="save-settings">Išsaugoti nustatymus</button>`);
  $("#logoFile").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 140_000) { toast("Logotipas turi būti mažesnis nei 140 KB"); event.target.value = ""; return; }
    const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    $("input[name=logo]").value = encoded;
    $("#logoPreview").innerHTML = `<img class="logo-preview" src="${encoded}" alt="Logotipas">`;
  });
}

function clientFields(client = {}, prefix = "client") {
  return `<div class="form-grid"><div class="field full"><label>Klientas / įmonė *</label><input name="${prefix}Name" required value="${esc(client.name)}" placeholder="Pirkėjo pavadinimas"></div><div class="field"><label>Įmonės kodas</label><input name="${prefix}CompanyCode" value="${esc(client.companyCode)}"></div><div class="field"><label>PVM kodas</label><input name="${prefix}VatCode" value="${esc(client.vatCode)}"></div><div class="field full"><label>Adresas</label><input name="${prefix}Address" value="${esc(client.address)}"></div><div class="field"><label>El. paštas</label><input type="email" name="${prefix}Email" value="${esc(client.email)}"></div><div class="field"><label>Telefonas</label><input name="${prefix}Phone" value="${esc(client.phone)}"></div></div>`;
}

function openNewClient() {
  modal("Naujas klientas", "Kliento duomenys bus išsaugoti šiame kompiuteryje.", `<form id="clientForm">${clientFields()}</form>`, `<button class="secondary-button" data-action="close">Atšaukti</button><button class="primary-button" data-action="save-client">Išsaugoti klientą</button>`);
}

function itemRow(item = {}) {
  const qty = item.quantity ?? 1, price = item.unitPrice ?? "", vat = item.vatRate ?? 21;
  return `<div class="item-row"><input name="description" placeholder="Paslaugos arba prekės pavadinimas" value="${esc(item.description)}" required><input name="quantity" type="number" min="0.01" step="0.01" value="${qty}" aria-label="Kiekis"><input name="unitPrice" type="number" min="0" step="0.01" value="${price}" placeholder="0,00" aria-label="Vieneto kaina"><select name="vatRate" aria-label="PVM tarifas">${[21, 9, 5, 0].map((rate) => `<option value="${rate}" ${Number(vat) === rate ? "selected" : ""}>${rate}%</option>`).join("")}</select><span class="line-total">—</span><button class="remove-item" type="button" data-action="remove-item" title="Pašalinti">×</button></div>`;
}

function openNewInvoice() {
  const clientOptions = state.clients.map((client) => `<option value="${client.id}">${esc(client.name)}</option>`).join("");
  const vatOptions = state.invoices.filter((invoice) => invoice.type === "vat").map((invoice) => `<option value="${invoice.id}">${esc(invoice.number)} · ${esc(invoice.client.name)} · ${currency(invoice.total)}</option>`).join("");
  const proformaOptions = state.invoices.filter((invoice) => invoice.type === "proforma").map((invoice) => `<option value="${invoice.id}">${esc(invoice.number)} · ${esc(invoice.client.name)} · ${currency(invoice.total)}</option>`).join("");
  const body = `<form id="invoiceForm">
    <div class="invoice-type-switch"><button class="type-choice" type="button" data-type="proforma">Išankstinė</button><button class="type-choice active" type="button" data-type="vat">Sąskaita faktūra</button><button class="type-choice" type="button" data-type="credit">Kreditinė</button></div>
    <input type="hidden" name="type" value="vat"><div class="alert" id="creditAlert" hidden>Kreditinės sąskaitos eilutės ir suma bus įrašytos su minuso ženklu.</div>
    <div class="section-title">Pirkėjas</div><div class="form-grid"><div class="field full"><label>Pasirinkti iš sąrašo</label><select id="savedClient"><option value="">Naujas klientas — įveskite duomenis žemiau</option>${clientOptions}</select></div></div><div class="client-fields">${clientFields()}</div>
    <div class="form-grid" style="margin-top:13px"><div class="field"><label>Išrašymo data</label><input name="issueDate" type="date" value="${today()}" required></div><div class="field"><label>Apmokėti iki</label><input name="dueDate" type="date" value=""></div>
    <div class="field full" id="proformaField" hidden><label>Išankstinė sąskaita</label><select name="proformaInvoiceId"><option value="">Be išankstinės sąskaitos</option>${proformaOptions}</select></div>
    <div class="field full" id="relatedField" hidden><label>Kredituojama sąskaita *</label><select name="relatedInvoiceId"><option value="">Pasirinkti sąskaitą</option>${vatOptions}</select></div>
    <div class="field full" id="advanceField" hidden><label>Įskaitytas avansas (€)</label><input name="advanceApplied" type="number" min="0" step="0.01" value="0"><span class="hint">Sąskaitoje bus rodomos visa suma, įskaitytas avansas ir likutis.</span></div></div>
    <div class="section-title">Prekės ir paslaugos</div><div class="items-editor"><div class="item-head"><span>Aprašymas</span><span>Kiekis</span><span>Kaina €</span><span>PVM</span><span>Suma</span><span></span></div><div id="itemsList">${itemRow()}</div></div>
    <div class="items-bottom"><button type="button" class="ghost-button" data-action="add-item">＋ Pridėti eilutę</button><div class="totals-preview"><span>Be PVM <b id="subtotalPreview">0,00 €</b></span><span>PVM <b id="vatPreview">0,00 €</b></span><span>Iš viso <b id="totalPreview">0,00 €</b></span></div></div>
    <div class="field" style="margin-top:15px"><label>Pastabos</label><textarea name="notes" placeholder="Papildoma informacija pirkėjui"></textarea></div></form>`;
  modal("Nauja sąskaita", "Numeris ir sumos bus apskaičiuoti automatiškai.", body, `<button class="secondary-button" data-action="close">Atšaukti</button><button class="primary-button" data-action="save-invoice">Išrašyti sąskaitą</button>`, true);
  const form = $("#invoiceForm");
  form.addEventListener("input", updateInvoicePreview);
  form.addEventListener("change", updateInvoicePreview);
  $("#savedClient").addEventListener("change", (event) => {
    const client = state.clients.find((item) => item.id === event.target.value);
    const target = $(".client-fields"); target.innerHTML = clientFields(client || {}); updateInvoicePreview();
  });
  updateInvoicePreview();
}

function updateInvoicePreview() {
  const form = $("#invoiceForm"); if (!form) return;
  const type = form.elements.type.value;
  const sign = type === "credit" ? -1 : 1;
  $$(".type-choice", form).forEach((button) => button.classList.toggle("active", button.dataset.type === type));
  $("#creditAlert").hidden = type !== "credit";
  $("#relatedField").hidden = type !== "credit";
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
    name: form.elements[`${prefix}Name`].value.trim(), companyCode: form.elements[`${prefix}CompanyCode`].value.trim(),
    vatCode: form.elements[`${prefix}VatCode`].value.trim(), address: form.elements[`${prefix}Address`].value.trim(),
    email: form.elements[`${prefix}Email`].value.trim(), phone: form.elements[`${prefix}Phone`].value.trim(),
  };
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action], [data-filter], [data-type], [data-view]");
  if (!target) return;
  if (target.dataset.view) { state.view = target.dataset.view; render(); return; }
  if (target.dataset.filter) { state.filter = target.dataset.filter; renderInvoices(); return; }
  if (target.dataset.type) { $("#invoiceForm").elements.type.value = target.dataset.type; updateInvoicePreview(); return; }
  const action = target.dataset.action;
  try {
    if (action === "new-invoice") return openNewInvoice();
    if (action === "new-client") return openNewClient();
    if (action === "close" || (action === "backdrop" && event.target === target)) return closeModal();
    if (action === "print") return window.open(`/invoice/${encodeURIComponent(target.dataset.id)}`, "_blank", "noopener");
    if (action === "remove-item") { target.closest(".item-row").remove(); updateInvoicePreview(); return; }
    if (action === "add-item") { $("#itemsList").insertAdjacentHTML("beforeend", itemRow()); updateInvoicePreview(); return; }
    if (action === "save-settings") {
      const form = $("#settingsForm"); if (!form.reportValidity()) return;
      const payload = Object.fromEntries(new FormData(form));
      const result = await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
      state.settings = result.settings; closeModal(); render(); toast("Įmonės nustatymai išsaugoti"); return;
    }
    if (action === "save-client") {
      const form = $("#clientForm"); if (!form.reportValidity()) return;
      const client = readClient(form);
      const result = await api("/api/clients", { method: "POST", body: JSON.stringify(client) });
      state.clients.unshift(result.client); closeModal(); render(); toast("Klientas išsaugotas"); return;
    }
    if (action === "save-invoice") {
      if (!state.settings.company) { toast("Pirmiausia įrašykite savo įmonės duomenis"); return openSettings(); }
      const form = $("#invoiceForm"); if (!form.reportValidity()) return;
      const selected = state.clients.find((item) => item.id === $("#savedClient").value);
      const client = selected || readClient(form);
      const items = $$(".item-row", form).map((row) => ({ description: $("[name=description]", row).value, quantity: $("[name=quantity]", row).value, unitPrice: $("[name=unitPrice]", row).value, vatRate: $("[name=vatRate]", row).value }));
      const relatedInvoiceId = form.elements.type.value === "proforma" ? "" : form.elements.type.value === "credit" ? form.elements.relatedInvoiceId.value : form.elements.proformaInvoiceId.value;
      const payload = { type: form.elements.type.value, client, issueDate: form.elements.issueDate.value, dueDate: form.elements.dueDate.value, relatedInvoiceId, advanceApplied: form.elements.advanceApplied?.value || 0, notes: form.elements.notes.value, items };
      const result = await api("/api/invoices", { method: "POST", body: JSON.stringify(payload) });
      state.invoices.unshift(result.invoice); state.clients = [...new Map([result.invoice.client, ...state.clients].map((item) => [item.id, item])).values()];
      closeModal(); render(); toast(`Išrašyta sąskaita ${result.invoice.number}`); return;
    }
    if (action === "paid") {
      const result = await api(`/api/invoices/${encodeURIComponent(target.dataset.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: "paid" }) });
      state.invoices = state.invoices.map((item) => item.id === result.invoice.id ? result.invoice : item); render(); toast("Sąskaita pažymėta kaip apmokėta");
    }
  } catch (error) { toast(error.message); }
});

document.addEventListener("input", (event) => {
  if (event.target.matches(".item-row input, .item-row select")) updateInvoicePreview();
});
$("#settingsButton").addEventListener("click", openSettings);
$("#topSettings").addEventListener("click", openSettings);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

api("/api/workspace").then((workspace) => { Object.assign(state, workspace); render(); if (!state.settings.company) openSettings(); }).catch((error) => {
  $("#content").innerHTML = `<div class="table-card empty-state"><h3>Nepavyko atidaryti darbo vietos</h3><p>${esc(error.message)}</p></div>`;
});
