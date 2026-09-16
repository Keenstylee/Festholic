const STORAGE_KEY = "iampromote_state_v1";
const DB_NAME = "iampromote_files";
const DB_VERSION = 1;
const FILE_STORE = "files";
const IS_DEPLOYED_WORKER = location.hostname.endsWith("workers.dev");
const IS_CLOUD_DEV = ["127.0.0.1", "localhost"].includes(location.hostname) && location.port === "8787";
const API_BASE = IS_DEPLOYED_WORKER || IS_CLOUD_DEV
  ? ""
  : "https://iampromote-api.keenscy10.workers.dev";
const CLOUD_MODE = IS_DEPLOYED_WORKER || IS_CLOUD_DEV;

const STATUS = {
  available: "Disponible",
  reserved: "Reservada",
  sold: "Vendida",
  delivered: "Entregada",
  delivery: "Por entregar",
  cancelled: "Anulada",
};

const PAYMENT_STATUS = {
  pending: "Pendiente",
  partial: "Parcial",
  paid: "Pagado",
  refunded: "Reembolsado",
};

const STATUS_SUBTEXT = {
  available: "Sin vender",
  reserved: "Pendiente pago",
  sold: "Completada",
  delivered: "Entrega confirmada",
  delivery: "Pendiente entrega",
  cancelled: "Anulada",
};

const shortId = (id) => {
  const clean = String(id || "").replace(/^[a-z]+_/i, "");
  return clean.length > 24 ? `${clean.slice(0, 23)}…` : clean;
};

const FESTHOLIC_MESSAGE_FOOTER = "Gestionado con Festholic\nwww.festholic.com";

function withFestholicFooter(message) {
  const cleanMessage = String(message || "").trim();
  if (/www\.festholic\.com/i.test(cleanMessage)) return cleanMessage;
  return `${cleanMessage}\n\n—\n${FESTHOLIC_MESSAGE_FOOTER}`;
}

const FORMAT_LABELS = {
  pdf: "PDF",
  image: "Imagen / QR",
  code: "Código",
  list: "Lista",
  reservation: "Reserva",
};

const FORMAT_ICONS = {
  pdf: "file-text",
  image: "image",
  code: "key-round",
  list: "list-checks",
  reservation: "user-round-check",
};

const defaultState = {
  events: [],
  tickets: [],
  clients: [],
  trash: [],
  activity: [],
  selectedEventId: null,
};

let state = loadState();
let currentView = "dashboard";
let eventStatusFilter = "active";
let uploadFormat = "file";
let queuedFiles = [];
let ticketUploadInProgress = false;
let eventImageData = "";
let pendingConfirm = null;
let selectedTickets = new Set();
let pendingReservationUploadClientId = "";
let cloudReady = false;
let syncTimer = null;
let syncInFlight = null;
let currentUser = null;
let feedbackEntries = [];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = (prefix = "id") => `${prefix}_${crypto.randomUUID()}`;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && Array.isArray(saved.events) ? { ...defaultState, ...saved } : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function persistLocalState() {
  if (CLOUD_MODE) return true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return false;
  }
}

function saveState() {
  persistLocalState();
  if (cloudReady) scheduleCloudSync();
}

function scheduleCloudSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncStateToCloud().catch(() => {
    showToast("No se pudo sincronizar con la nube. Revisa tu conexion e intenta otra vez.", "error");
  }), 500);
}

async function apiFetch(path, options = {}) {
  const { timeoutMs = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...(fetchOptions.body && !(fetchOptions.body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
        ...(fetchOptions.headers || {}),
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("La conexion tardo demasiado. Intenta nuevamente.");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  if (response.status === 401) {
    const next = `${location.pathname}${location.search}`;
    location.replace(`/login.html?next=${encodeURIComponent(next)}`);
    throw new Error("Tu sesión vencio. Inicia sesión nuevamente.");
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || `Error ${response.status}`);
  }
  return response;
}

async function loadCloudState() {
  const response = await apiFetch("/api/bootstrap");
  const remote = await response.json();
  state = {
    ...structuredClone(defaultState),
    events: remote.events || [],
    tickets: remote.tickets || [],
    clients: remote.clients || [],
    activity: remote.activity || [],
  };
  const deletedEvents = new Map(
    state.events
      .filter((item) => item.deletedAt)
      .map((item) => [item.id, item.deletedAt])
  );
  state.trash = [
    ...state.events.filter((item) => item.deletedAt).map((item) => ({
      id: item.id, type: "event", label: item.name, deletedAt: item.deletedAt,
    })),
    ...state.tickets.filter((item) => (
      item.deletedAt && deletedEvents.get(item.eventId) !== item.deletedAt
    )).map((item) => ({
      id: item.id, type: "ticket", label: item.internalCode, deletedAt: item.deletedAt,
    })),
  ];
  persistLocalState();
  if (CLOUD_MODE) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
  cloudReady = true;
}

async function syncStateToCloud() {
  if (!cloudReady) return;
  clearTimeout(syncTimer);
  if (syncInFlight) await syncInFlight;
  const snapshot = JSON.parse(JSON.stringify({
    events: state.events,
    tickets: state.tickets,
    clients: state.clients || [],
    activity: state.activity,
  }));
  syncInFlight = apiFetch("/api/state", {
    method: "PUT",
    body: JSON.stringify(snapshot),
  }).finally(() => {
    syncInFlight = null;
  });
  await syncInFlight;
}

async function uploadTicketFile(ticket, file) {
  const response = await apiFetch("/api/files", {
    method: "POST",
    body: file,
    timeoutMs: 90000,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Ticket-Id": ticket.id,
      "X-File-Name": encodeURIComponent(file.name),
    },
  });
  const uploaded = await response.json();
  ticket.objectKey = uploaded.objectKey;
  ticket.fileSize = uploaded.fileSize;
}

function seedDemoData() {
  if (state.events.length) return;
  const now = new Date();
  const future = (months, day = 15) => {
    const d = new Date(now.getFullYear(), now.getMonth() + months, day);
    return d.toISOString().slice(0, 10);
  };
  const events = [
    { id: uid("event"), name: "HUGEL Lima", date: future(2, 16), venue: "Paradiso Lima", status: "active", image: "", createdAt: Date.now() - 600000 },
    { id: uid("event"), name: "Romantic Style Vol. 1", date: future(1, 21), venue: "C.C. Cocos", status: "active", image: "", createdAt: Date.now() - 500000 },
    { id: uid("event"), name: "Cochinola 2026", date: future(3, 22), venue: "Lurin Live", status: "active", image: "", createdAt: Date.now() - 400000 },
  ];
  state.events = events;
  const demoTickets = [];
  events.forEach((event, eventIndex) => {
    const total = eventIndex === 0 ? 12 : eventIndex === 1 ? 10 : 8;
    for (let i = 1; i <= total; i += 1) {
      const sold = i <= 3;
      const reserved = i === 4;
      demoTickets.push({
        id: uid("ticket"),
        eventId: event.id,
        internalCode: `${eventIndex === 0 ? "HUG" : eventIndex === 1 ? "RS" : "COC"}-GEN-${String(i).padStart(3, "0")}`,
        format: i % 4 === 0 ? "code" : i % 5 === 0 ? "list" : "pdf",
        zone: i > total - 2 ? "VIP" : "General",
        basePrice: eventIndex === 1 ? (i > total - 2 ? 35 : 20) : 120 + eventIndex * 30,
        salePrice: sold ? 120 + eventIndex * 30 : 0,
        status: sold ? (i === 1 ? "delivered" : "sold") : reserved ? "reserved" : "available",
        paymentStatus: sold ? "paid" : "pending",
        paymentMethod: sold ? "yape" : "",
        buyerName: sold ? ["Andrea Salazar", "Luis Mendoza", "Valeria Rios"][i - 1] : reserved ? "Carlos Pena" : "",
        buyerPhone: sold ? `+51 999 000 10${i}` : reserved ? "+51 999 000 104" : "",
        buyerDocument: "",
        notes: "",
        codeValue: i % 4 === 0 ? `DEMO-${eventIndex + 1}-${i}XQ` : "",
        fileId: null,
        fileName: i % 4 === 0 || i % 5 === 0 ? "" : `entrada-${i}.pdf`,
        fileType: i % 4 === 0 || i % 5 === 0 ? "" : "application/pdf",
        createdAt: Date.now() - (total - i) * 45000,
        updatedAt: Date.now() - (total - i) * 45000,
        deletedAt: null,
      });
    }
  });
  state.tickets = demoTickets;
  state.activity = [
    activityEntry("ticket", "Entrada entregada", "Andrea Salazar recibio HUG-GEN-001"),
    activityEntry("payment", "Pago confirmado", "Luis Mendoza pago su entrada"),
    activityEntry("event", "Evento creado", "Cochinola 2026 fue agregado"),
  ];
  saveState();
}

function activityEntry(type, title, detail) {
  return { id: uid("activity"), type, title, detail, createdAt: Date.now() };
}

function addActivity(type, title, detail) {
  state.activity.unshift(activityEntry(type, title, detail));
  state.activity = state.activity.slice(0, 60);
}


function paymentMethodLogoHtml(method) {
  const key = String(method || "").trim().toLowerCase();
  const single = { yape: ["yape-seeklogo.png", "Yape"], plin: ["plin.png", "Plin"] }[key];
  if (single) return `<img class="payment-brand-logo" src="img/apps/${single[0]}" alt="${single[1]}">`;
  if (key === "card" || key === "tarjeta") return `<span class="payment-brand-pair"><img src="img/apps/visa.png" alt="Visa"><img src="img/apps/mastercard.png" alt="Mastercard"></span>`;
  return "";
}
function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = typeof value === "number" || /^\d{10,}$/.test(String(value))
    ? new Date(Number(value))
    : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - Number(timestamp || 0);
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function eventDateMs(event) {
  if (!event?.date) return Number.POSITIVE_INFINITY;
  const time = new Date(`${event.date}T12:00:00`).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function isPastEvent(event) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return eventDateMs(event) < todayStart;
}

function compareEventsByUpcoming(left, right) {
  const leftPast = isPastEvent(left);
  const rightPast = isPastEvent(right);
  if (leftPast !== rightPast) return leftPast ? 1 : -1;
  const leftTime = eventDateMs(left);
  const rightTime = eventDateMs(right);
  if (leftTime !== rightTime) return leftPast ? rightTime - leftTime : leftTime - rightTime;
  return String(left.name || "").localeCompare(String(right.name || ""), "es");
}

function getOrderedEvents(events) {
  return [...events].sort(compareEventsByUpcoming);
}

function getTicketOwner(ticket) {
  return ticket.buyerName || formatPhoneForDisplay(ticket.buyerPhone) || "Sin asignar";
}

function normalizeComparablePhone(phone) {
  return normalizeClientPhone(phone).replace(/\D/g, "");
}

function formatPhoneForDisplay(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("51") && digits.length === 11) {
    return `+51 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  if (digits.length === 9) {
    return `+51 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return raw;
}

function phoneSearchText(phone) {
  return `${phone || ""} ${formatPhoneForDisplay(phone)} ${normalizeComparablePhone(phone)}`;
}

function getClientReservationInfo(client) {
  const tags = Array.isArray(client.tags) ? client.tags : [];
  const cleanTags = tags.map((tag) => String(tag || "").trim()).filter(Boolean);
  const priceSource = [...cleanTags, client.notes || ""].join(" ");
  const priceMatch = priceSource.match(/s\/?\s*(\d+(?:[.,]\d+)?)/i);
  const quantityMatch = priceSource.match(/cantidad\s*(\d+)/i)
    || priceSource.match(/reserva\s*\d+\s*de\s*(\d+)/i)
    || priceSource.match(/(\d+)\s*(?:entradas|tickets|accesos)/i);
  const ignored = new Set([
    "pagado",
    "pendiente de entrega",
    "pendiente entrega",
    "hardwell",
    "reserva",
  ]);
  const zone = cleanTags.find((tag) => {
    const value = tag.toLowerCase();
    return !ignored.has(value)
      && !/^s\/?\s*\d/i.test(value)
      && !/^cantidad\s*\d+/i.test(value)
      && !/^reserva\s*\d+\s*de\s*\d+/i.test(value);
  }) || "Reserva";
  return {
    zone,
    price: priceMatch ? Number(priceMatch[1].replace(",", ".")) : 0,
    quantity: Math.max(1, Number(quantityMatch?.[1] || 1)),
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function imageSourceToDataUrl(source, width = 1200, height = 500) {
  if (!source) return null;
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = source;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function openFileDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FILE_STORE)) {
        request.result.createObjectStore(FILE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putFile(file) {
  const db = await openFileDb();
  const id = uid("file");
  await new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, "readwrite");
    tx.objectStore(FILE_STORE).put({ id, blob: file, name: file.name, type: file.type, createdAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return id;
}

async function getFile(id) {
  if (!id) return null;
  const db = await openFileDb();
  const record = await new Promise((resolve, reject) => {
    const request = db.transaction(FILE_STORE, "readonly").objectStore(FILE_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

async function deleteFile(id) {
  if (!id) return;
  const db = await openFileDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, "readwrite");
    tx.objectStore(FILE_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function deleteTicketFile(ticket) {
  await deleteFile(ticket?.fileId);
  if (CLOUD_MODE && ticket?.objectKey) {
    await apiFetch(`/api/files/${encodeURIComponent(ticket.id)}`, { method: "DELETE" }).catch(() => {});
  }
}

function getEventTickets(eventId, includeDeleted = false) {
  return state.tickets.filter((ticket) => ticket.eventId === eventId && (includeDeleted || !ticket.deletedAt));
}

function getEventReservationItems(eventId) {
  state.clients ||= [];
  const assignedByPhone = getEventTickets(eventId).reduce((map, ticket) => {
    const phone = normalizeComparablePhone(ticket.buyerPhone);
    if (phone) map.set(phone, (map.get(phone) || 0) + 1);
    return map;
  }, new Map());

  let displayIndex = 0;
  return state.clients
    .filter((client) => client.eventId === eventId && !client.deletedAt)
    .filter((client) => ["pending", "paid", "delivery"].includes(client.stage))
    .flatMap((client) => {
      const info = getClientReservationInfo(client);
      const phone = normalizeComparablePhone(client.phone);
      const assignedCount = phone ? assignedByPhone.get(phone) || 0 : 0;
      const remaining = Math.max(0, info.quantity - assignedCount);
      return Array.from({ length: remaining }, (_, index) => {
        displayIndex += 1;
        return {
          kind: "reservation",
          id: client.id,
          reservationIndex: assignedCount + index + 1,
          reservationTotal: info.quantity,
          eventId,
          internalCode: `RESERVA-${String(displayIndex).padStart(3, "0")}`,
          format: "reservation",
          zone: info.zone,
          basePrice: info.price,
          salePrice: info.price,
          status: client.stage === "pending" ? "reserved" : "delivery",
          paymentStatus: client.stage === "pending" ? "pending" : "paid",
          buyerName: client.name || "",
          buyerPhone: client.phone || "",
    buyerDocument: client.document || client.dni || client.buyerDocument || "",
          notes: client.notes || "",
          client,
        };
      });
    });
}

function getEventStats(eventId) {
  const tickets = getEventTickets(eventId);
  const count = (status) => tickets.filter((ticket) => ticket.status === status).length;
  const revenue = tickets
    .filter((ticket) => ticket.paymentStatus === "paid")
    .reduce((sum, ticket) => sum + Number(ticket.salePrice || ticket.basePrice || 0), 0);
  return {
    total: tickets.length,
    available: count("available"),
    reserved: count("reserved"),
    sold: count("sold") + count("delivered"),
    delivered: count("delivered"),
    pendingDelivery: tickets.filter((ticket) => ticket.paymentStatus === "paid" && ticket.status !== "delivered").length,
    revenue,
  };
}

function getGlobalStats() {
  const activeEvents = state.events.filter((event) => !event.deletedAt && event.status === "active");
  const tickets = state.tickets.filter((ticket) => !ticket.deletedAt);
  return {
    events: activeEvents.length,
    available: tickets.filter((ticket) => ticket.status === "available").length,
    reserved: tickets.filter((ticket) => ticket.status === "reserved").length,
    pendingDelivery: tickets.filter((ticket) => ticket.paymentStatus === "paid" && ticket.status !== "delivered").length,
    revenue: tickets.filter((ticket) => ticket.paymentStatus === "paid").reduce((sum, ticket) => sum + Number(ticket.salePrice || ticket.basePrice || 0), 0),
  };
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $("#toastRegion").append(toast);
  setTimeout(() => toast.remove(), 3200);
}

function waitForShareFeedbackFrame() {
  return new Promise((resolve) => setTimeout(resolve, 180));
}

function ensureShareProgressOverlay() {
  let overlay = document.getElementById("shareProgressOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "shareProgressOverlay";
  overlay.className = "share-progress-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div class="share-progress-card">
      <span class="share-progress-spinner" aria-hidden="true"></span>
      <div>
        <p class="eyebrow">Compartir entrada</p>
        <h3>Preparando para compartir</h3>
        <span id="shareProgressMessage">En unos segundos se abriran las opciones de tu celular.</span>
      </div>
    </div>
  `;
  document.body.append(overlay);
  return overlay;
}

function showShareProgress(message = "En unos segundos se abriran las opciones de tu celular.") {
  const overlay = ensureShareProgressOverlay();
  const messageBox = document.getElementById("shareProgressMessage");
  if (messageBox) messageBox.textContent = message;
  requestAnimationFrame(() => overlay.classList.add("is-visible"));
}

function hideShareProgress() {
  const overlay = document.getElementById("shareProgressOverlay");
  if (!overlay) return;
  overlay.classList.remove("is-visible");
}

function setShareButtonLoading(button, loading) {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add("is-loading");
    const iconOnly = button.classList.contains("row-action") || button.classList.contains("icon-btn");
    button.innerHTML = iconOnly ? `<i data-lucide="loader-circle"></i>` : `<i data-lucide="loader-circle"></i>Preparando`;
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
  refreshIcons();
}


function dismissStartupLoader() {
  const loader = $("#startupLoader");
  if (!loader) return;
  requestAnimationFrame(() => {
    loader.classList.add("is-hidden");
    setTimeout(() => loader.remove(), 320);
  });
}

async function loadCurrentUser() {
  const response = await apiFetch("/api/auth/session");
  const result = await response.json();
  currentUser = result.user || null;
}

async function loadFeedbackEntries() {
  if (currentUser?.role !== "owner") {
    feedbackEntries = [];
    return;
  }
  const response = await apiFetch("/api/feedback");
  feedbackEntries = await response.json();
}

function renderFeedback() {
  const admin = $("#feedbackAdmin");
  const list = $("#feedbackList");
  if (!admin || !list) return;
  const isOwner = currentUser?.role === "owner";
  admin.hidden = !isOwner;
  if (!isOwner) return;
  const categoryLabels = {
    general: "General", events: "Eventos", tickets: "Entradas",
    clients: "Clientes", mobile: "Celular", other: "Otra idea",
  };
  list.innerHTML = feedbackEntries.length ? feedbackEntries.map((item) => `
    <article class="feedback-item">
      <div class="feedback-author">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.email)}</span>
        <time>${new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
      </div>
      <p class="feedback-copy">${escapeHtml(item.message)}</p>
      <div class="feedback-meta">
        <span class="feedback-rating">${"*".repeat(Number(item.rating || 0))}${"-".repeat(5 - Number(item.rating || 0))}</span>
        <span class="feedback-category">${escapeHtml(categoryLabels[item.category] || item.category)}</span>
      </div>
    </article>
  `).join("") : emptyInline("Aun no recibiste comentarios de los promotores.");
}

async function submitFeedback(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#feedbackSubmitBtn");
  const payload = {
    category: $("#feedbackCategory").value,
    rating: Number($("#feedbackRating").value),
    message: $("#feedbackMessage").value.trim(),
  };
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-circle"></i>Enviando...`;
  refreshIcons();
  try {
    await apiFetch("/api/feedback", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    $("#feedbackRating").value = "5";
    showToast("Gracias. Tu comentario fue enviado.");
    if (currentUser?.role === "owner") {
      await loadFeedbackEntries();
      renderFeedback();
    }
  } catch (error) {
    showToast(error.message || "No se pudo enviar el comentario.", "error");
  } finally {
    button.disabled = false;
    button.innerHTML = `<i data-lucide="send"></i>Enviar comentario`;
    refreshIcons();
  }
}

function showConfirm(title, copy, action, confirmLabel = "Confirmar") {
  $("#confirmTitle").textContent = title;
  $("#confirmCopy").textContent = copy;
  $("#confirmAcceptBtn").textContent = confirmLabel;
  pendingConfirm = action;
  $("#confirmModal").showModal();
}

function setView(view) {
  currentView = view;
  document.body.dataset.currentView = view;
  $$(".view").forEach((node) => node.classList.remove("active"));
  $(`#${view}View`)?.classList.add("active");
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const copy = {
    dashboard: ["Resumen", "Dashboard"],
    events: ["Organizacion", "Eventos"],
    inventory: ["Control operativo", "Inventario"],
    clients: ["Seguimiento", "Clientes"],
    messages: ["Atencion", "Mensajes"],
    generator: ["Reservas", "Generar PDF"],
    feedback: ["Tu opinion", "Enviar feedback"],
    trash: ["Recuperacion", "Papelera"],
  };
  $("#viewEyebrow").textContent = copy[view]?.[0] || "Panel";
  $("#viewTitle").textContent = copy[view]?.[1] || "I Am Promote";
  closeMobileMenu();
  renderAll();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function renderAll() {
  renderDashboard();
  renderEvents();
  renderInventory();
  renderClients();
  renderGenerator();
  renderTrash();
  renderFeedback();
  $("#trashNavCount").textContent = state.trash.length;
  refreshIcons();
}

function renderDashboard() {
  const stats = getGlobalStats();
  const metrics = [
    ["Eventos activos", stats.events, "calendar-days", "blue", "En operación"],
    ["Disponibles", stats.available, "ticket", "green", "Listas para vender"],
    ["Reservadas", stats.reserved, "clock-3", "amber", "Esperando pago"],
    ["Por entregar", stats.pendingDelivery, "send", "violet", "Pagadas y pendientes"],
    ["Ingresos", formatMoney(stats.revenue), "wallet-cards", "red", "Pagos registrados"],
  ];
  $("#metricsGrid").innerHTML = metrics.map(([label, value, icon, tone, caption]) => `
    <article class="metric-card metric-${tone}">
      <div class="metric-top"><span>${label}</span><div class="metric-icon ${tone}"><i data-lucide="${icon}"></i></div></div>
      <strong class="metric-value">${value}</strong><span class="metric-caption">${caption}</span>
    </article>`).join("");

  const active = getOrderedEvents(state.events.filter((event) => !event.deletedAt && event.status === "active")).slice(0, 4);
  $("#dashboardEvents").innerHTML = active.length ? active.map(eventCardHtml).join("") : emptyInline("Aun no hay eventos activos.");

  const attention = [];
  state.tickets.filter((ticket) => !ticket.deletedAt).forEach((ticket) => {
    const event = state.events.find((item) => item.id === ticket.eventId);
    if (ticket.paymentStatus === "paid" && ticket.status !== "delivered") {
      attention.push({ tone: "red", icon: "send", title: getTicketOwner(ticket) !== "Sin asignar" ? getTicketOwner(ticket) : ticket.internalCode, detail: `${event?.name || "Evento"} - pagada, pendiente de entrega`, ticketId: ticket.id });
    } else if (ticket.status === "reserved" && ticket.paymentStatus === "pending") {
      attention.push({ tone: "amber", icon: "clock-3", title: getTicketOwner(ticket) !== "Sin asignar" ? getTicketOwner(ticket) : ticket.internalCode, detail: `${event?.name || "Evento"} - reserva sin pago`, ticketId: ticket.id });
    }
  });
  $("#attentionList").innerHTML = attention.length ? attention.slice(0, 6).map((item) => `
    <button class="attention-item text-btn" data-open-ticket="${item.ticketId}">
      <span class="list-icon ${item.tone}"><i data-lucide="${item.icon}"></i></span>
      <span class="list-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></span>
      <i data-lucide="chevron-right"></i>
    </button>`).join("") : emptyInline("No tienes pendientes criticos.");

  const activityIcons = { ticket: "ticket-check", payment: "badge-check", event: "calendar-plus", client: "contact-round", delete: "trash-2", restore: "rotate-ccw" };
  $("#activityList").innerHTML = state.activity.length ? state.activity.slice(0, 7).map((item) => `
    <div class="activity-item">
      <span class="list-icon green"><i data-lucide="${activityIcons[item.type] || "activity"}"></i></span>
      <span class="list-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></span>
      <span class="list-time">${formatRelativeTime(item.createdAt)}</span>
    </div>`).join("") : emptyInline("Todavia no hay movimientos.");
}

function emptyInline(message) {
  return `<div class="empty-inline">${escapeHtml(message)}</div>`;
}

function eventCardHtml(event) {
  const stats = getEventStats(event.id);
  const assigned = stats.total - stats.available;
  const progress = stats.total ? Math.round((assigned / stats.total) * 100) : 0;
  const cover = event.image
    ? `<img src="${event.image}" alt="${escapeHtml(event.name)}" />`
    : `<div style="height:100%;display:grid;place-items:center;color:#737a84"><i data-lucide="calendar-days"></i></div>`;
  return `
    <article class="event-card">
      <div class="event-cover">${cover}<span class="event-status">${event.status === "archived" ? "Archivado" : "Activo"}</span></div>
      <div class="event-card-body">
        <h3>${escapeHtml(event.name)}</h3>
        <div class="event-date"><i data-lucide="map-pin"></i><span>${escapeHtml(event.venue || "Lugar pendiente")} - ${formatDate(event.date)}</span></div>
        <div class="event-progress-head"><span>Inventario asignado</span><strong>${progress}%</strong></div>
        <div class="event-progress"><span style="width:${progress}%"></span></div>
        <div class="event-stats">
          <div class="event-stat"><strong>${stats.available}</strong><span>Disponibles</span></div>
          <div class="event-stat"><strong>${stats.sold}</strong><span>Vendidas</span></div>
          <div class="event-stat"><strong>${formatMoney(stats.revenue)}</strong><span>Ingresos</span></div>
        </div>
        <div class="event-card-actions">
          <button class="primary-btn" data-open-event="${event.id}"><i data-lucide="ticket-check"></i>Ver inventario</button>
          <button class="icon-btn event-menu-btn" data-edit-event="${event.id}" title="Editar evento"><i data-lucide="pencil"></i></button>
          <button class="icon-btn event-menu-btn" data-delete-event="${event.id}" title="Eliminar evento"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
    </article>`;
}

function renderEvents() {
  const query = ($("#eventSearch")?.value || "").trim().toLowerCase();
  const events = getOrderedEvents(state.events.filter((event) => {
    if (event.deletedAt) return false;
    const statusMatches = eventStatusFilter === "all" || event.status === eventStatusFilter;
    const queryMatches = !query || `${event.name} ${event.venue} ${event.date}`.toLowerCase().includes(query);
    return statusMatches && queryMatches;
  }));
  $("#eventsGrid").innerHTML = events.length ? events.map(eventCardHtml).join("") : emptyInline("No encontramos eventos con estos filtros.");
}

function openEventInventory(eventId) {
  state.selectedEventId = eventId;
  saveState();
  selectedTickets.clear();
  setView("inventory");
}

function renderInventory() {
  const event = state.events.find((item) => item.id === state.selectedEventId && !item.deletedAt);
  $("#inventoryEmpty").hidden = Boolean(event);
  $("#inventoryWorkspace").hidden = !event;
  if (!event) return;

  const stats = getEventStats(event.id);
  const reservationItems = getEventReservationItems(event.id);
  const inventoryInfo = document.querySelector(".inventory-event-info");
  if (inventoryInfo) {
    inventoryInfo.innerHTML = `
      <div class="inventory-event-meta" id="inventoryMeta">
        <span class="inventory-event-date"><i data-lucide="calendar-days"></i>${formatDate(event.date)}</span>
        <span class="inventory-active-pill">Evento activo</span>
      </div>
      <h2 id="inventoryTitle">${escapeHtml(event.name)}</h2>
      <p class="inventory-event-place"><i data-lucide="map-pin"></i>${escapeHtml(event.venue || "Lugar pendiente")}</p>`;
  }
  $("#inventoryCover").innerHTML = event.image ? `<img src="${event.image}" alt="" />` : `<i data-lucide="calendar-days"></i>`;
 const inventoryHeader = document.querySelector(".inventory-header");
if (inventoryHeader) {
  inventoryHeader.style.removeProperty("--inventory-bg-image");
  inventoryHeader.classList.remove("has-event-bg");
}
  const inventoryTotal = stats.total + reservationItems.length;
  const inventorySold = Math.min(stats.sold + reservationItems.length, inventoryTotal);
  const inventoryAvailable = stats.available;
  const inventoryRevenue = stats.revenue + reservationItems.reduce((sum, item) => sum + Number(item.salePrice || 0), 0);
  const inventoryProgress = inventoryTotal ? Math.min(Math.round((inventorySold / inventoryTotal) * 100), 100) : 0;
  $("#inventoryMiniStats").style.setProperty("--inventory-progress", `${inventoryProgress}%`);
  $("#inventoryMiniStats").innerHTML = `
    <div class="sales-panel-head"><span>Ventas</span><strong>${inventoryProgress}%<small>vendido</small></strong></div>
    <div class="sales-progress" aria-hidden="true"><span></span></div>
    <p class="sales-progress-copy">${inventorySold} de ${inventoryTotal} entradas vendidas</p>
    <div class="sales-metrics">
      <span><strong>${inventoryTotal}</strong> Total</span>
      <span><strong>${inventorySold}</strong> Vendidas</span>
      <span><strong>${inventoryAvailable}</strong> Disponibles</span>
      <span><strong>${formatMoney(inventoryRevenue)}</strong> Ingresos</span>
    </div>`;

  const query = ($("#ticketSearch").value || "").trim().toLowerCase();
  const statusFilter = $("#ticketStatusFilter").value;
  const paymentFilter = $("#ticketPaymentFilter").value;
  const typeFilter = $("#ticketTypeFilter").value;
  const tickets = getEventTickets(event.id).filter((ticket) => {
    const queryMatches = !query || `${ticket.internalCode} ${ticket.buyerName} ${phoneSearchText(ticket.buyerPhone)} ${ticket.zone}`.toLowerCase().includes(query);
    return queryMatches
      && (statusFilter === "all" || ticket.status === statusFilter)
      && (paymentFilter === "all" || ticket.paymentStatus === paymentFilter)
      && (typeFilter === "all" || ticket.format === typeFilter);
  });
  const reservations = reservationItems.filter((item) => {
    const queryMatches = !query || `${item.internalCode} ${item.buyerName} ${phoneSearchText(item.buyerPhone)} ${item.zone}`.toLowerCase().includes(query);
    return queryMatches
      && (statusFilter === "all" || statusFilter === "delivery" || (statusFilter === "reserved" && item.status === "reserved"))
      && (paymentFilter === "all" || item.paymentStatus === paymentFilter)
      && (typeFilter === "all" || typeFilter === "reservation");
  });
  const inventoryItems = [...reservations, ...tickets.map((ticket) => ({ kind: "ticket", ...ticket }))];
  const inventoryListTitle = $("#inventoryListTitle");
  if (inventoryListTitle) inventoryListTitle.textContent = `Entradas (${inventoryItems.length})`;

  const emptyInventory = inventoryEmptyHtml(event);
  $("#ticketTableBody").innerHTML = inventoryItems.length ? inventoryItems.map((item) => item.kind === "reservation" ? reservationRowHtml(item) : ticketRowHtml(item)).join("") : `<tr><td colspan="9">${emptyInventory}</td></tr>`;
  $("#ticketMobileList").innerHTML = inventoryItems.length ? inventoryItems.map((item) => item.kind === "reservation" ? reservationMobileHtml(item) : ticketMobileHtml(item)).join("") : emptyInventory;
  updateBulkBar();
}

function inventoryEmptyHtml(event) {
  const cover = event?.image
    ? `<img src="${event.image}" alt="${escapeHtml(event.name)}" />`
    : `<i data-lucide="ticket-plus"></i>`;
  return `
    <div class="inventory-empty-card">
      <div class="inventory-empty-cover">${cover}</div>
      <div class="inventory-empty-copy">
        <p class="eyebrow">Reservas e inventario</p>
        <h3>Empieza con este evento</h3>
        <p>Registra clientes que ya reservaron o sube las entradas cuando las tengas listas.</p>
      </div>
      <div class="inventory-empty-actions">
        <button class="secondary-btn small" data-add-client-current><i data-lucide="user-plus"></i>Agregar reserva</button>
        <button class="primary-btn small" data-open-upload-current><i data-lucide="plus"></i>Agregar entradas</button>
      </div>
    </div>`;
}

function reservationRowHtml(item) {
  const owner = item.buyerPhone ? formatPhoneForDisplay(item.buyerPhone) : item.buyerName || "Sin asignar";
  return `
    <tr class="ticket-reservation-row">
      <td><span class="reservation-dot" title="Reserva por entregar"></span></td>
      <td><button class="ticket-name reservation-ticket-name" data-open-client="${item.id}" data-open-client-phone="${escapeHtml(item.buyerPhone || item.client?.phone || "")}">
        <span class="ticket-type-icon"><i data-lucide="${FORMAT_ICONS.reservation}"></i></span>
        <div><strong>${escapeHtml(item.internalCode)}</strong><span>${item.reservationTotal > 1 ? `Acceso ${item.reservationIndex} de ${item.reservationTotal} sin PDF` : "Reserva sin PDF asignado"}</span></div>
      </button></td>
      <td>${FORMAT_LABELS.reservation}</td>
      <td>${escapeHtml(item.zone)}</td>
      <td>${formatMoney(item.salePrice || item.basePrice)}</td>
      <td><span class="status-pill status-delivery">Por entregar</span></td>
      <td><div class="buyer-cell"><strong>${escapeHtml(owner)}</strong><span>${escapeHtml(item.buyerName && item.buyerPhone ? item.buyerName : "-")}</span></div></td>
      <td><div class="payment-cell">${item.paymentMethod ? `<span class="payment-method-chip">${paymentMethodLogoHtml(item.paymentMethod)}${escapeHtml(item.paymentMethod)}</span>` : ""}<strong class="payment-${item.paymentStatus}">${PAYMENT_STATUS[item.paymentStatus]}</strong></div></td>
      <td><div class="row-actions">
        <button class="row-action row-action-labeled" data-open-client="${item.id}" data-open-client-phone="${escapeHtml(item.buyerPhone || item.client?.phone || "")}" title="Gestionar reserva"><i data-lucide="pencil"></i><span>Gestionar</span></button>
        <button class="row-action" data-generate-official-pdf="${item.id}::${item.reservationIndex}" title="Generar PDF de entrada"><i data-lucide="file-text"></i></button>
        <button class="row-action row-action-labeled" data-upload-for-reservation="${item.id}" title="Subir PDF para esta reserva"><i data-lucide="upload"></i><span>Subir PDF</span></button>
      </div></td>
    </tr>`;
}

function reservationMobileHtml(item) {
  const owner = item.buyerPhone ? formatPhoneForDisplay(item.buyerPhone) : item.buyerName || "Sin asignar";
  return `
    <article class="ticket-mobile-card ticket-reservation-card status-delivery">
      <div class="ticket-mobile-head">
        <span class="reservation-dot" title="Reserva por entregar"></span>
        <span class="ticket-type-icon"><i data-lucide="${FORMAT_ICONS.reservation}"></i></span>
        <div class="ticket-mobile-main"><strong>${escapeHtml(item.internalCode)}</strong><span>${FORMAT_LABELS.reservation} - ${escapeHtml(item.zone)}${item.reservationTotal > 1 ? ` - ${item.reservationIndex}/${item.reservationTotal}` : ""}</span></div>
        <div class="ticket-mobile-status"><span class="status-pill status-delivery">Por entregar</span></div>
      </div>
      <div class="ticket-mobile-grid">
        <div class="ticket-mobile-field"><span>Dueno</span><strong>${escapeHtml(owner)}</strong></div>
        <div class="ticket-mobile-field"><span>Monto</span><strong>${formatMoney(item.salePrice || item.basePrice)}</strong></div>
        <div class="ticket-mobile-field"><span>Pago</span><strong class="payment-${item.paymentStatus}">${PAYMENT_STATUS[item.paymentStatus]}</strong></div>
        <div class="ticket-mobile-field"><span>Tipo</span><strong>${escapeHtml(item.zone)}</strong></div>
      </div>
      <div class="ticket-mobile-actions">
        <button class="secondary-btn small" data-open-client="${item.id}" data-open-client-phone="${escapeHtml(item.buyerPhone || item.client?.phone || "")}"><i data-lucide="pencil"></i>Gestionar</button>
        <button class="secondary-btn small" data-generate-official-pdf="${item.id}::${item.reservationIndex}"><i data-lucide="file-text"></i>Generar PDF</button>
        <button class="secondary-btn small" data-upload-for-reservation="${item.id}"><i data-lucide="upload"></i>Subir PDF</button>
      </div>
    </article>`;
}

function ticketRowHtml(ticket) {
  const primaryLabel = ticket.zone || ticket.internalCode;
  const fileLabel = ticket.fileName ? escapeHtml(ticket.fileName) : FORMAT_LABELS[ticket.format];
  const idLabel = `ID: ${escapeHtml(shortId(ticket.id))}`;
  return `
    <tr class="${ticket.sharedAt ? "ticket-shared" : ""}">
      <td><input type="checkbox" data-select-ticket="${ticket.id}" ${selectedTickets.has(ticket.id) ? "checked" : ""} aria-label="Seleccionar ${escapeHtml(ticket.internalCode)}" /></td>
      <td><div class="ticket-name"><span class="ticket-type-icon"><i data-lucide="${FORMAT_ICONS[ticket.format]}"></i></span><div><strong title="${escapeHtml(primaryLabel)}">${escapeHtml(primaryLabel)}</strong><span class="ticket-file-name" title="${ticket.fileName ? escapeHtml(ticket.fileName) : ""}">${fileLabel}</span><small class="ticket-record-id">${idLabel}</small></div></div></td>
      <td>${FORMAT_LABELS[ticket.format]}</td>
      <td>${escapeHtml(ticket.zone)}</td>
      <td>${formatMoney(ticket.salePrice || ticket.basePrice)}</td>
      <td><span class="status-pill status-${ticket.status}">${STATUS[ticket.status]}</span><span class="status-subtext">${STATUS_SUBTEXT[ticket.status] || ""}</span>${ticket.sharedAt ? `<span class="shared-marker"><i data-lucide="send"></i>Compartida</span>` : ""}</td>
      <td><div class="buyer-cell"><strong>${escapeHtml(getTicketOwner(ticket))}</strong><span>${escapeHtml(ticket.buyerName && ticket.buyerPhone ? formatPhoneForDisplay(ticket.buyerPhone) : "-")}</span></div></td>
      <td><div class="payment-cell">${ticket.paymentMethod ? `<span class="payment-method-chip">${paymentMethodLogoHtml(ticket.paymentMethod)}${escapeHtml(ticket.paymentMethod)}</span>` : ""}<strong class="payment-${ticket.paymentStatus}">${PAYMENT_STATUS[ticket.paymentStatus]}</strong></div></td>
      <td><div class="row-actions">
        <button class="row-action row-action-labeled" data-open-ticket="${ticket.id}" title="Gestionar entrada"><i data-lucide="pencil"></i><span>Gestionar</span></button>
        <button class="row-action" data-generate-official-pdf="${ticket.id}" title="Generar PDF de entrada"><i data-lucide="file-text"></i></button>
        <button class="row-action" data-share-ticket="${ticket.id}" title="Compartir"><i data-lucide="share-2"></i></button>
        <button class="row-action" data-delete-ticket="${ticket.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
      </div></td>
    </tr>`;
}

function ticketMobileHtml(ticket) {
  const owner = getTicketOwner(ticket);
  const primaryLabel = ticket.zone || ticket.internalCode;
  const fileLabel = ticket.fileName ? escapeHtml(ticket.fileName) : FORMAT_LABELS[ticket.format];
  const idLabel = `ID: ${escapeHtml(shortId(ticket.id))}`;
  return `
    <article class="ticket-mobile-card status-${ticket.status} ${ticket.sharedAt ? "ticket-shared" : ""}">
      <div class="ticket-mobile-head">
        <input type="checkbox" data-select-ticket="${ticket.id}" ${selectedTickets.has(ticket.id) ? "checked" : ""} aria-label="Seleccionar" />
        <span class="ticket-type-icon"><i data-lucide="${FORMAT_ICONS[ticket.format]}"></i></span>
        <div class="ticket-mobile-main"><strong title="${escapeHtml(primaryLabel)}">${escapeHtml(primaryLabel)}</strong><span class="ticket-file-name" title="${ticket.fileName ? escapeHtml(ticket.fileName) : ""}">${fileLabel}</span><small class="ticket-code-value ticket-record-id">${idLabel}</small></div>
        <div class="ticket-mobile-status"><span class="status-pill status-${ticket.status}">${STATUS[ticket.status]}</span>${ticket.sharedAt ? `<span class="shared-marker"><i data-lucide="send"></i>Compartida</span>` : ""}</div>
      </div>
      <div class="ticket-mobile-grid">
        <div class="ticket-mobile-field"><span>Cliente</span><strong>${escapeHtml(owner)}</strong>${ticket.buyerPhone ? `<small class="ticket-phone-line"><img src="img/apps/whatsapp.png" alt="" />${escapeHtml(formatPhoneForDisplay(ticket.buyerPhone))}</small>` : ""}</div>
        <div class="ticket-mobile-field"><span>Pago</span><strong class="payment-${ticket.paymentStatus}">${PAYMENT_STATUS[ticket.paymentStatus]}</strong>${ticket.paymentMethod ? `<small class="ticket-payment-method">${paymentMethodLogoHtml(ticket.paymentMethod)}${escapeHtml(ticket.paymentMethod)}</small>` : ""}</div>
        <div class="ticket-mobile-field"><span>Precio</span><strong>${formatMoney(ticket.salePrice || ticket.basePrice)}</strong></div>
      </div>
      <div class="ticket-mobile-actions">
        <button class="secondary-btn small" data-open-ticket="${ticket.id}"><i data-lucide="pencil"></i>Gestionar</button>
        <button class="secondary-btn small" data-generate-official-pdf="${ticket.id}"><i data-lucide="file-text"></i>Generar PDF</button>
        <button class="secondary-btn small" data-share-ticket="${ticket.id}"><i data-lucide="send"></i>Compartir</button>
      </div>
    </article>`;
}

function updateBulkBar() {
  $("#bulkBar").hidden = selectedTickets.size === 0;
  $("#selectedCount").textContent = selectedTickets.size;
  $("#bulkShareBtn").hidden = selectedTickets.size < 2;
  const visibleIds = $$("[data-select-ticket]").map((input) => input.dataset.selectTicket);
  $("#selectAllTickets").checked = visibleIds.length > 0 && visibleIds.every((id) => selectedTickets.has(id));
}

const CLIENT_STAGE_LABELS = {
  new: "Nuevo contacto",
  info: "Pidio información",
  pending: "Pendiente de pago",
  paid: "Pago confirmado",
  delivery: "Pendiente de entrega",
  delivered: "Entrada entregada",
  inactive: "Inactivo",
};

function normalizeClientPhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "").trim();
}

function formatPersonNameForPdf(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.split(" ").map((word) => word.split(/([-'])/).map((part) => {
    if (!part || part === "-" || part === "'") return part;
    return part.charAt(0).toLocaleUpperCase("es-PE") + part.slice(1).toLocaleLowerCase("es-PE");
  }).join("")).join(" ");
}
function getClientName(client) {
  return client.name?.trim() || formatPhoneForDisplay(client.phone) || "Cliente sin nombre";
}

function getClientEventName(client) {
  return state.events.find((event) => event.id === client.eventId)?.name || "Sin evento";
}

function renderClients() {
  state.clients ||= [];
  const activeClients = state.clients.filter((client) => !client.deletedAt);
  const pendingCount = activeClients.filter((client) => client.stage === "pending").length;
  const paidCount = activeClients.filter((client) => client.stage === "paid" || client.stage === "delivery" || client.stage === "delivered").length;
  const hardFollowCount = activeClients.filter((client) => client.stage === "info" || client.stage === "pending").length;
  $("#clientMetrics").innerHTML = [
    ["Clientes", activeClients.length],
    ["Reservas", pendingCount],
    ["Pagados", paidCount],
    ["Por entregar", activeClients.filter((client) => client.stage === "delivery").length],
  ].map(([label, value]) => `<article class="client-metric"><span>${label}</span><strong>${value}</strong></article>`).join("");

  const eventSelects = ["clientEventFilter", "clientEventId"];
  eventSelects.forEach((id) => {
    const select = $(`#${id}`);
    if (!select) return;
    const current = select.value;
    const firstLabel = id === "clientEventFilter" ? "Todos los eventos" : "Sin evento asignado";
    const firstValue = id === "clientEventFilter" ? "all" : "";
    select.innerHTML = `<option value="${firstValue}">${firstLabel}</option>` + getOrderedEvents(state.events
      .filter((event) => !event.deletedAt))
      .map((event) => `<option value="${event.id}">${escapeHtml(event.name)}</option>`)
      .join("");
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  });

  const query = ($("#clientSearch")?.value || "").trim().toLowerCase();
  const stage = $("#clientStageFilter")?.value || "all";
  const eventId = $("#clientEventFilter")?.value || "all";
  const clients = activeClients.filter((client) => {
    const text = `${client.name || ""} ${client.document || client.dni || client.buyerDocument || ""} ${phoneSearchText(client.phone)} ${getClientEventName(client)} ${(client.tags || []).join(" ")} ${client.notes || ""}`.toLowerCase();
    return (!query || text.includes(query))
      && (stage === "all" || client.stage === stage)
      && (eventId === "all" || client.eventId === eventId);
  });

  $("#clientList").innerHTML = clients.length ? clients.map((client) => {
    const tags = (client.tags || []).slice(0, 3).map((tag) => `<span class="client-tag">${escapeHtml(tag)}</span>`).join("");
    return `
      <button class="client-row" data-open-client="${client.id}">
        <span class="client-identity">
          <span class="client-avatar">${escapeHtml(getInitials(getClientName(client)))}</span>
          <span><strong>${escapeHtml(getClientName(client))}</strong><span>${escapeHtml(formatPhoneForDisplay(client.phone))}</span></span>
        </span>
        <span class="client-cell"><strong>${escapeHtml(getClientEventName(client))}</strong><span>${formatRelativeTime(client.updatedAt || client.createdAt)}</span></span>
        <span class="client-stage client-stage-${client.stage}">${CLIENT_STAGE_LABELS[client.stage] || client.stage}</span>
        <span class="client-tags">${tags || `<span class="client-tag">Sin etiquetas</span>`}</span>
        <i class="client-open" data-lucide="chevron-right"></i>
      </button>`;
  }).join("") : emptyInline("Aun no tienes clientes registrados para estos filtros.");
}

function getInitials(text) {
  return String(text || "IP").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "IP";
}

function openClientModal(clientId = "", clientPhone = "") {
  state.clients ||= [];
  const normalizedClientId = String(clientId || "");
  const normalizedPhone = normalizeComparablePhone(clientPhone);
  const client = normalizedClientId || normalizedPhone
    ? state.clients.find((item) => {
      if (item.deletedAt) return false;
      return String(item.id) === normalizedClientId || (normalizedPhone && normalizeComparablePhone(item.phone) === normalizedPhone);
    })
    : null;
  if ((normalizedClientId || normalizedPhone) && !client) {
    showToast("No encontramos esa reserva.", "error");
    return;
  }
  $("#clientModalTitle").textContent = client ? "Gestionar reserva" : "Nueva reserva";
  $("#clientId").value = client?.id || "";
  $("#clientPhone").value = client?.phone ? formatPhoneForDisplay(client.phone) : "";
  $("#clientName").value = client?.name || "";
  $("#clientDocument").value = client?.document || client?.dni || client?.buyerDocument || "";
  $("#clientEventId").value = client?.eventId || state.selectedEventId || "";
  $("#clientStage").value = client?.stage || "pending";
  $("#clientTags").value = (client?.tags || []).join(", ");
  $("#clientNotes").value = client?.notes || "";
  $("#clientInteraction").value = "";
  $("#deleteClientBtn").hidden = !client;
  $("#clientWhatsAppBtn").hidden = !client?.phone;
  renderClientHistory(client);
  $("#clientModal").showModal();
  refreshIcons();
}

function renderClientHistory(client) {
  const list = $("#clientHistoryList");
  const interactions = client?.interactions || [];
  list.className = "client-history-list";
  list.innerHTML = interactions.length ? interactions.slice().reverse().map((item) => `
    <div class="client-history-item">
      <span class="client-history-dot"></span>
      <p>${escapeHtml(item.text)}</p>
      <time>${formatDate(item.createdAt)}</time>
    </div>`).join("") : emptyInline("Sin historial todavia.");
}

function saveClient(event) {
  event.preventDefault();
  state.clients ||= [];
  const id = $("#clientId").value || uid("client");
  const existing = state.clients.find((client) => client.id === id);
  const phone = normalizeClientPhone($("#clientPhone").value);
  if (!phone) return showToast("Agrega el WhatsApp del cliente.", "error");
  const interaction = $("#clientInteraction").value.trim();
  const now = Date.now();
  const client = {
    ...(existing || {}),
    id,
    phone,
    name: $("#clientName").value.trim(),
    document: $("#clientDocument").value.trim(),
    eventId: $("#clientEventId").value || null,
    stage: $("#clientStage").value,
    tags: $("#clientTags").value.split(",").map((tag) => tag.trim()).filter(Boolean),
    notes: $("#clientNotes").value.trim(),
    interactions: [...(existing?.interactions || [])],
    lastContactAt: now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (interaction) client.interactions.push({ id: uid("interaction"), text: interaction, createdAt: now });
  if (existing) Object.assign(existing, client);
  else state.clients.unshift(client);
  addActivity("client", existing ? "Cliente actualizado" : "Reserva registrada", `${getClientName(client)} · ${getClientEventName(client)}`);
  saveState();
  $("#clientModal").close();
  renderAll();
  showToast(existing ? "Cliente actualizado." : "Cliente agregado a reservas.");
}

function deleteClient(clientId) {
  const client = state.clients?.find((item) => item.id === clientId);
  if (!client) return;
  showConfirm("Eliminar cliente", `${getClientName(client)} dejara de aparecer en seguimiento.`, () => {
    state.clients = state.clients.filter((item) => item.id !== clientId);
    addActivity("delete", "Cliente eliminado", getClientName(client));
    saveState();
    $("#clientModal").close();
    renderAll();
    showToast("Cliente eliminado.");
  }, "Eliminar");
}

function openClientWhatsApp(clientId) {
  const client = state.clients?.find((item) => item.id === clientId);
  const phone = normalizeClientPhone(client?.phone).replace(/\D/g, "");
  if (!phone) return showToast("Este cliente no tiene WhatsApp.", "error");
  window.open(`https://wa.me/${phone}`, "_blank", "noopener");
}

function importTicketClients() {
  state.clients ||= [];
  const existingKeys = new Set(state.clients.map((client) => `${client.phone}|${client.eventId || ""}`));
  let count = 0;
  state.tickets.filter((ticket) => !ticket.deletedAt && (ticket.buyerPhone || ticket.buyerName)).forEach((ticket) => {
    const phone = normalizeClientPhone(ticket.buyerPhone || ticket.buyerName);
    const key = `${phone}|${ticket.eventId || ""}`;
    if (!phone || existingKeys.has(key)) return;
    existingKeys.add(key);
    state.clients.push({
      id: uid("client"),
      phone,
      name: ticket.buyerName || "",
      document: ticket.buyerDocument || "",
      eventId: ticket.eventId || null,
      stage: ticket.status === "delivered" ? "delivered" : ticket.paymentStatus === "paid" ? "delivery" : ticket.status === "reserved" ? "pending" : "info",
      tags: ["importado"],
      notes: `Importado desde entrada ${ticket.internalCode}.`,
      interactions: [],
      lastContactAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    count += 1;
  });
  saveState();
  renderAll();
  showToast(count ? `${count} clientes importados desde entradas.` : "No encontramos compradores nuevos para importar.");
}
function renderGenerator() {
  const select = $("#pdfEventId");
  if (!select) return;
  const events = getOrderedEvents(state.events.filter((event) => !event.deletedAt));
  const selectedId = select.value;
  select.innerHTML = events.length
    ? events.map((event) => `<option value="${event.id}">${escapeHtml(event.name)} - ${formatDate(event.date)}</option>`).join("")
    : `<option value="">No hay eventos disponibles</option>`;
  if (events.some((event) => event.id === selectedId)) select.value = selectedId;
  select.disabled = !events.length;
  $("#generateStandalonePdfBtn").disabled = !events.length;
  updateGeneratorPreview();
}

function updateGeneratorPreview() {
  const event = state.events.find((item) => item.id === $("#pdfEventId")?.value && !item.deletedAt);
  if (!event) {
    $("#generatorPreviewCover").innerHTML = `<i data-lucide="calendar-days"></i>`;
    $("#generatorPreviewName").textContent = "Selecciona un evento";
    $("#generatorPreviewDate").textContent = "Fecha pendiente";
    $("#generatorPreviewVenue").textContent = "Lugar pendiente";
    refreshIcons();
    return;
  }
  $("#generatorPreviewCover").innerHTML = event.image
    ? `<img src="${event.image}" alt="${escapeHtml(event.name)}" />`
    : `<i data-lucide="calendar-days"></i>`;
  $("#generatorPreviewName").textContent = event.name;
  $("#generatorPreviewDate").textContent = formatDate(event.date);
  $("#generatorPreviewVenue").textContent = event.venue || "Lugar pendiente";
  refreshIcons();
}

async function generateStandaloneOfficialPdf(triggerButton = null) {
  if (!window.jspdf?.jsPDF) return showToast("No se pudo cargar el generador de PDF.", "error");
  if (!window.QRCode?.toDataURL) return showToast("No se pudo cargar el generador de QR.", "error");
  const eventId = $("#pdfEventId").value;
  const event = state.events.find((item) => item.id === eventId && !item.deletedAt);
  if (!event) return showToast("Selecciona un evento disponible.", "error");

  const quantity = Math.max(1, Math.min(20, Number($("#pdfQuantity").value) || 1));
  const total = Math.max(0, Number($("#pdfTotal").value) || 0);
  const zone = $("#pdfZone").value.trim();
  const buyerName = $("#pdfBuyerName").value.trim();
  const buyerPhone = $("#pdfBuyerPhone").value.trim();
  const paymentStatus = $("#pdfPaymentStatus").value;
  const operationRoot = `RSV-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

  setShareButtonLoading(triggerButton, true);
  try {
    const files = [];
    for (let index = 1; index <= quantity; index += 1) {
      const ticketLike = {
        id: `${operationRoot}-${index}`,
        internalCode: quantity > 1 ? `${operationRoot}-${String(index).padStart(2, "0")}` : operationRoot,
        zone,
        basePrice: total / quantity,
        salePrice: total / quantity,
        paymentStatus,
        buyerName,
        buyerPhone,
      };
      const { blob, fileName } = await buildOfficialTicketPdfBlob(ticketLike, event);
      files.push(new File([blob], fileName, { type: "application/pdf" }));
    }

    const message = withFestholicFooter(`Te envio tu entrada para ${event.name}. Zona: ${zone || "General"}. Operación: ${operationRoot}.`);
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files }))) {
      await navigator.clipboard.writeText(message).catch(() => {});
      try {
        await navigator.share({ title: `Entrada - ${event.name}`, text: message, files });
        showToast("Entrada generada y compartida.");
        return;
      } catch (error) {
        if (error.name === "AbortError") {
          showToast("Compartir cancelado.", "error");
          return;
        }
      }
    }
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
    await navigator.clipboard.writeText(message).catch(() => {});
    showToast("Entrada generada y descargada.");
  } catch (error) {
    console.error("No se pudo generar la entrada oficial:", error);
    showToast("No se pudo generar la entrada.", "error");
  } finally {
    setShareButtonLoading(triggerButton, false);
  }
}

async function generateStandaloneProvisionalPdf() {
  const eventId = $("#pdfEventId").value;
  const quantity = Math.max(1, Math.min(20, Number($("#pdfQuantity").value) || 1));
  const total = Math.max(0, Number($("#pdfTotal").value) || 0);
  const operationRoot = `RSV-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const tickets = Array.from({ length: quantity }, () => ({
    id: uid("provisional"),
    eventId,
    internalCode: operationRoot,
    zone: $("#pdfZone").value.trim(),
    buyerName: $("#pdfBuyerName").value.trim(),
    buyerPhone: $("#pdfBuyerPhone").value.trim(),
    paymentStatus: $("#pdfPaymentStatus").value,
    salePrice: total / quantity,
    basePrice: total / quantity,
  }));
  await generateProvisionalVoucher(tickets);
}

function renderTrash() {
  const entries = state.trash.slice().sort((a, b) => b.deletedAt - a.deletedAt);
  $("#trashList").innerHTML = entries.length ? entries.map((entry) => `
    <article class="trash-item">
      <span class="trash-item-icon"><i data-lucide="${entry.type === "event" ? "calendar-x" : "ticket-x"}"></i></span>
      <div><strong>${escapeHtml(entry.label)}</strong><span>${entry.type === "event" ? "Evento" : "Entrada"} - eliminado ${formatRelativeTime(entry.deletedAt)}</span></div>
      <div class="trash-actions">
        <button class="secondary-btn small" data-restore-trash="${entry.id}"><i data-lucide="rotate-ccw"></i>Restaurar</button>
        <button class="danger-btn small" data-purge-trash="${entry.id}"><i data-lucide="trash-2"></i>Borrar</button>
      </div>
    </article>`).join("") : emptyInline("La papelera esta vacia.");
}

function openEventModal(eventId = null) {
  $("#eventForm").reset();
  $("#eventId").value = "";
  eventImageData = "";
  $("#eventImagePreview").innerHTML = `<i data-lucide="image"></i><span>Vista previa</span>`;
  if (eventId) {
    const event = state.events.find((item) => item.id === eventId);
    if (!event) return;
    $("#eventModalTitle").textContent = "Editar evento";
    $("#eventId").value = event.id;
    $("#eventName").value = event.name;
    $("#eventDate").value = event.date;
    $("#eventVenue").value = event.venue || "";
    $("#eventStatus").value = event.status;
    eventImageData = event.image || "";
    if (eventImageData) $("#eventImagePreview").innerHTML = `<img src="${eventImageData}" alt="Vista previa" />`;
  } else {
    $("#eventModalTitle").textContent = "Nuevo evento";
  }
  $("#eventModal").showModal();
  refreshIcons();
}

async function saveEvent(event) {
  event.preventDefault();
  const id = $("#eventId").value;
  const existing = state.events.find((item) => item.id === id);
  const record = {
    id: id || uid("event"),
    name: $("#eventName").value.trim(),
    date: $("#eventDate").value,
    venue: $("#eventVenue").value.trim(),
    status: $("#eventStatus").value,
    image: eventImageData || existing?.image || "",
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
  };
  if (!record.name || !record.date) return;
  if (existing) Object.assign(existing, record);
  else state.events.unshift(record);
  addActivity("event", existing ? "Evento actualizado" : "Evento creado", record.name);
  saveState();
  $("#eventModal").close();
  renderAll();
  showToast(existing ? "Evento actualizado." : "Evento creado.");
}

function deleteEvent(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;
  const ticketCount = getEventTickets(eventId).length;
  showConfirm(
    "Mover evento a la papelera",
    `${event.name} y sus ${ticketCount} entradas dejaran de mostrarse. Podras recuperarlos desde la papelera.`,
    () => {
      const deletedAt = Date.now();
      event.deletedAt = deletedAt;
      getEventTickets(eventId).forEach((ticket) => { ticket.deletedAt = deletedAt; });
      state.trash.push({ id: event.id, type: "event", label: event.name, deletedAt });
      if (state.selectedEventId === event.id) state.selectedEventId = null;
      addActivity("delete", "Evento eliminado", event.name);
      saveState();
      renderAll();
      showToast("Evento movido a la papelera.");
    },
    "Mover a papelera"
  );
}

function openTicketUpload() {
  pendingReservationUploadClientId = "";
  if (!state.selectedEventId) return showToast("Selecciona un evento antes de agregar entradas.", "error");
  ticketUploadInProgress = false;
  const progress = $("#ticketUploadProgress");
  if (progress) progress.hidden = true;
  queuedFiles = [];
  uploadFormat = "file";
  $("#ticketUploadForm").reset();
  $("#listQuantity").value = 1;
  $("#fileQueue").innerHTML = "";
  updateUploadMode();
  const modal = $("#ticketUploadModal");
  if (!modal.open) modal.showModal();
  refreshIcons();
}

function openReservationTicketUpload(clientId) {
  const client = state.clients?.find((item) => item.id === clientId && !item.deletedAt);
  if (!client) return showToast("No encontramos esa reserva.", "error");
  if (client.eventId) state.selectedEventId = client.eventId;
  openTicketUpload();
  pendingReservationUploadClientId = client.id;
  const info = getClientReservationInfo(client);
  $("#ticketZone").value = info.zone;
  $("#ticketPrice").value = info.price || "";
  $("#ticketPrefix").value = info.zone.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "RESERVA";
  $("#ticketInitialStatus").value = "reserved";
  showToast("Selecciona el PDF o QR para asignarlo a esta reserva.");
}

function updateUploadMode() {
  $$("#formatTabs button").forEach((button) => button.classList.toggle("active", button.dataset.format === uploadFormat));
  $$(".upload-mode").forEach((section) => section.classList.toggle("active", section.dataset.uploadMode === uploadFormat));
}

function setTicketUploadProgress(active, title = "Preparando entradas", detail = "No cierres esta ventana.", percent = 8) {
  ticketUploadInProgress = active;
  const overlay = $("#ticketUploadProgress");
  const submit = $("#confirmTicketUploadBtn");
  if (overlay) overlay.hidden = !active;
  const progressTitle = $("#ticketUploadProgressTitle");
  const progressText = $("#ticketUploadProgressText");
  if (progressTitle) progressTitle.textContent = title;
  if (progressText) progressText.textContent = detail;
  const progressBar = $("#ticketUploadProgressBar");
  if (progressBar) progressBar.style.width = `${Math.max(8, Math.min(100, percent))}%`;
  if (submit) {
    submit.disabled = active;
    submit.innerHTML = active
      ? `<i data-lucide="loader-circle"></i>Subiendo...`
      : `<i data-lucide="package-plus"></i>Agregar al inventario`;
    submit.classList.toggle("is-loading", active);
  }
}

function renderFileQueue() {
  $("#fileQueue").innerHTML = queuedFiles.length ? `
    <div class="file-queue-summary"><strong>${queuedFiles.length === 1 ? "Archivo seleccionado" : `${queuedFiles.length} archivos seleccionados`}</strong><span>Estos nombres aparecerán también en el inventario.</span></div>
    ${queuedFiles.map((file) => `
      <div class="file-queue-item"><i data-lucide="${file.type === "application/pdf" ? "file-text" : "image"}"></i><strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong><span>${Math.ceil(file.size / 1024)} KB</span></div>`).join("")}` : "";
  refreshIcons();
}

async function addTickets(event) {
  event.preventDefault();
  if (ticketUploadInProgress) return;

  const zone = $("#ticketZone").value.trim();
  const codeCount = $("#ticketCodes").value.split(/\r?\n/).map((code) => code.trim()).filter(Boolean).length;
  if (!zone) return showToast("Ingresa una zona.", "error");
  if (uploadFormat === "file" && !queuedFiles.length) return showToast("Selecciona al menos un archivo.", "error");
  if (pendingReservationUploadClientId && (uploadFormat !== "file" || queuedFiles.length !== 1)) {
    return showToast("Para una reserva, sube solo un PDF o imagen por cliente.", "error");
  }
  if (uploadFormat === "code" && !codeCount) return showToast("Pega al menos un código.", "error");

  const total = uploadFormat === "file"
    ? queuedFiles.length
    : uploadFormat === "code"
      ? codeCount
      : Math.max(1, Number($("#listQuantity").value || 1));
  try {
    setTicketUploadProgress(true, "Preparando entradas", `Procesando ${total} ${total === 1 ? "entrada" : "entradas"}...`, 10);
    await performTicketUpload(event, total);
  } catch (error) {
    console.error("No se pudieron agregar las entradas:", error);
    showToast(`No se pudo completar la carga: ${error.message}`, "error");
  } finally {
    setTicketUploadProgress(false);
  }
}

async function performTicketUpload(event, total) {
  event.preventDefault();
  const eventId = state.selectedEventId;
  const zone = $("#ticketZone").value.trim();
  const basePrice = Number($("#ticketPrice").value || 0);
  const prefix = ($("#ticketPrefix").value.trim() || "TICKET").toUpperCase().replace(/\s+/g, "-");
  const status = $("#ticketInitialStatus").value;
  if (!zone) return showToast("Ingresa una zona.", "error");

  const existingCount = getEventTickets(eventId, true).length;
  const additions = [];
  if (uploadFormat === "file") {
    if (!queuedFiles.length) return showToast("Selecciona al menos un archivo.", "error");
    for (let index = 0; index < queuedFiles.length; index += 1) {
      const file = queuedFiles[index];
      setTicketUploadProgress(true, "Preparando archivos", `${index + 1} de ${queuedFiles.length}: ${file.name}`, 10 + ((index + 1) / queuedFiles.length) * 25);
      const fileId = CLOUD_MODE ? "" : await putFile(file);
      additions.push(createTicketRecord({
        eventId, zone, basePrice, prefix, status,
        sequence: existingCount + index + 1,
        format: file.type === "application/pdf" ? "pdf" : "image",
        fileId, fileName: file.name, fileType: file.type,
      }));
    }
  } else if (uploadFormat === "code") {
    const codes = $("#ticketCodes").value.split(/\r?\n/).map((code) => code.trim()).filter(Boolean);
    if (!codes.length) return showToast("Pega al menos un código.", "error");
    codes.forEach((code, index) => additions.push(createTicketRecord({
      eventId, zone, basePrice, prefix, status, sequence: existingCount + index + 1, format: "code", codeValue: code,
    })));
  } else {
    const quantity = Math.max(1, Number($("#listQuantity").value || 1));
    for (let index = 0; index < quantity; index += 1) {
      additions.push(createTicketRecord({ eventId, zone, basePrice, prefix, status, sequence: existingCount + index + 1, format: "list" }));
    }
  }

  const reservationClient = pendingReservationUploadClientId
    ? state.clients?.find((client) => client.id === pendingReservationUploadClientId && !client.deletedAt)
    : null;
  if (reservationClient && additions.length === 1) {
    const ticket = additions[0];
    const info = getClientReservationInfo(reservationClient);
    ticket.buyerName = reservationClient.name || "";
    ticket.buyerPhone = reservationClient.phone || "";
    ticket.zone = info.zone || ticket.zone;
    ticket.salePrice = info.price || ticket.basePrice;
    ticket.status = "sold";
    ticket.paymentStatus = reservationClient.stage === "pending" ? "pending" : "paid";
    ticket.notes = [ticket.notes, "Asignado desde reserva pendiente.", reservationClient.notes].filter(Boolean).join("\n");
    reservationClient.stage = ticket.paymentStatus === "paid" ? "delivery" : "pending";
    reservationClient.updatedAt = Date.now();
    reservationClient.interactions ||= [];
    reservationClient.interactions.unshift({ id: uid("interaction"), text: `PDF asignado al inventario: ${ticket.internalCode}`, createdAt: Date.now() });
  }

  state.tickets.push(...additions);
  const eventRecord = state.events.find((item) => item.id === eventId);
  addActivity("ticket", "Entradas agregadas", `${additions.length} entradas en ${eventRecord?.name || "evento"}`);
  saveState();
  if (CLOUD_MODE && uploadFormat === "file") {
    try {
      setTicketUploadProgress(true, "Subiendo a la nube", `Guardando ${total} ${total === 1 ? "archivo" : "archivos"}...`, 40);
      await syncStateToCloud();
      for (let index = 0; index < additions.length; index += 1) {
        await uploadTicketFile(additions[index], queuedFiles[index]);
        const completed = index + 1;
        setTicketUploadProgress(true, "Subiendo a la nube", `${completed} de ${additions.length} archivos completados`, 40 + (completed / additions.length) * 50);
      }
      saveState();
      setTicketUploadProgress(true, "Finalizando", "Actualizando el inventario...", 94);
      await syncStateToCloud();
    } catch {
      showToast("Las entradas se guardaron, pero algun archivo sigue pendiente de subir.", "error");
    }
  }
  setTicketUploadProgress(true, "Entradas listas!", `${additions.length} ${additions.length === 1 ? "entrada agregada" : "entradas agregadas"} al inventario.`, 100);
  await new Promise((resolve) => setTimeout(resolve, 450));
  $("#ticketUploadModal").close();
  pendingReservationUploadClientId = "";
  renderAll();
  showToast(reservationClient ? "PDF asignado a la reserva." : `${additions.length} entradas agregadas al inventario.`);
}

function createTicketRecord(data) {
  return {
    id: uid("ticket"),
    eventId: data.eventId,
    internalCode: `${data.prefix}-${String(data.sequence).padStart(3, "0")}`,
    format: data.format,
    zone: data.zone,
    basePrice: data.basePrice,
    salePrice: 0,
    status: data.status,
    paymentStatus: "pending",
    paymentMethod: "",
    buyerName: "",
    buyerPhone: "",
    buyerDocument: "",
    notes: "",
    codeValue: data.codeValue || "",
    fileId: data.fileId || null,
    fileName: data.fileName || "",
    fileType: data.fileType || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    sharedAt: null,
  };
}

function openTicketModal(ticketId) {
  const requestedId = String(ticketId || "");
  const ticket = state.tickets.find((item) => String(item.id) === requestedId && !item.deletedAt);
  if (!ticket) {
    showToast("No se pudo abrir esta entrada. Actualiza la página e intenta otra vez.", "error");
    return;
  }
  const event = state.events.find((item) => item.id === ticket.eventId);
  const ticketModal = $("#ticketModal");
  if (!ticketModal) {
    showToast("No se encontro el modal para gestionar la entrada.", "error");
    return;
  }
  $("#editingTicketId").value = ticket.id;
  $("#ticketModalTitle").textContent = ticket.buyerName || ticket.buyerPhone ? "Gestionar venta" : "Asignar entrada";
  $("#ticketDetailFormat").textContent = FORMAT_LABELS[ticket.format];
  $("#ticketDetailCode").textContent = ticket.zone || ticket.internalCode;
  $("#ticketDetailCode").title = ticket.zone || "";
  $("#ticketDetailMeta").textContent = `${ticket.fileName || FORMAT_LABELS[ticket.format]} - ID: ${shortId(ticket.id)} - ${event?.name || "Evento"} - ${formatMoney(ticket.basePrice)}`;
  $("#ticketFileTile").innerHTML = `<i data-lucide="${FORMAT_ICONS[ticket.format]}"></i>`;
  $("#editTicketStatus").value = ticket.status;
  $("#editPaymentStatus").value = ticket.paymentStatus;
  $("#buyerName").value = ticket.buyerName || "";
  $("#buyerPhone").value = ticket.buyerPhone ? formatPhoneForDisplay(ticket.buyerPhone) : "";
  $("#buyerDocument").value = ticket.buyerDocument || "";
  $("#salePrice").value = ticket.salePrice || ticket.basePrice || 0;
  $("#paymentMethod").value = ticket.paymentMethod || "";
  $("#ticketNotes").value = ticket.notes || "";
  const hasFile = Boolean(ticket.fileId || ticket.objectKey);
  $("#previewTicketBtn").hidden = !hasFile && ticket.format !== "code";
  $("#downloadTicketBtn").hidden = !hasFile;
  $("#shareTicketBtn").hidden = !hasFile && ticket.format !== "code";
  $("#whatsappTicketBtn").hidden = !ticket.buyerPhone;
  ticketModal.showModal();
  refreshIcons();
}

function saveTicket(event) {
  event.preventDefault();
  const ticket = state.tickets.find((item) => item.id === $("#editingTicketId").value);
  if (!ticket) return;
  const oldStatus = ticket.status;
  ticket.status = $("#editTicketStatus").value;
  ticket.paymentStatus = $("#editPaymentStatus").value;
  ticket.buyerName = $("#buyerName").value.trim();
  ticket.buyerPhone = $("#buyerPhone").value.trim();
  ticket.buyerDocument = $("#buyerDocument").value.trim();
  ticket.salePrice = Number($("#salePrice").value || ticket.basePrice);
  ticket.paymentMethod = $("#paymentMethod").value;
  ticket.notes = $("#ticketNotes").value.trim();
  ticket.updatedAt = Date.now();

  if (ticket.status !== "available" && !ticket.buyerName && !ticket.buyerPhone) {
    return showToast("Registra un WhatsApp o un nombre antes de reservar o vender.", "error");
  }
  if (ticket.paymentStatus === "paid" && ticket.status === "reserved") ticket.status = "sold";
  if (ticket.status === "sold" || ticket.status === "delivered") ticket.sharedAt = null;
  addActivity(ticket.paymentStatus === "paid" ? "payment" : "ticket", "Entrada actualizada", `${ticket.internalCode}: ${STATUS[oldStatus]} -> ${STATUS[ticket.status]}`);
  saveState();
  $("#ticketModal").close();
  renderAll();
  showToast("Entrada actualizada.");
}

function getSelectedActiveTickets() {
  return state.tickets.filter((ticket) => selectedTickets.has(ticket.id) && !ticket.deletedAt);
}

function openBulkSaleModal() {
  const tickets = getSelectedActiveTickets();
  if (!tickets.length) return showToast("Selecciona las entradas que quieres registrar.", "error");
  const event = state.events.find((item) => item.id === state.selectedEventId);
  const codesPreview = tickets.slice(0, 5).map((ticket) => ticket.internalCode).join(", ");
  const extraCount = tickets.length > 5 ? ` y ${tickets.length - 5} mas` : "";
  const baseTotal = tickets.reduce((sum, ticket) => sum + Number(ticket.basePrice || 0), 0);
  const samePrice = tickets.every((ticket) => Number(ticket.basePrice || 0) === Number(tickets[0].basePrice || 0));

  $("#bulkSaleSummary").textContent = `${tickets.length} entradas para ${event?.name || "este evento"}: ${codesPreview}${extraCount}. Base total: ${formatMoney(baseTotal)}.`;
  $("#bulkTicketStatus").value = "sold";
  $("#bulkPaymentStatus").value = "paid";
  $("#bulkBuyerName").value = "";
  $("#bulkBuyerPhone").value = "";
  $("#bulkBuyerDocument").value = "";
  $("#bulkSalePrice").value = samePrice ? Number(tickets[0].basePrice || 0) : "";
  $("#bulkPaymentMethod").value = "";
  $("#bulkTicketNotes").value = "";
  $("#bulkSaleModal").showModal();
  refreshIcons();
}

function saveBulkSale(event) {
  event.preventDefault();
  const tickets = getSelectedActiveTickets();
  if (!tickets.length) return showToast("No hay entradas seleccionadas.", "error");

  const status = $("#bulkTicketStatus").value;
  const paymentStatus = $("#bulkPaymentStatus").value;
  const buyerName = $("#bulkBuyerName").value.trim();
  const buyerPhone = $("#bulkBuyerPhone").value.trim();
  const buyerDocument = $("#bulkBuyerDocument").value.trim();
  const salePriceValue = $("#bulkSalePrice").value;
  const paymentMethod = $("#bulkPaymentMethod").value;
  const notes = $("#bulkTicketNotes").value.trim();

  if (!buyerName && !buyerPhone) {
    return showToast("Registra al menos un WhatsApp o alias para el comprador.", "error");
  }

  tickets.forEach((ticket) => {
    ticket.status = paymentStatus === "paid" && status === "reserved" ? "sold" : status;
    ticket.paymentStatus = paymentStatus;
    ticket.buyerName = buyerName;
    ticket.buyerPhone = buyerPhone;
    ticket.buyerDocument = buyerDocument;
    ticket.salePrice = salePriceValue === "" ? Number(ticket.basePrice || 0) : Number(salePriceValue);
    ticket.paymentMethod = paymentMethod;
    ticket.notes = notes;
    ticket.updatedAt = Date.now();
    if (ticket.status === "sold" || ticket.status === "delivered") ticket.sharedAt = null;
  });

  const owner = buyerName || buyerPhone;
  addActivity(paymentStatus === "paid" ? "payment" : "ticket", "Venta multiple registrada", `${tickets.length} entradas asignadas a ${owner}`);
  selectedTickets.clear();
  saveState();
  $("#bulkSaleModal").close();
  renderAll();
  showToast(`${tickets.length} entradas registradas.`);
}

async function openTicketFile(ticket, mode = "preview") {
  if (ticket.format === "code" && ticket.codeValue) {
    await navigator.clipboard.writeText(ticket.codeValue);
    return showToast("Código copiado.");
  }
  const record = await getTicketFile(ticket);
  if (!record) return showToast("Este archivo de demostracion no esta disponible.", "error");
  const url = URL.createObjectURL(record.blob);
  if (mode === "download") {
    const link = document.createElement("a");
    link.href = url;
    link.download = record.name;
    link.click();
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function getTicketFile(ticket) {
  const local = await getFile(ticket.fileId);
  if (local) return local;
  if (!ticket.objectKey) return null;
  const response = await apiFetch(`/api/files/${encodeURIComponent(ticket.id)}`);
  const blob = await response.blob();
  return {
    blob,
    name: ticket.fileName || "entrada",
    type: ticket.fileType || blob.type || "application/octet-stream",
  };
}

function buildDeliveryMessage(tickets, event) {
  const count = tickets.length;
  const eventName = event?.name || "el evento";
  const zones = [...new Set(tickets.map((ticket) => ticket.zone).filter(Boolean))];
  const zoneText = zones.length === 1 ? ` ${zones[0]}` : "";
  const fileTickets = tickets.filter((ticket) => ticket.format === "pdf" || ticket.format === "image");
  const codeTickets = tickets.filter((ticket) => ticket.format === "code" && ticket.codeValue);
  const listTickets = tickets.filter((ticket) => ticket.format === "list");
  const operations = tickets.map((ticket) => (
    `${tickets.length > 1 ? "• " : ""}${ticket.internalCode}`
  )).join("\n");
  const intro = count === 1
    ? `Hola, te comparto tu entrada${zoneText} para ${eventName}.`
    : `Hola, te comparto tus ${count} entradas${zoneText} para ${eventName}.`;
  const details = [];

  details.push(`📌 ${tickets.length > 1 ? "Nros. de operación" : "Nro. de operación"}:\n${operations}`);
  if (fileTickets.length === 1) {
    details.push("📎 Archivo adjunto:\nEncontrarás tu entrada en PDF con su código QR.");
  } else if (fileTickets.length > 1) {
    details.push("📎 Archivos adjuntos:\nEncontrarás tus entradas en PDF con sus códigos QR.");
  }
  if (codeTickets.length) {
    details.push(`🔐 Código${codeTickets.length > 1 ? "s" : ""} de acceso:\n${codeTickets.map((ticket) => `• ${ticket.codeValue}`).join("\n")}`);
  }
  if (listTickets.length) {
    details.push(`✅ ${listTickets.length === 1 ? "Tu acceso quedó registrado" : "Tus accesos quedaron registrados"} en lista.`);
  }

  const responsibility = fileTickets.length || codeTickets.length
    ? `⚠️ Importante:\nGuarda ${count > 1 ? "tus entradas" : "tu entrada"} y no ${count > 1 ? "las compartas" : "la compartas"} con terceros. Desde este momento ${count > 1 ? "quedan" : "queda"} bajo tu responsabilidad.`
    : "⚠️ Importante:\nConserva este mensaje como referencia de tu acceso.";

  return withFestholicFooter(`🎟️ Entradas enviadas | ${eventName}\n\n${intro}\n\n${details.join("\n\n")}\n\n${responsibility}\n\nGracias por tu compra y por la confianza 🙌\n\nKeen Sanchez | Live Fest Perú\n¡Nos vemos en el evento! 🥳`);
}

async function markTicketsAsShared(tickets) {
  const sharedAt = Date.now();
  tickets.forEach((ticket) => {
    ticket.sharedAt = sharedAt;
    ticket.updatedAt = sharedAt;
  });
  saveState();
  renderAll();
  if (CLOUD_MODE) await syncStateToCloud();
}

async function shareTicket(ticketId, triggerButton = null) {
  const ticket = state.tickets.find((item) => item.id === ticketId && !item.deletedAt);
  if (!ticket) return;
  const event = state.events.find((item) => item.id === ticket.eventId);
  const text = buildDeliveryMessage([ticket], event);
  showShareProgress("Estamos preparando la entrada y el mensaje para compartir.");
  setShareButtonLoading(triggerButton, true);

  try {
    if (ticket.format === "code" || ticket.format === "list") {
      await navigator.clipboard.writeText(text).catch(() => {});
      if (navigator.share) {
        await waitForShareFeedbackFrame();
        try {
          await navigator.share({ title: event?.name || "Entrada", text });
          await markTicketsAsShared([ticket]);
          showToast("Entrada compartida y mensaje copiado.");
          return;
        } catch (error) {
          if (error.name === "AbortError") {
            showToast("Compartir cancelado.", "error");
            return;
          }
          console.warn("No se abrio el panel de compartir código:", error);
        }
      }
      await markTicketsAsShared([ticket]);
      showToast("Mensaje y código copiados.");
      return;
    }

    const record = await getTicketFile(ticket);
    if (!record) {
      showToast("El archivo no esta disponible en este dispositivo.", "error");
      return;
    }

    const file = new File([record.blob], record.name, { type: record.type });
    const canShareFile = navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }));
    if (canShareFile) {
      await navigator.clipboard.writeText(text).catch(() => {});
      await waitForShareFeedbackFrame();
      try {
        await navigator.share({ title: event?.name || "Entrada", text, files: [file] });
        await markTicketsAsShared([ticket]);
        showToast("Entrada compartida y mensaje copiado.");
        return;
      } catch (error) {
        if (error.name === "AbortError") {
          showToast("Compartir cancelado.", "error");
          return;
        }
        console.warn("No se abrio el panel de compartir archivo:", error);
      }
    }

    await openTicketFile(ticket, "download");
    await navigator.clipboard.writeText(text).catch(() => {});
    await markTicketsAsShared([ticket]);
    showToast("Archivo descargado y mensaje copiado.");
  } catch (error) {
    console.error("No se pudo compartir la entrada:", error);
    showToast("No se pudo preparar la entrada para compartir.", "error");
  } finally {
    hideShareProgress();
    setShareButtonLoading(triggerButton, false);
  }
}

async function shareSelectedTickets(triggerButton = null) {
  const tickets = state.tickets.filter((ticket) => selectedTickets.has(ticket.id) && !ticket.deletedAt);
  if (tickets.length < 2) return showToast("Selecciona al menos 2 entradas.", "error");

  showShareProgress("Estamos preparando las entradas seleccionadas para compartir.");
  setShareButtonLoading(triggerButton, true);

  try {
    const event = state.events.find((item) => item.id === tickets[0].eventId);
    const eventName = event?.name || "el evento";
    const text = buildDeliveryMessage(tickets, event);

    const records = [];
    let missingFiles = 0;
    for (const ticket of tickets.filter((item) => item.format === "pdf" || item.format === "image")) {
      try {
        const record = await getTicketFile(ticket);
        if (record) records.push(record);
        else missingFiles += 1;
      } catch {
        missingFiles += 1;
      }
    }

    const files = records.map((record) => new File([record.blob], record.name, { type: record.type }));
    const canShareFiles = navigator.share && (!files.length || !navigator.canShare || navigator.canShare({ files }));
    if (canShareFiles) {
      await navigator.clipboard.writeText(text).catch(() => {});
      await waitForShareFeedbackFrame();
      try {
        await navigator.share({ title: `${tickets.length} entradas - ${eventName}`, text, ...(files.length ? { files } : {}) });
        await markTicketsAsShared(tickets);
        showToast("Entradas compartidas y mensaje copiado.");
        return;
      } catch (error) {
        if (error.name === "AbortError") {
          showToast("Compartir cancelado.", "error");
          return;
        }
        console.warn("No se abrio el panel de compartir entradas:", error);
      }
    }

    records.forEach((record) => {
      const url = URL.createObjectURL(record.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = record.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
    await navigator.clipboard.writeText(text).catch(() => {});
    await markTicketsAsShared(tickets);
    const detail = missingFiles ? ` ${missingFiles} archivo(s) no estaban disponibles.` : "";
    showToast(`Archivos descargados y mensaje copiado.${detail}`, missingFiles ? "error" : "success");
  } catch (error) {
    console.error("No se pudieron compartir las entradas:", error);
    showToast("No se pudieron preparar las entradas para compartir.", "error");
  } finally {
    hideShareProgress();
    setShareButtonLoading(triggerButton, false);
  }
}

function resolveOfficialTicketCover(event) {
  const eventName = String(event?.name || "").toLowerCase();
  if (eventName.includes("hardwell")) return "img/apps/hardwellportada.png";
  return event?.image || "";
}
async function buildOfficialTicketPdfBlob(ticketLike, event) {
  const eventName = event?.name || "Evento";
  const { jsPDF } = window.jspdf;
  const pageWidth = 100;
  const pageHeight = 198;
  const documentPdf = new jsPDF({ unit: "mm", format: [pageWidth, pageHeight], orientation: "portrait" });

  const BLACK = [7, 7, 8];
  const ORANGE = [225, 132, 0];
  const LIGHT_GRAY = [239, 239, 239];
  const NOTICE_GRAY = [245, 245, 245];
  const WARNING_BG = [255, 202, 204];
  const WARNING_TEXT = [116, 18, 29];
  const DARK_TEXT = [12, 12, 14];
  const MUTED = [82, 82, 90];

  const drawTextBlock = (text, x, y, maxWidth, options = {}) => {
    const lines = documentPdf.splitTextToSize(String(text || ""), maxWidth);
    documentPdf.text(lines, x, y, options);
    return y + lines.length * (options.lineHeight || 4.2);
  };

  documentPdf.setFillColor(255, 255, 255);
  documentPdf.rect(0, 0, pageWidth, pageHeight, "F");

  documentPdf.setFillColor(...BLACK);
  documentPdf.rect(0, 0, pageWidth, 7, "F");
  try {
    const logo = await imageSourceToDataUrl("img/apps/duapass-logo-b.png", 420, 110);
    documentPdf.addImage(logo, "JPEG", 41, 1.6, 18, 4.6);
  } catch {
    documentPdf.setTextColor(255, 255, 255);
    documentPdf.setFont("helvetica", "bold");
    documentPdf.setFontSize(8.5);
    documentPdf.text("duapass", pageWidth / 2, 5.2, { align: "center" });
  }

  const coverTop = 7;
  const coverHeight = 48;
  const officialCover = resolveOfficialTicketCover(event);
  if (officialCover) {
    try {
      const cover = await imageSourceToDataUrl(officialCover, 1400, 700);
      documentPdf.addImage(cover, "JPEG", 0, coverTop, pageWidth, coverHeight);
    } catch {
      documentPdf.setFillColor(22, 22, 25);
      documentPdf.rect(0, coverTop, pageWidth, coverHeight, "F");
    }
  } else {
    documentPdf.setFillColor(22, 22, 25);
    documentPdf.rect(0, coverTop, pageWidth, coverHeight, "F");
  }

  let y = 66;
  documentPdf.setTextColor(...DARK_TEXT);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(13.2);
  const titleLines = documentPdf.splitTextToSize(eventName, pageWidth - 16);
  const titleFontSize = titleLines.length > 1 ? 12.6 : 14.5;
  documentPdf.setFontSize(titleFontSize);
  documentPdf.text(titleLines, pageWidth / 2, y, { align: "center" });
  y += titleLines.length * (titleLines.length > 1 ? 5.25 : 6.3) + 1;

  const dateLabel = event?.date
    ? new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${event.date}T12:00:00`))
    : "Fecha por confirmar";
  const timeLabel = event?.time || event?.hour || "";
  const dateLine = `${dateLabel.charAt(0).toUpperCase()}${dateLabel.slice(1)}${timeLabel ? ` -- ${timeLabel}` : ""}`;

  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(7.8);
  documentPdf.setTextColor(...MUTED);
  documentPdf.text(dateLine, pageWidth / 2, y, { align: "center" });
  y += 4.5;
  documentPdf.text(event?.venue || "Lugar por confirmar", pageWidth / 2, y, { align: "center" });
  y += 8;

  const accessLabel = (ticketLike.zone || "INVITACIÓN PERSONAL").toUpperCase();
  documentPdf.setFillColor(...ORANGE);
  documentPdf.roundedRect(3, y, pageWidth - 6, 5.6, 0.8, 0.8, "F");
  documentPdf.setTextColor(255, 255, 255);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(8);
  documentPdf.text(accessLabel, pageWidth / 2, y + 3.9, { align: "center" });
  y += 9.5;

  documentPdf.setDrawColor(...ORANGE);
  documentPdf.setLineWidth(0.9);
  documentPdf.line(3, y, pageWidth - 3, y);
  y += 1;

  const ticketBoxY = y;
  const ticketBoxHeight = 41;
  documentPdf.setFillColor(...LIGHT_GRAY);
  documentPdf.roundedRect(3, ticketBoxY, pageWidth - 6, ticketBoxHeight, 1.2, 1.2, "F");

  const owner = formatPersonNameForPdf(ticketLike.buyerName) || "Sin titular";
  const documentNumber = ticketLike.buyerDocument || "";
  documentPdf.setTextColor(...DARK_TEXT);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(8.8);
  let infoY = ticketBoxY + 9;
  infoY = drawTextBlock(owner, 7.5, infoY, 49, { lineHeight: 4.5 });
  if (documentNumber) {
    documentPdf.setFont("helvetica", "normal");
    documentPdf.setFontSize(7.4);
    documentPdf.text(String(documentNumber), 7.5, infoY + 1.5);
  }

  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(7.8);
  documentPdf.text((ticketLike.zone || "GENERAL").toUpperCase(), 7.5, ticketBoxY + 27);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(7.1);
  documentPdf.text("Acceso para 1 persona", 7.5, ticketBoxY + 32.2);
  documentPdf.setFontSize(6.6);
  documentPdf.setTextColor(...MUTED);
  documentPdf.text(`Código: ${ticketLike.internalCode}`, 7.5, ticketBoxY + 37.1);

  const qrPayload = [
    "I AM PROMOTE",
    "ENTRADA CONFIRMADA",
    `Evento: ${eventName}`,
    `Zona: ${ticketLike.zone || "General"}`,
    `Código: ${ticketLike.internalCode}`,
    `ID: ${ticketLike.id}`,
  ].join("\n");
  const qrDataUrl = await window.QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 520, color: { dark: "#000000", light: "#ffffff" } });
  documentPdf.addImage(qrDataUrl, "PNG", pageWidth - 37, ticketBoxY + 6.2, 30, 30);

  y = ticketBoxY + ticketBoxHeight + 1;
  documentPdf.setDrawColor(...ORANGE);
  documentPdf.line(3, y, pageWidth - 3, y);
  y += 8;

  documentPdf.setFillColor(...NOTICE_GRAY);
  documentPdf.roundedRect(3, y, pageWidth - 6, 38, 1.3, 1.3, "F");
  let noticeY = y + 7;

  const paymentLine = `Pago: ${PAYMENT_STATUS[ticketLike.paymentStatus]}  -  Precio: ${formatMoney(ticketLike.salePrice || ticketLike.basePrice)}`;
  documentPdf.setFillColor(...WARNING_BG);
  documentPdf.rect(7.5, noticeY - 4.1, pageWidth - 15, 5.2, "F");
  documentPdf.setTextColor(...WARNING_TEXT);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(5.2);
  documentPdf.text(`Valido hasta: No especificado  -  ${paymentLine}`, 9, noticeY);
  noticeY += 9;

  documentPdf.setTextColor(46, 46, 52);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(5.15);
  const terms = [
    "Esta invitación es personal e intransferible. Los datos del QR deben coincidir con lo impreso en el PDF.",
    "El acceso esta sujeto a aforo y horario de ingreso; agotado el aforo o pasado el horario, pierde validez.",
    "Ante indicios de falsificacion o duplicado, el organizador podra no autorizar el ingreso.",
  ];
  terms.forEach((paragraph) => {
    const lines = documentPdf.splitTextToSize(paragraph, pageWidth - 16);
    documentPdf.text(lines, 7.5, noticeY);
    noticeY += lines.length * 3.05 + 2.5;
  });

  const blob = documentPdf.output("blob");
  const safeEventName = eventName.normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const fileName = `entrada-${safeEventName || "evento"}-${ticketLike.internalCode}.pdf`;
  return { blob, fileName };
}
function resolveOfficialPdfSource(rawId) {
  const [ticketId, reservationIndexRaw] = String(rawId).split("::");
  const ticket = state.tickets.find((item) => item.id === ticketId && !item.deletedAt);
  if (ticket) return { ticketLike: ticket, event: state.events.find((item) => item.id === ticket.eventId), isRealTicket: true };

  const client = (state.clients || []).find((item) => item.id === ticketId && !item.deletedAt);
  if (!client) return null;
  const event = state.events.find((item) => item.id === client.eventId);
  const info = getClientReservationInfo(client);
  const reservationIndex = Number(reservationIndexRaw) || 1;
  const ticketLike = {
    id: client.id,
    internalCode: `RESERVA-${client.id.slice(-6).toUpperCase()}-${String(reservationIndex).padStart(2, "0")}`,
    zone: info.zone,
    basePrice: info.price,
    salePrice: info.price,
    paymentStatus: client.stage === "pending" ? "pending" : "paid",
    buyerName: client.name || "",
    buyerPhone: client.phone || "",
    buyerDocument: client.document || client.dni || client.buyerDocument || "",
  };
  return { ticketLike, event, isRealTicket: false };
}

async function generateOfficialTicketPdf(rawId, triggerButton = null) {
  if (!window.jspdf?.jsPDF) return showToast("No se pudo cargar el generador de PDF.", "error");
  if (!window.QRCode?.toDataURL) return showToast("No se pudo cargar el generador de QR.", "error");
  const resolved = resolveOfficialPdfSource(rawId);
  if (!resolved) return showToast("No se encontro la entrada o reserva.", "error");
  const { ticketLike, event, isRealTicket } = resolved;

  setShareButtonLoading(triggerButton, true);
  try {
    const { blob, fileName } = await buildOfficialTicketPdfBlob(ticketLike, event);
    const eventName = event?.name || "Evento";
    const file = new File([blob], fileName, { type: "application/pdf" });
    const message = buildDeliveryMessage([ticketLike], event);

    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.clipboard.writeText(message).catch(() => {});
      try {
        await navigator.share({ title: `Entrada - ${eventName}`, text: message, files: [file] });
        if (isRealTicket) await markTicketsAsShared([ticketLike]);
        showToast("Entrada generada y compartida.");
        return;
      } catch (error) {
        if (error.name === "AbortError") {
          showToast("Compartir cancelado.", "error");
          return;
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    await navigator.clipboard.writeText(message).catch(() => {});
    if (isRealTicket) await markTicketsAsShared([ticketLike]);
    showToast("Entrada generada y descargada.");
  } catch (error) {
    console.error("No se pudo generar la entrada oficial:", error);
    showToast("No se pudo generar la entrada.", "error");
  } finally {
    setShareButtonLoading(triggerButton, false);
  }
}

async function generateProvisionalVoucher(tickets) {
  if (!tickets.length) return showToast("Selecciona al menos una entrada.", "error");
  if (!window.jspdf?.jsPDF) return showToast("No se pudo cargar el generador de PDF.", "error");
  if (!window.QRCode?.toDataURL) return showToast("No se pudo cargar el generador de QR.", "error");

  const event = state.events.find((item) => item.id === tickets[0].eventId);
  const eventName = event?.name || "Evento";
  const zones = [...new Set(tickets.map((ticket) => ticket.zone).filter(Boolean))];
  const owners = [...new Set(tickets.map(getTicketOwner).filter((owner) => owner !== "Sin asignar"))];
  const phones = [...new Set(tickets.map((ticket) => ticket.buyerPhone).filter(Boolean))];
  const operationCodes = [...new Set(tickets.map((ticket) => ticket.internalCode))];
  const total = tickets.reduce((sum, ticket) => sum + Number(ticket.salePrice || ticket.basePrice || 0), 0);
  const paymentLabels = [...new Set(tickets.map((ticket) => PAYMENT_STATUS[ticket.paymentStatus]))];
  const { jsPDF } = window.jspdf;
  const documentPdf = new jsPDF({ unit: "mm", format: [100, 210], orientation: "portrait" });
  const pageWidth = 100;
  const pageHeight = 210;
  const reservationQr = [
    "LIVE FEST PERU",
    "RESERVA PROVISIONAL",
    "NO VALIDA PARA INGRESO",
    `Evento: ${eventName}`,
    `Operaciones: ${operationCodes.join(", ")}`,
  ].join("\n");
  const qrDataUrl = await window.QRCode.toDataURL(reservationQr, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 600,
    color: { dark: "#090b0f", light: "#ffffff" },
  });

  documentPdf.setFillColor(10, 12, 16);
  documentPdf.rect(0, 0, pageWidth, pageHeight, "F");
  documentPdf.setFillColor(244, 63, 79);
  documentPdf.rect(0, 0, pageWidth, 3, "F");

  if (event?.image) {
    try {
      const cover = await imageSourceToDataUrl(event.image, 1200, 660);
      documentPdf.addImage(cover, "JPEG", 0, 3, pageWidth, 51);
      documentPdf.setFillColor(10, 12, 16);
      documentPdf.rect(0, 45, pageWidth, 9, "F");
    } catch {}
  } else {
    documentPdf.setFillColor(24, 28, 36);
    documentPdf.rect(0, 3, pageWidth, 51, "F");
  }

  try {
    const logo = await imageSourceToDataUrl("livefest-logo.png", 500, 500);
    documentPdf.addImage(logo, "JPEG", 7, 8, 13, 13);
  } catch {}

  documentPdf.setTextColor(255, 255, 255);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(11);
  documentPdf.text("LIVE FEST PERU", 24, 14);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(6.5);
  documentPdf.text("Entrada de reserva", 24, 19);

  documentPdf.setFillColor(244, 63, 79);
  documentPdf.roundedRect(66, 9, 27, 10, 2, 2, "F");
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(7.5);
  documentPdf.text("PROVISIONAL", 79.5, 15.3, { align: "center" });

  documentPdf.setFillColor(244, 63, 79);
  documentPdf.rect(0, 46, pageWidth, 8, "F");
  documentPdf.setFontSize(7.5);
  documentPdf.text("NO VALIDA PARA INGRESO", pageWidth / 2, 51.2, { align: "center" });

  let contentTop = 63;
  documentPdf.setTextColor(244, 63, 79);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(7);
  documentPdf.text("ENTRADA PARA", 8, contentTop);
  documentPdf.setTextColor(255, 255, 255);
  documentPdf.setFontSize(17);
  const eventLines = documentPdf.splitTextToSize(eventName, 84);
  documentPdf.text(eventLines, 8, contentTop + 8);
  contentTop += 11 + eventLines.length * 6;

  documentPdf.setDrawColor(60, 65, 75);
  documentPdf.setLineDashPattern([1.5, 1.5], 0);
  documentPdf.line(8, contentTop, 92, contentTop);
  documentPdf.setLineDashPattern([], 0);
  contentTop += 8;

  const details = [
    ["FECHA", event?.date ? formatDate(event.date) : "Por confirmar"],
    ["LUGAR", event?.venue || "Por confirmar"],
    ["ZONA", zones.join(", ") || "General"],
    ["CANTIDAD", `${tickets.length} ${tickets.length === 1 ? "entrada" : "entradas"}`],
  ];
  details.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 8 + column * 44;
    const y = contentTop + row * 17;
    documentPdf.setTextColor(141, 148, 160);
    documentPdf.setFont("helvetica", "bold");
    documentPdf.setFontSize(6);
    documentPdf.text(label, x, y);
    documentPdf.setTextColor(255, 255, 255);
    documentPdf.setFontSize(8.5);
    documentPdf.text(documentPdf.splitTextToSize(String(value), 38), x, y + 5);
  });
  contentTop += 36;

  documentPdf.setFillColor(18, 21, 27);
  documentPdf.setDrawColor(47, 52, 62);
  documentPdf.roundedRect(7, contentTop, 86, 48, 2, 2, "FD");
  const qrSize = 32;
  documentPdf.addImage(qrDataUrl, "PNG", 57, contentTop + 5, qrSize, qrSize);

  documentPdf.setTextColor(141, 148, 160);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(6);
  documentPdf.text("NÚMERO DE OPERACIÓN", 12, contentTop + 9);
  documentPdf.setTextColor(255, 255, 255);
  documentPdf.setFontSize(9);
  documentPdf.text(documentPdf.splitTextToSize(operationCodes.join("\n"), 38), 12, contentTop + 16);

  documentPdf.setTextColor(141, 148, 160);
  documentPdf.setFontSize(5.5);
  documentPdf.text("COMPRADOR / WHATSAPP", 12, contentTop + 33);
  documentPdf.setTextColor(255, 255, 255);
  documentPdf.setFontSize(7.5);
  const buyer = owners.join(", ") || phones.join(", ") || "Sin registrar";
  documentPdf.text(documentPdf.splitTextToSize(buyer, 38), 12, contentTop + 38);

  documentPdf.setTextColor(120, 126, 137);
  documentPdf.setFontSize(5.2);
  documentPdf.text("QR DE IDENTIFICACION", 73, contentTop + 41, { align: "center" });
  documentPdf.setTextColor(244, 63, 79);
  documentPdf.setFontSize(5);
  documentPdf.text("QR DE ACCESO", 73, contentTop + 45, { align: "center" });
  contentTop += 56;

  documentPdf.setFillColor(39, 30, 19);
  documentPdf.setDrawColor(153, 103, 28);
  documentPdf.roundedRect(7, contentTop, 86, 29, 2, 2, "FD");
  documentPdf.setTextColor(255, 205, 120);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(7);
  documentPdf.text("IMPORTANTE", 12, contentTop + 8);
  documentPdf.setTextColor(234, 224, 206);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(6.4);
  const warning = "Confirma tu reserva con Live Fest Peru. No contiene el acceso oficial ni permite ingresar al evento. Sera reemplazada por la entrada oficial cuando la produccion la entregue.";
  documentPdf.text(documentPdf.splitTextToSize(warning, 75), 12, contentTop + 14);

  documentPdf.setTextColor(130, 136, 147);
  documentPdf.setFontSize(5.8);
  documentPdf.text(`Pago: ${paymentLabels.join(", ")}  -  Monto registrado: ${formatMoney(total)}`, pageWidth / 2, 196, { align: "center", maxWidth: 86 });
  documentPdf.setTextColor(255, 255, 255);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(6.5);
  documentPdf.text("Keen Sanchez | Live Fest Peru", pageWidth / 2, 202, { align: "center" });
  documentPdf.setFillColor(244, 63, 79);
  documentPdf.rect(0, pageHeight - 3, pageWidth, 3, "F");

  const blob = documentPdf.output("blob");
  const safeEventName = eventName.normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const generatedAt = new Date();
  const uniqueSuffix = [
    generatedAt.getFullYear(),
    String(generatedAt.getMonth() + 1).padStart(2, "0"),
    String(generatedAt.getDate()).padStart(2, "0"),
    String(generatedAt.getHours()).padStart(2, "0"),
    String(generatedAt.getMinutes()).padStart(2, "0"),
    String(generatedAt.getSeconds()).padStart(2, "0"),
  ].join("");
  const fileName = `entrada-provisional-${safeEventName || "evento"}-${operationCodes[0]}-${uniqueSuffix}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });
  const message = withFestholicFooter(`Te envio tu entrada para ${eventName}. Este documento permite el ingreso y sera reemplazado por el acceso oficial cuando sea entregado por la produccion. Operación: ${operationCodes.join(", ")}.`);

  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.clipboard.writeText(message).catch(() => {});
    try {
      await navigator.share({ title: `Entrada - ${eventName}`, text: message, files: [file] });
      showToast("Entrada compartida.");
    } catch (error) {
      if (error.name !== "AbortError") showToast("No se pudo compartir la entrada.", "error");
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  await navigator.clipboard.writeText(message).catch(() => {});
  showToast("Entrada descargada y mensaje copiado.");
}

function openWhatsApp(ticketId) {
  const ticket = state.tickets.find((item) => item.id === ticketId);
  if (!ticket?.buyerPhone) return showToast("Primero registra el WhatsApp del comprador.", "error");
  const event = state.events.find((item) => item.id === ticket.eventId);
  const phone = ticket.buyerPhone.replace(/\D/g, "");
  const text = buildDeliveryMessage([ticket], event);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

function deleteTicket(ticketId) {
  const ticket = state.tickets.find((item) => item.id === ticketId);
  if (!ticket) return;
  const warning = ticket.paymentStatus === "paid" || ticket.status === "delivered"
    ? "Esta entrada esta pagada o entregada. Revisa bien antes de eliminarla."
    : "La entrada dejara de mostrarse, pero podras recuperarla desde la papelera.";
  showConfirm("Mover entrada a la papelera", warning, () => {
    ticket.deletedAt = Date.now();
    state.trash.push({ id: ticket.id, type: "ticket", label: ticket.internalCode, deletedAt: ticket.deletedAt });
    selectedTickets.delete(ticket.id);
    addActivity("delete", "Entrada eliminada", ticket.internalCode);
    saveState();
    $("#ticketModal").close();
    renderAll();
    showToast("Entrada movida a la papelera.");
  }, "Mover a papelera");
}

function restoreTrash(id) {
  const entryIndex = state.trash.findIndex((item) => item.id === id);
  if (entryIndex < 0) return;
  const entry = state.trash[entryIndex];
  if (entry.type === "event") {
    const event = state.events.find((item) => item.id === id);
    if (event) event.deletedAt = null;
    state.tickets
      .filter((ticket) => ticket.eventId === id && ticket.deletedAt === entry.deletedAt)
      .forEach((ticket) => { ticket.deletedAt = null; });
  } else {
    const ticket = state.tickets.find((item) => item.id === id);
    if (ticket) ticket.deletedAt = null;
  }
  state.trash.splice(entryIndex, 1);
  addActivity("restore", "Elemento restaurado", entry.label);
  saveState();
  renderAll();
  showToast("Elemento restaurado.");
}

function purgeTrash(id) {
  const entry = state.trash.find((item) => item.id === id);
  if (!entry) return;
  showConfirm("Eliminar definitivamente", "Esta accion no se puede deshacer.", async () => {
    if (entry.type === "event") {
      const tickets = state.tickets.filter((ticket) => ticket.eventId === id);
      await Promise.all(tickets.map(deleteTicketFile));
      state.tickets = state.tickets.filter((ticket) => ticket.eventId !== id);
      state.events = state.events.filter((event) => event.id !== id);
      state.trash = state.trash.filter((item) => item.id !== id && !tickets.some((ticket) => ticket.id === item.id));
    } else {
      const ticket = state.tickets.find((item) => item.id === id);
      await deleteTicketFile(ticket);
      state.tickets = state.tickets.filter((item) => item.id !== id);
      state.trash = state.trash.filter((item) => item.id !== id);
    }
    saveState();
    renderAll();
    showToast("Elemento eliminado definitivamente.");
  }, "Borrar definitivamente");
}

async function emptyTrash() {
  const deletedTickets = state.tickets.filter((ticket) => ticket.deletedAt);
  const deletedEventIds = new Set(
    state.events.filter((event) => event.deletedAt).map((event) => event.id)
  );
  const filesToDelete = state.tickets.filter((ticket) => (
    ticket.deletedAt || deletedEventIds.has(ticket.eventId)
  ));

  if (CLOUD_MODE) {
    await apiFetch("/api/trash", { method: "DELETE" });
  } else {
    await Promise.all(filesToDelete.map(deleteTicketFile));
  }

  await Promise.all(filesToDelete.map((ticket) => deleteFile(ticket.fileId)));
  state.tickets = state.tickets.filter((ticket) => (
    !ticket.deletedAt && !deletedEventIds.has(ticket.eventId)
  ));
  state.events = state.events.filter((event) => !event.deletedAt);
  state.trash = [];
  saveState();
  renderAll();
  showToast(`${deletedTickets.length} entradas eliminadas definitivamente.`);
}

function exportBackup() {
  const payload = { version: 1, exportedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `iampromote-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Respaldo exportado. Los archivos PDF deben conservarse en este dispositivo.");
}

async function importBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (!payload.state?.events || !payload.state?.tickets) throw new Error("Formato invalido");
    showConfirm("Importar respaldo", "Esto reemplazara los eventos y registros actuales. Los archivos PDF no se incluyen en el JSON.", () => {
      state = { ...defaultState, ...payload.state };
      saveState();
      renderAll();
      showToast("Respaldo importado.");
    }, "Importar");
  } catch {
    showToast("No se pudo leer el respaldo.", "error");
  }
}

function closeMobileMenu() {
  document.body.classList.remove("menu-open");
  $("#sidebar")?.classList.remove("open");
  $("#sidebarBackdrop")?.classList.remove("open");
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const closeDialog = event.target.closest("[data-close-dialog]");
    if (closeDialog) {
      const dialog = document.getElementById(closeDialog.dataset.closeDialog);
      if (dialog?.id === "ticketUploadModal" && ticketUploadInProgress) return;
      if (dialog?.open) dialog.close("cancel");
      return;
    }
    const nav = event.target.closest("[data-view]");
    if (nav) return setView(nav.dataset.view);
    const go = event.target.closest("[data-go-view]");
    if (go) return setView(go.dataset.goView);
    const openEvent = event.target.closest("[data-open-event]");
    if (openEvent) return openEventInventory(openEvent.dataset.openEvent);
    const editEvent = event.target.closest("[data-edit-event]");
    if (editEvent) return openEventModal(editEvent.dataset.editEvent);
    const removeEvent = event.target.closest("[data-delete-event]");
    if (removeEvent) return deleteEvent(removeEvent.dataset.deleteEvent);
    const addClientCurrent = event.target.closest("[data-add-client-current]");
    if (addClientCurrent) return openClientModal();
    const openClient = event.target.closest("[data-open-client]");
    if (openClient) return openClientModal(openClient.dataset.openClient, openClient.dataset.openClientPhone);
    const openUploadCurrent = event.target.closest("[data-open-upload-current]");
    if (openUploadCurrent) return openTicketUpload();
    const uploadReservation = event.target.closest("[data-upload-for-reservation]");
    if (uploadReservation) return openReservationTicketUpload(uploadReservation.dataset.uploadForReservation);
    const openTicket = event.target.closest("[data-open-ticket]");
    if (openTicket) return openTicketModal(openTicket.dataset.openTicket);
    const share = event.target.closest("[data-share-ticket]");
    if (share) return shareTicket(share.dataset.shareTicket, share);
    const generateOfficial = event.target.closest("[data-generate-official-pdf]");
    if (generateOfficial) return generateOfficialTicketPdf(generateOfficial.dataset.generateOfficialPdf, generateOfficial);
    const removeTicket = event.target.closest("[data-delete-ticket]");
    if (removeTicket) return deleteTicket(removeTicket.dataset.deleteTicket);

    const restore = event.target.closest("[data-restore-trash]");
    if (restore) return restoreTrash(restore.dataset.restoreTrash);
    const purge = event.target.closest("[data-purge-trash]");
    if (purge) return purgeTrash(purge.dataset.purgeTrash);
  });

  document.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-select-ticket]");
    if (checkbox) {
      if (checkbox.checked) selectedTickets.add(checkbox.dataset.selectTicket);
      else selectedTickets.delete(checkbox.dataset.selectTicket);
      renderInventory();
      refreshIcons();
    }
  });

  $("#newEventBtn").addEventListener("click", () => openEventModal());
  $("#eventForm").addEventListener("submit", saveEvent);
  $("#eventImage").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    eventImageData = await readFileAsDataUrl(file);
    $("#eventImagePreview").innerHTML = `<img src="${eventImageData}" alt="Vista previa" />`;
  });
  $("#eventSearch").addEventListener("input", renderEvents);
  $("#eventStatusFilter").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    eventStatusFilter = button.dataset.value;
    $$("#eventStatusFilter button").forEach((item) => item.classList.toggle("active", item === button));
    renderEvents();
    refreshIcons();
  });

  $("#backToEventsBtn").addEventListener("click", () => setView("events"));
  $("#editCurrentEventBtn").addEventListener("click", () => openEventModal(state.selectedEventId));
  $("#inventoryMenuBtn")?.addEventListener("click", () => { if (state.selectedEventId) deleteEvent(state.selectedEventId); });
  $("#addClientFromInventoryBtn")?.addEventListener("click", () => openClientModal());
  $("#addTicketsBtn").addEventListener("click", openTicketUpload);
  $("#formatTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-format]");
    if (!button) return;
    uploadFormat = button.dataset.format;
    updateUploadMode();
  });
  $("#dropZone").addEventListener("click", (event) => {
    if (event.target !== $("#ticketFiles")) $("#ticketFiles").click();
  });
  ["dragenter", "dragover"].forEach((type) => $("#dropZone").addEventListener(type, (event) => {
    event.preventDefault();
    $("#dropZone").classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((type) => $("#dropZone").addEventListener(type, (event) => {
    event.preventDefault();
    $("#dropZone").classList.remove("dragover");
  }));
  $("#dropZone").addEventListener("drop", (event) => {
    queuedFiles = [...event.dataTransfer.files].filter((file) => file.type === "application/pdf" || file.type.startsWith("image/"));
    renderFileQueue();
  });
  $("#ticketFiles").addEventListener("change", (event) => {
    queuedFiles = [...event.target.files];
    renderFileQueue();
  });
  $("#ticketUploadForm").addEventListener("submit", addTickets);
  $("#ticketUploadModal").addEventListener("cancel", (event) => {
    if (ticketUploadInProgress) event.preventDefault();
  });

  ["ticketSearch", "ticketStatusFilter", "ticketPaymentFilter", "ticketTypeFilter"].forEach((id) => {
    $(`#${id}`).addEventListener(id === "ticketSearch" ? "input" : "change", () => {
      selectedTickets.clear();
      renderInventory();
      refreshIcons();
    });
  });  const inventoryChipRow = document.querySelector("[data-inventory-chips]");
  if (inventoryChipRow) {
    const syncInventoryChips = () => {
      const activeStatus = $("#ticketStatusFilter").value || "all";
      inventoryChipRow.querySelectorAll("[data-status-chip]").forEach((button) => {
        button.classList.toggle("active", button.dataset.statusChip === activeStatus);
      });
    };
    inventoryChipRow.addEventListener("click", (event) => {
      const button = event.target.closest("[data-status-chip]");
      if (!button) return;
      $("#ticketStatusFilter").value = button.dataset.statusChip;
      selectedTickets.clear();
      renderInventory();
      syncInventoryChips();
      refreshIcons();
    });
    $("#ticketStatusFilter").addEventListener("change", syncInventoryChips);
    syncInventoryChips();
  }
  $("#selectAllTickets").addEventListener("change", (event) => {
    $$("[data-select-ticket]").forEach((input) => {
      if (event.target.checked) selectedTickets.add(input.dataset.selectTicket);
      else selectedTickets.delete(input.dataset.selectTicket);
    });
    renderInventory();
    refreshIcons();
  });
  $("#bulkShareBtn").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await shareSelectedTickets(event.currentTarget);
    } finally {
      event.currentTarget.disabled = false;
    }
  });
  $("#bulkSaleBtn").addEventListener("click", openBulkSaleModal);
  $("#bulkSaleForm").addEventListener("submit", saveBulkSale);
  $("#bulkAvailableBtn").addEventListener("click", () => {
    const selected = state.tickets.filter((ticket) => selectedTickets.has(ticket.id));
    const assignedCount = selected.filter((ticket) => (
      ticket.buyerName || ticket.buyerPhone || ticket.paymentStatus !== "pending" || ticket.status !== "available"
    )).length;
    const warning = assignedCount
      ? `${assignedCount} entradas tienen comprador, pago o un estado asignado. Al liberarlas se borraran esos datos.`
      : `${selected.length} entradas quedaran disponibles.`;
    showConfirm("Liberar entradas seleccionadas", warning, () => {
      selected.forEach((ticket) => {
        ticket.status = "available";
        ticket.paymentStatus = "pending";
        ticket.paymentMethod = "";
        ticket.buyerName = "";
        ticket.buyerPhone = "";
        ticket.buyerDocument = "";
        ticket.salePrice = 0;
        ticket.sharedAt = null;
        ticket.updatedAt = Date.now();
      });
      selectedTickets.clear();
      saveState();
      renderAll();
      showToast("Entradas liberadas.");
    }, "Liberar entradas");
  });
  $("#bulkDeleteBtn").addEventListener("click", () => {
    showConfirm("Eliminar entradas seleccionadas", `${selectedTickets.size} entradas iran a la papelera.`, () => {
      state.tickets.filter((ticket) => selectedTickets.has(ticket.id)).forEach((ticket) => {
        ticket.deletedAt = Date.now();
        state.trash.push({ id: ticket.id, type: "ticket", label: ticket.internalCode, deletedAt: ticket.deletedAt });
      });
      selectedTickets.clear();
      saveState();
      renderAll();
      showToast("Entradas movidas a la papelera.");
    }, "Eliminar");
  });

  ["clientSearch", "clientStageFilter", "clientEventFilter"].forEach((id) => {
    $(`#${id}`)?.addEventListener(id === "clientSearch" ? "input" : "change", renderClients);
  });
  $("#newClientBtn")?.addEventListener("click", () => openClientModal());
  $("#clientForm")?.addEventListener("submit", saveClient);
  $("#clientWhatsAppBtn")?.addEventListener("click", () => openClientWhatsApp($("#clientId").value));
  $("#deleteClientBtn")?.addEventListener("click", () => deleteClient($("#clientId").value));
  $("#importTicketClientsBtn")?.addEventListener("click", importTicketClients);
  $("#ticketForm").addEventListener("submit", saveTicket);
  $("#previewTicketBtn").addEventListener("click", () => {
    const ticket = state.tickets.find((item) => item.id === $("#editingTicketId").value);
    if (ticket) openTicketFile(ticket);
  });
  $("#downloadTicketBtn").addEventListener("click", () => {
    const ticket = state.tickets.find((item) => item.id === $("#editingTicketId").value);
    if (ticket) openTicketFile(ticket, "download");
  });
  $("#shareTicketBtn").addEventListener("click", (event) => shareTicket($("#editingTicketId").value, event.currentTarget));
  $("#whatsappTicketBtn").addEventListener("click", () => openWhatsApp($("#editingTicketId").value));
  $("#deleteTicketBtn").addEventListener("click", () => deleteTicket($("#editingTicketId").value));

  $("#confirmCancelBtn").addEventListener("click", () => { pendingConfirm = null; $("#confirmModal").close(); });
  $("#confirmAcceptBtn").addEventListener("click", async () => {
    const action = pendingConfirm;
    pendingConfirm = null;
    $("#confirmModal").close();
    if (action) await action();
  });
  $("#emptyTrashBtn").addEventListener("click", () => {
    if (!state.trash.length) return showToast("La papelera ya esta vacia.");
    showConfirm("Vaciar papelera", "Todos los elementos y archivos asociados se eliminaran definitivamente.", async () => {
      const button = $("#emptyTrashBtn");
      button.disabled = true;
      button.innerHTML = `<i data-lucide="loader-circle"></i>Vaciando...`;
      button.classList.add("is-loading");
      refreshIcons();
      try {
        await emptyTrash();
      } catch (error) {
        console.error("No se pudo vaciar la papelera:", error);
        showToast(`No se pudo vaciar la papelera: ${error.message}`, "error");
      } finally {
        button.disabled = false;
        button.innerHTML = `<i data-lucide="trash-2"></i>Vaciar papelera`;
        button.classList.remove("is-loading");
        refreshIcons();
      }
    }, "Vaciar definitivamente");
  });

  $("#exportBtn").addEventListener("click", exportBackup);
  $("#feedbackForm")?.addEventListener("submit", submitFeedback);
  $("#logoutBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i><span>Cerrando...</span>`;
    refreshIcons();
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    location.replace("/login.html");
  });
  $("#importInput").addEventListener("change", (event) => {
    if (event.target.files[0]) importBackup(event.target.files[0]);
    event.target.value = "";
  });
  $("#menuBtn").addEventListener("click", () => {
    const sidebar = $("#sidebar");
    const backdrop = $("#sidebarBackdrop");
    const willOpen = !sidebar.classList.contains("open");
    document.body.classList.toggle("menu-open", willOpen);
    sidebar.classList.toggle("open", willOpen);
    backdrop.classList.toggle("open", willOpen);
  });
  $("#sidebarBackdrop").addEventListener("click", closeMobileMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileMenu();
  });
  $("#pdfEventId").addEventListener("change", updateGeneratorPreview);
  $("#provisionalPdfForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedEvent = state.events.find((item) => item.id === $("#pdfEventId").value && !item.deletedAt);
    if (!selectedEvent) return showToast("Selecciona un evento disponible.", "error");
    const button = $("#generateStandalonePdfBtn");
    button.disabled = true;
    try {
      await generateStandaloneProvisionalPdf();
    } finally {
      button.disabled = false;
    }
  });
  $("#generateStandaloneOfficialPdfBtn").addEventListener("click", async () => {
    const selectedEvent = state.events.find((item) => item.id === $("#pdfEventId").value && !item.deletedAt);
    if (!selectedEvent) return showToast("Selecciona un evento disponible.", "error");
    const officialButton = $("#generateStandaloneOfficialPdfBtn");
    await generateStandaloneOfficialPdf(officialButton);
  });
}


async function init() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  bindEvents();
  if (CLOUD_MODE) {
    try {
      await loadCurrentUser();
      await loadCloudState();
      await loadFeedbackEntries();
      $("#storageModeTitle").textContent = "Nube activa";
      $("#storageModeCopy").textContent = "Sincronizado con Cloudflare";
    } catch (error) {
      console.error("No se pudo cargar Cloudflare:", error);
      $("#storageModeTitle").textContent = "Nube sin conexion";
      $("#storageModeCopy").textContent = "Cambios guardados solo en este dispositivo";
      showToast(`No se pudo cargar la nube: ${error.message}`, "error");
    }
  } else {
    seedDemoData();
  }
  renderAll();
  await window.FestholicLoader?.ready?.();
  dismissStartupLoader();
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      const controllerVersion = navigator.serviceWorker.controller?.scriptURL || "current";
      const reloadKey = `iampromote-sw-reloaded:${controllerVersion}`;
      if (sessionStorage.getItem(reloadKey) === "1") return;
      sessionStorage.setItem(reloadKey, "1");
      location.reload();
    });
    navigator.serviceWorker.register("./sw.js?v=20260913221616", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {});
  }
}

window.addEventListener("DOMContentLoaded", init);












