const STORAGE_KEY = "iampromote_state_v1";
const UI_STATE_KEY = "nextfest_ui_state_v1";
const DB_NAME = "iampromote_files";
const DB_VERSION = 1;
const FILE_STORE = "files";
const IS_DEPLOYED_WORKER = location.hostname.endsWith("workers.dev");
const IS_CLOUD_DEV = ["127.0.0.1", "localhost"].includes(location.hostname) && location.port === "8787";
const IS_PRODUCTION_DOMAIN = ["festholic.com", "www.festholic.com"].includes(location.hostname);
const API_BASE = IS_DEPLOYED_WORKER || IS_CLOUD_DEV || IS_PRODUCTION_DOMAIN
  ? ""
  : "https://iampromote-api.keenscy10.workers.dev";
const CLOUD_MODE = IS_DEPLOYED_WORKER || IS_CLOUD_DEV || IS_PRODUCTION_DOMAIN;

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
  code: "ticket",
  list: "list-checks",
  reservation: "user-round-check",
};

const LEGAL_CONTENT = {
  privacy: {
    eyebrow: "Protección de datos",
    title: "Política de privacidad",
    html: `<p>Festholic utiliza los datos de la cuenta, eventos, clientes y entradas únicamente para operar el panel y prestar sus funciones.</p><h3>Información tratada</h3><p>Podemos procesar datos de identificación, contacto, ventas, pagos e inventario que el usuario registre voluntariamente.</p><h3>Uso y conservación</h3><p>La información se utiliza para gestionar eventos, entregar entradas, generar reportes y mantener la seguridad. Se conserva mientras la cuenta permanezca activa o sea necesaria para cumplir obligaciones aplicables.</p><h3>Control de tus datos</h3><p>El usuario puede solicitar acceso, corrección o eliminación mediante la sección Soporte. Festholic no vende información personal.</p>`,
  },
  terms: {
    eyebrow: "Condiciones del servicio",
    title: "Términos y condiciones",
    html: `<p>Al utilizar Festholic aceptas emplear la plataforma de forma legítima y mantener la seguridad de tu cuenta.</p><h3>Responsabilidad del usuario</h3><p>El promotor es responsable de la exactitud de los eventos, precios, compradores y entradas registradas, así como de contar con autorización para su tratamiento.</p><h3>Disponibilidad</h3><p>Trabajamos para mantener el servicio disponible y protegido, aunque pueden existir mantenimientos o interrupciones temporales.</p><h3>Uso prohibido</h3><p>No está permitido falsificar entradas, vulnerar accesos, distribuir contenido ilícito ni utilizar datos de compradores para finalidades no autorizadas.</p>`,
  },
  security: {
    eyebrow: "Confianza y protección",
    title: "Seguridad",
    html: `<p>Festholic aplica controles para proteger el acceso al panel y la información operativa.</p><h3>Buenas prácticas</h3><p>Utiliza una contraseña exclusiva, no compartas tu sesión y verifica los datos antes de enviar una entrada.</p><h3>Archivos y accesos</h3><p>Las entradas y documentos deben compartirse únicamente con el comprador correspondiente. Revoca accesos y reporta cualquier actividad sospechosa desde Soporte.</p><h3>Incidentes</h3><p>Si detectas una operación que no reconoces, cierra la sesión y comunícate inmediatamente con el equipo de Festholic.</p>`,
  },
};

const DEFAULT_DELIVERY_TEMPLATE = `🎟️ Entradas enviadas | {{evento}}

Hola, te comparto {{entrada}} para {{evento}}.

📌 {{operacion_titulo}}:
{{operaciones}}

{{archivo}}
{{acceso}}
⚠️ Importante:
{{responsabilidad}}

Gracias por tu compra y por la confianza 🙌

{{firma}}
¡Nos vemos en el evento! 🥳

—
Gestionado con Festholic
www.festholic.com`;

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
let dashboardCarouselTimer = null;
let dashboardCarouselPausedUntil = 0;
let startupLoaderTimer = null;
let promoterWorkspace = {};
let deliveryMessageTemplate = DEFAULT_DELIVERY_TEMPLATE;

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

function loadUiState() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_STATE_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function saveUiState() {
  localStorage.setItem(UI_STATE_KEY, JSON.stringify({
    view: currentView,
    selectedEventId: state.selectedEventId || null,
  }));
}

function restoreUiState() {
  const saved = loadUiState();
  const views = new Set(["dashboard", "events", "inventory", "clients", "messages", "generator", "feedback", "profile", "trash"]);
  if (views.has(saved.view)) currentView = saved.view;
  if (saved.selectedEventId && state.events.some((event) => event.id === saved.selectedEventId && !event.deletedAt)) {
    state.selectedEventId = saved.selectedEventId;
  } else if (saved.selectedEventId) {
    state.selectedEventId = null;
  }
}

function scheduleCloudSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncStateToCloud().catch((error) => {
    console.error("No se pudo sincronizar con la nube:", error);
    showToast(error?.message || "No se pudo sincronizar con la nube. Revisa tu conexion e intenta otra vez.", "error");
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
  unavailableTicketFiles.delete(ticket.id);
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
function getTicketClipboardPhone(tickets, fallbackText = "") {
  const list = Array.isArray(tickets) ? tickets : [tickets];
  const rawPhone = list
    .map((ticket) => (
      ticket?.buyerPhone ||
      ticket?.ownerPhone ||
      ticket?.clientPhone ||
      ticket?.phone ||
      ticket?.buyer_phone ||
      ticket?.client?.phone ||
      ""
    ))
    .find((value) => String(value || "").trim());
  return rawPhone ? formatPhoneForDisplay(rawPhone) : fallbackText;
}

async function copyShareClipboardForTickets(tickets, fallbackText = "") {
  const text = getTicketClipboardPhone(tickets, fallbackText);
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function getClientReservationInfo(client) {
  const tags = Array.isArray(client.tags) ? client.tags : [];
  const cleanTags = tags.map((tag) => String(tag || "").trim()).filter(Boolean);
  const priceSource = [...cleanTags, client.notes || ""].join(" ");
  const zoneQuantityMatch = cleanTags
    .map((tag) => tag.match(/^(\d+)\s*(?:ga|general|vip|box|preferencial|platinum)\b/i))
    .find(Boolean);
  const priceMatch = priceSource.match(/s\/?\s*(\d+(?:[.,]\d+)?)/i);
  const quantityMatch = priceSource.match(/cantidad\s*(\d+)/i)
    || priceSource.match(/cantidad(?:\s+de)?\s+(?:entradas|tickets|accesos)?\s*[:\-]?\s*(\d+)/i)
    || priceSource.match(/reserva\s*\d+\s*de\s*(\d+)/i)
    || priceSource.match(/(\d+)\s*(?:entradas|tickets|accesos)/i)
    || zoneQuantityMatch;
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
    quantity: Math.max(1, Number(client.quantity || quantityMatch?.[1] || 1)),
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

function getClientAssignedCount(client) {
  if (!client) return 0;
  const eventId = client.eventId || client.event_id || state.selectedEventId;
  const phone = normalizeComparablePhone(client.phone);
  const name = String(client.name || "").trim().toLowerCase();
  return getEventTickets(eventId).filter((ticket) => {
    const ticketPhone = normalizeComparablePhone(ticket.buyerPhone);
    const ticketName = String(ticket.buyerName || "").trim().toLowerCase();
    return (phone && ticketPhone === phone) || (name && ticketName === name);
  }).length;
}

function getEventReservationItems(eventId) {
  state.clients ||= [];
  let displayIndex = 0;
  return state.clients
    .filter((client) => client.eventId === eventId && !client.deletedAt)
    // Una reserva entregada no genera tarjeta si ya no tiene cupos pendientes.
    // Si todavía faltan accesos, debe seguir visible para poder asignarlos.
    .filter((client) => ["pending", "paid", "delivery"].includes(client.stage)
      || (client.stage === "delivered" && getReservationPendingSlots(client) > 0))
    .flatMap((client) => {
      const info = getClientReservationInfo(client);
      const assignedCount = getClientAssignedCount(client);
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
          status: client.stage === "pending" ? "reserved" : client.stage === "delivered" ? "delivered" : "delivery",
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

function shareWithTimeout(data, timeoutMs = 12000) {
  const sharePromise = navigator.share(data);
  // Algunos navegadores (especialmente escritorio/Opera) dejan pendiente
  // navigator.share cuando no pueden abrir la hoja nativa. Nunca bloquees
  // la interfaz de Festholic por esa promesa.
  return Promise.race([
    sharePromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("El panel de compartir no respondió.")), timeoutMs)),
  ]);
}

async function openNativeShare(data) {
  if (typeof navigator.share !== "function") {
    if (navigator.clipboard?.writeText) {
      try {
        await Promise.race([
          navigator.clipboard.writeText(data.text || ""),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Portapapeles no disponible")), 2500)),
        ]);
        return { attached: false, clipboard: true };
      } catch {
        // Continúa al fallback manual de shareTicket/shareSelectedTickets.
      }
    }
    throw new Error("Web Share API no disponible");
  }

  try {
    await shareWithTimeout(data);
    return { attached: Boolean(data.files?.length) };
  } catch (fileShareError) {
    if (fileShareError?.name === "AbortError") throw fileShareError;
    if (!data.files?.length) throw fileShareError;

    // Algunos navegadores moviles rechazan PDFs en canShare, pero si abren el selector con texto.
    await shareWithTimeout({ title: data.title, text: data.text });
    return { attached: false };
  }
}

function downloadSharedFiles(files = []) {
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name || "entrada";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
}

async function copyShareText(text) {
  try {
    await navigator.clipboard.writeText(text || "");
    return true;
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text || "";
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand("copy");
    helper.remove();
    return copied;
  }
}

function releaseShareUiForNativeSheet(triggerButton) {
  hideShareProgress();
  setShareButtonLoading(triggerButton, false);
}

let shareProgressAutoCloseTimer = null;

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
      <button class="share-progress-close" type="button" aria-label="Cerrar preparación">×</button>
      <span class="share-progress-spinner" aria-hidden="true"></span>
      <div>
        <p class="eyebrow">Compartir entrada</p>
        <h3>Preparando para compartir</h3>
        <span id="shareProgressMessage">En unos segundos se abrirán las opciones de tu celular.</span>
      </div>
    </div>
  `;
  overlay.querySelector(".share-progress-close")?.addEventListener("click", hideShareProgress);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) hideShareProgress();
  });
  document.body.append(overlay);
  return overlay;
}

function showShareProgress(message = "En unos segundos se abriran las opciones de tu celular.") {
  const overlay = ensureShareProgressOverlay();
  const messageBox = document.getElementById("shareProgressMessage");
  if (messageBox) messageBox.textContent = message;
  clearTimeout(shareProgressAutoCloseTimer);
  requestAnimationFrame(() => overlay.classList.add("is-visible"));
  shareProgressAutoCloseTimer = setTimeout(hideShareProgress, 2200);
}

function hideShareProgress() {
  clearTimeout(shareProgressAutoCloseTimer);
  shareProgressAutoCloseTimer = null;
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
  clearTimeout(startupLoaderTimer);
  requestAnimationFrame(() => {
    loader.classList.remove("is-visible");
    loader.classList.add("is-hidden");
    setTimeout(() => loader.remove(), 320);
  });
}

function scheduleStartupLoader() {
  const loader = $("#startupLoader");
  if (!loader) return;
  startupLoaderTimer = setTimeout(() => {
    loader.classList.add("is-visible");
  }, 450);
}

async function loadCurrentUser() {
  const response = await apiFetch("/api/auth/session");
  const result = await response.json();
  currentUser = result.user || null;
  const adminLink = $("#adminNavLink");
  if (adminLink) adminLink.hidden = currentUser?.role !== "owner";
}

async function loadPromoterWorkspace() {
  const response = await apiFetch("/api/workspaces/promoter", { cache: "no-store" });
  const result = await response.json();
  promoterWorkspace = result.data && typeof result.data === "object" ? result.data : {};
  deliveryMessageTemplate = String(promoterWorkspace.deliveryMessageTemplate || DEFAULT_DELIVERY_TEMPLATE);
}

async function saveDeliveryMessageTemplate(event) {
  event.preventDefault();
  const textarea = $("#deliveryMessageTemplate");
  const button = event.submitter;
  const template = textarea.value.trim();
  if (template.length < 30) return showToast("El mensaje debe tener al menos 30 caracteres.", "error");
  if (template.length > 5000) return showToast("El mensaje es demasiado largo.", "error");
  if (button) button.disabled = true;
  try {
    promoterWorkspace = { ...promoterWorkspace, deliveryMessageTemplate: template };
    await apiFetch("/api/workspaces/promoter", { method: "PUT", body: JSON.stringify({ data: promoterWorkspace }) });
    deliveryMessageTemplate = template;
    textarea.dataset.dirty = "false";
    showToast("Mensaje de entrega actualizado.");
  } catch (error) {
    showToast(error.message || "No se pudo guardar el mensaje.", "error");
  } finally {
    if (button) button.disabled = false;
  }
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
  saveUiState();
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
    generator: ["Servicio Plus", "Generador de entradas"],
    feedback: ["Tu opinion", "Enviar feedback"],
    profile: ["Cuenta", "Mi perfil"],
    trash: ["Recuperacion", "Papelera"],
  };
  $("#viewEyebrow").textContent = copy[view]?.[0] || "Panel";
  $("#viewTitle").textContent = copy[view]?.[1] || "Festholic";
  closeMobileMenu();
  renderAll();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function renderAll() {
  const avatar = $("#userAvatar");
  const avatarInitials = $("#userAvatarInitials");
  if (avatar && avatarInitials) {
    const identity = currentUser?.name || currentUser?.email || "Festholic";
    avatarInitials.textContent = currentUser?.avatarUrl ? "" : getInitials(identity);
    avatar.style.backgroundImage = currentUser?.avatarUrl ? `url("${currentUser.avatarUrl}")` : "";
    avatar.style.backgroundSize = currentUser?.avatarUrl ? "cover" : "";
    avatar.style.backgroundPosition = currentUser?.avatarUrl ? "center" : "";
    avatar.title = currentUser?.name || currentUser?.email || "Usuario activo";
    avatar.setAttribute("aria-label", avatar.title);
  }
  const displayName = String(currentUser?.name || currentUser?.email?.split("@")[0] || "usuario").trim().split(/\s+/)[0];
  if ($("#dashboardUserName")) $("#dashboardUserName").textContent = displayName;
  renderPromoterProfile();
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

function renderPromoterProfile() {
  const identity = currentUser?.name || currentUser?.email || "Festholic";
  const avatar = $("#promoterProfileAvatar");
  if (!avatar) return;
  avatar.textContent = currentUser?.avatarUrl ? "" : getInitials(identity);
  avatar.style.backgroundImage = currentUser?.avatarUrl ? `url("${currentUser.avatarUrl}")` : "";
  avatar.style.backgroundSize = currentUser?.avatarUrl ? "cover" : "";
  avatar.style.backgroundPosition = currentUser?.avatarUrl ? "center" : "";
  $("#promoterProfileName").textContent = currentUser?.name || "Festholic";
  $("#promoterProfileEmail").textContent = currentUser?.email || "Tu espacio de promotor";
  $("#promoterProfileNameInput").value = currentUser?.name || "";
  $("#promoterProfileEmailInput").value = currentUser?.pendingEmail || currentUser?.email || "";
  const pending = $("#promoterProfilePending");
  pending.hidden = !currentUser?.pendingEmail;
  pending.textContent = currentUser?.pendingEmail ? `Correo pendiente de confirmar: ${currentUser.pendingEmail}` : "";
  $("#promoterProfileEvents").textContent = state.events.filter((item) => !item.deletedAt).length;
  $("#promoterProfileTickets").textContent = state.tickets.filter((item) => !item.deletedAt).length;
  $("#promoterProfileClients").textContent = state.clients.filter((item) => !item.deletedAt).length;
  $("#promoterProfileNotifications").checked = localStorage.getItem("festholic-promoter-notifications") !== "false";
  const templateField = $("#deliveryMessageTemplate");
  if (templateField && templateField.dataset.dirty !== "true") templateField.value = deliveryMessageTemplate;
}

async function savePromoterProfile(event) {
  event.preventDefault();
  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    const response = await apiFetch("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ name: $("#promoterProfileNameInput").value.trim(), email: $("#promoterProfileEmailInput").value.trim() }),
    });
    const result = await response.json();
    currentUser = { ...currentUser, ...result.user };
    localStorage.setItem("festholic-promoter-notifications", String($("#promoterProfileNotifications").checked));
    renderAll();
    showToast(currentUser.pendingEmail ? "Perfil guardado · correo pendiente de confirmar" : "Perfil actualizado");
  } catch (error) {
    showToast(error.message || "No se pudo actualizar el perfil", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function getReservationPendingSlots(client) {
  if (!client) return 0;
  const info = getClientReservationInfo(client);
  const assignedCount = getClientAssignedCount(client);
  return Math.max(0, (info.quantity || 1) - assignedCount);
}

function revenueMiniChartHtml() {
  const payments = state.tickets
    .filter((ticket) => !ticket.deletedAt && ticket.paymentStatus === "paid")
    .sort((left, right) => Number(left.updatedAt || left.createdAt || 0) - Number(right.updatedAt || right.createdAt || 0))
    .slice(-7)
    .map((ticket) => Number(ticket.salePrice || ticket.basePrice || 0));
  const values = [...Array(Math.max(0, 7 - payments.length)).fill(0), ...payments];
  const maximum = Math.max(...values, 1);
  const bars = values.map((value, index) => {
    const height = value > 0 ? Math.max(18, Math.round((value / maximum) * 100)) : 8;
    return `<span style="--revenue-bar:${height}%" title="${value ? formatMoney(value) : "Sin pago"}" aria-label="Movimiento ${index + 1}: ${value ? formatMoney(value) : "sin pago"}"></span>`;
  }).join("");
  return `<div class="revenue-mini-chart" role="img" aria-label="Ultimos pagos registrados"><div class="revenue-bars">${bars}</div><small>Últimos pagos</small></div>`;
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
      ${tone === "red" ? revenueMiniChartHtml() : ""}
    </article>`).join("");

  const active = state.events
    .filter((event) => !event.deletedAt && event.status === "active")
    .map((event) => ({ event, revenue: getEventStats(event.id).revenue }))
    .sort((left, right) => (right.revenue - left.revenue) || compareEventsByUpcoming(left.event, right.event))
    .slice(0, 4)
    .map(({ event }) => event);
  $("#dashboardEvents").innerHTML = active.length ? active.map(eventCardHtml).join("") : emptyInline("Aun no hay eventos activos.");
  setupDashboardCarouselAutoplay();

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

function setupDashboardCarouselAutoplay() {
  const carousel = $("#dashboardEvents");
  if (!carousel) return;

  if (!carousel.dataset.autoplayReady) {
    carousel.dataset.autoplayReady = "true";
    const pause = (milliseconds = 6500) => {
      dashboardCarouselPausedUntil = Date.now() + milliseconds;
    };
    carousel.addEventListener("pointerdown", () => pause());
    carousel.addEventListener("pointerup", () => pause(4500));
    carousel.addEventListener("pointercancel", () => pause(4500));
    carousel.addEventListener("wheel", () => pause(), { passive: true });
  }

  if (dashboardCarouselTimer) return;
  dashboardCarouselTimer = window.setInterval(() => {
    if (currentView !== "dashboard" || document.hidden || Date.now() < dashboardCarouselPausedUntil) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cards = [...carousel.querySelectorAll(":scope > .event-card")];
    if (cards.length < 2 || carousel.scrollWidth <= carousel.clientWidth + 2) return;

    const carouselLeft = carousel.getBoundingClientRect().left;
    const positions = cards.map((card) => carousel.scrollLeft + card.getBoundingClientRect().left - carouselLeft);
    const currentIndex = positions.reduce((closest, position, index) => (
      Math.abs(position - carousel.scrollLeft) < Math.abs(positions[closest] - carousel.scrollLeft) ? index : closest
    ), 0);
    const nextIndex = (currentIndex + 1) % cards.length;
    carousel.scrollTo({ left: positions[nextIndex], behavior: "smooth" });
  }, 4200);
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
    <article class="event-card" data-event-card="${event.id}" role="button" tabindex="0" aria-label="Abrir inventario de ${escapeHtml(event.name)}">
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
  saveUiState();
  selectedTickets.clear();
  setView("inventory");
}

function renderInventory() {
  const event = state.events.find((item) => item.id === state.selectedEventId && !item.deletedAt);
  document.body.classList.toggle("inventory-no-selection", !event);
  $("#inventoryEmpty").hidden = Boolean(event);
  $("#inventoryWorkspace").hidden = !event;
  const eventChoices = $("#inventoryEventChoices");
  if (eventChoices) {
    const availableEvents = getOrderedEvents(state.events.filter((item) => !item.deletedAt)).slice(0, 4);
    eventChoices.innerHTML = availableEvents.length ? availableEvents.map((item) => {
      const stats = getEventStats(item.id);
      const cover = item.image ? `<img src="${item.image}" alt="" />` : `<i data-lucide="calendar-days"></i>`;
      return `<button class="inventory-event-choice" data-open-event="${item.id}">
        <span class="inventory-event-choice__cover">${cover}</span>
        <span class="inventory-event-choice__copy"><strong>${escapeHtml(item.name)}</strong><small>${formatDate(item.date)} · ${stats.available} disponibles</small></span>
        <i data-lucide="arrow-right"></i>
      </button>`;
    }).join("") : `<div class="inventory-no-events"><strong>Aún no tienes eventos</strong><span>Crea el primero para comenzar a gestionar entradas.</span></div>`;
  }
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
      && (statusFilter === "all" || ticket.status === statusFilter || (statusFilter === "sold" && ticket.status === "delivered"))
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
  prefetchTicketFiles(tickets);
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
    <tr class="ticket-reservation-row ${selectedTickets.has(item.id) ? "ticket-selected" : ""}">
      <td><input type="checkbox" data-select-ticket="${item.id}" ${selectedTickets.has(item.id) ? "checked" : ""} aria-label="Seleccionar ${escapeHtml(item.internalCode)}" /></td>
      <td><button class="ticket-name reservation-ticket-name" data-open-client="${item.id}" data-open-client-phone="${escapeHtml(item.buyerPhone || item.client?.phone || "")}">
        <span class="ticket-type-icon"><i data-lucide="${FORMAT_ICONS.reservation}"></i></span>
        <div><strong>${escapeHtml(item.internalCode)}</strong><span>${item.reservationTotal > 1 ? `Acceso ${item.reservationIndex} de ${item.reservationTotal} sin PDF` : "Reserva sin PDF asignado"}</span></div>
      </button></td>
      <td>${FORMAT_LABELS.reservation}</td>
      <td>${escapeHtml(item.zone)}</td>
      <td>${formatMoney(item.salePrice || item.basePrice)}</td>
      <td><span class="status-pill status-${item.status}">${STATUS[item.status]}</span></td>
      <td><div class="buyer-cell"><strong>${escapeHtml(owner)}</strong><span>${escapeHtml(item.buyerName && item.buyerPhone ? item.buyerName : "-")}</span></div></td>
      <td><div class="payment-cell">${item.paymentMethod ? `<span class="payment-method-chip">${paymentMethodLogoHtml(item.paymentMethod)}${escapeHtml(item.paymentMethod)}</span>` : ""}<strong class="payment-${item.paymentStatus}">${PAYMENT_STATUS[item.paymentStatus]}</strong></div></td>
      <td><div class="row-actions">
        <button class="row-action row-action-labeled" data-open-client="${item.id}" data-open-client-phone="${escapeHtml(item.buyerPhone || item.client?.phone || "")}" title="Gestionar reserva"><i data-lucide="pencil"></i><span>Gestionar</span></button>
        <button class="row-action row-action-labeled" data-upload-for-reservation="${item.id}" title="Subir entrada para esta reserva"><i data-lucide="upload"></i><span>Subir entrada</span></button>
        <button class="row-action row-action-labeled" data-delete-reservation="${item.id}" title="Eliminar reserva"><i data-lucide="trash-2"></i><span>Eliminar</span></button>
      </div></td>
    </tr>`;
}

function reservationMobileHtml(item) {
  const owner = item.buyerPhone ? formatPhoneForDisplay(item.buyerPhone) : item.buyerName || "Sin asignar";
  return `
    <article class="ticket-mobile-card ticket-reservation-card status-${item.status} ${selectedTickets.has(item.id) ? "ticket-selected" : ""}">
      <div class="ticket-mobile-head">
        <input type="checkbox" data-select-ticket="${item.id}" ${selectedTickets.has(item.id) ? "checked" : ""} aria-label="Seleccionar ${escapeHtml(item.internalCode)}" />
        <span class="reservation-dot" title="Reserva por entregar"></span>
        <span class="ticket-type-icon"><i data-lucide="${FORMAT_ICONS.reservation}"></i></span>
        <div class="ticket-mobile-main"><strong>${escapeHtml(item.internalCode)}</strong><span>${FORMAT_LABELS.reservation} - ${escapeHtml(item.zone)}${item.reservationTotal > 1 ? ` - ${item.reservationIndex}/${item.reservationTotal}` : ""}</span></div>
        <div class="ticket-mobile-status"><span class="status-pill status-${item.status}">${STATUS[item.status]}</span></div>
      </div>
      <div class="ticket-mobile-grid">
        <div class="ticket-mobile-field"><span>Dueño</span><strong>${escapeHtml(owner)}</strong></div>
        <div class="ticket-mobile-field"><span>Monto</span><strong>${formatMoney(item.salePrice || item.basePrice)}</strong></div>
        <div class="ticket-mobile-field"><span>Pago</span><strong class="payment-${item.paymentStatus}">${PAYMENT_STATUS[item.paymentStatus]}</strong></div>
        <div class="ticket-mobile-field"><span>Tipo</span><strong>${escapeHtml(item.zone)}</strong></div>
      </div>
      <div class="ticket-mobile-actions">
        <button class="secondary-btn small" data-open-client="${item.id}" data-open-client-phone="${escapeHtml(item.buyerPhone || item.client?.phone || "")}"><i data-lucide="pencil"></i>Gestionar</button>
        <button class="secondary-btn small" data-upload-for-reservation="${item.id}"><i data-lucide="upload"></i>Subir entrada</button>
        <button class="danger-btn small" data-delete-reservation="${item.id}"><i data-lucide="trash-2"></i>Eliminar</button>
      </div>
    </article>`;
}

function ticketRowHtml(ticket) {
  const primaryLabel = ticket.zone || ticket.internalCode;
  const fileLabel = ticket.fileName ? escapeHtml(ticket.fileName) : FORMAT_LABELS[ticket.format];
  const idLabel = `ID: ${escapeHtml(shortId(ticket.id))}`;
  return `
    <tr class="${ticket.sharedAt ? "ticket-shared" : ""} ${selectedTickets.has(ticket.id) ? "ticket-selected" : ""}">
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
    <article class="ticket-mobile-card status-${ticket.status} ${ticket.sharedAt ? "ticket-shared" : ""} ${selectedTickets.has(ticket.id) ? "ticket-selected" : ""}">
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
        <button class="secondary-btn small" data-share-ticket="${ticket.id}"><i data-lucide="send"></i>Compartir</button>
      </div>
    </article>`;
}

function updateBulkBar() {
  const bulkBar = $("#bulkBar");
  if (bulkBar) {
    const hasSelection = selectedTickets.size >= 2;
    bulkBar.hidden = !hasSelection;
    bulkBar.classList.toggle("has-selection", hasSelection);
    bulkBar.classList.toggle("is-empty", !hasSelection);
    bulkBar.setAttribute("aria-hidden", hasSelection ? "false" : "true");
  }
  const selectedCountEl = $("#selectedCount");
  if (selectedCountEl) selectedCountEl.textContent = selectedTickets.size;
  $("#bulkShareBtn").hidden = selectedTickets.size < 2;
  const visibleIds = $$("[data-select-ticket]").map((input) => input.dataset.selectTicket);
  $("#selectAllTickets").checked = visibleIds.length > 0 && visibleIds.every((id) => selectedTickets.has(id));
  requestAnimationFrame(updateBulkFloatingBar);
}

function updateBulkFloatingBar() {
  const floating = $("#bulkFloatingBar");
  const bulkBar = $("#bulkBar");
  if (!floating || !bulkBar) return;
  const eligible = currentView === "inventory" && selectedTickets.size >= 2 && window.innerWidth <= 760;
  if (!eligible) {
    floating.hidden = true;
    return;
  }
  const rect = bulkBar.getBoundingClientRect();
  const originalVisible = rect.bottom > 0 && rect.top < window.innerHeight;
  const wasHidden = floating.hidden;
  floating.hidden = originalVisible;
  const floatingCount = $("#floatingSelectedCount");
  if (floatingCount) floatingCount.textContent = selectedTickets.size;
  if (wasHidden && !floating.hidden) refreshIcons();
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
    ["Clientes", activeClients.length, "users-round", "clients"],
    ["Reservas", pendingCount, "bookmark-check", "reservations"],
    ["Pagados", paidCount, "circle-dollar-sign", "paid"],
    ["Por entregar", activeClients.filter((client) => client.stage === "delivery").length, "send", "delivery"],
  ].map(([label, value, icon, tone]) => `<article class="client-metric client-metric--${tone}"><span>${label}</span><strong>${value}</strong><i data-lucide="${icon}"></i></article>`).join("");

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
  return String(text || "MF").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "MF";
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
  $("#clientQuantity").value = getClientReservationInfo(client || {}).quantity;
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
  const quantity = Math.max(1, Math.min(500, Number($("#clientQuantity").value) || 1));
  const tags = $("#clientTags").value.split(",").map((tag) => tag.trim()).filter(Boolean)
    .filter((tag) => !/^cantidad(?:\s+de\s+(?:entradas|tickets|accesos)?)?\s*[:\-]?\s*\d+$/i.test(tag));
  if (quantity > 1) tags.push(`Cantidad ${quantity}`);
  const now = Date.now();
  const client = {
    ...(existing || {}),
    id,
    phone,
    name: $("#clientName").value.trim(),
    document: $("#clientDocument").value.trim(),
    eventId: $("#clientEventId").value || null,
    stage: $("#clientStage").value,
    tags,
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
    if (CLOUD_MODE && cloudReady) {
      syncStateToCloud().catch((error) => console.error("No se pudo sincronizar la eliminación:", error));
    }
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
  const buyerDocument = $("#pdfBuyerDocument").value.trim();
  const buyerPhone = $("#pdfBuyerPhone").value.trim();
  const paymentStatus = $("#pdfPaymentStatus").value;
  const companyLogoFile = $("#pdfCompanyLogo")?.files?.[0];
  const companyLogo = companyLogoFile ? await readFileAsDataUrl(companyLogoFile) : "";
  const templateData = {
    category: $("#pdfCategory")?.value || "CORTESÍA",
    row: $("#pdfRow")?.value.trim() || "",
    seat: $("#pdfSeat")?.value.trim() || "",
    producer: $("#pdfProducer")?.value.trim() || "FESTHOLIC",
    ruc: $("#pdfRuc")?.value.trim() || "",
    primaryColor: $("#pdfColor")?.value || "#42149b",
    legalText: $("#pdfLegal")?.value.trim() || "",
    companyLogo,
  };
  const operationRoot = `ENT-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

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
        buyerDocument,
        buyerPhone,
        ...templateData,
      };
      const { blob, fileName } = await buildOfficialTicketPdfBlob(ticketLike, event);
      files.push(new File([blob], fileName, { type: "application/pdf" }));
    }

    const message = withFestholicFooter(`Te envio tu entrada para ${event.name}. Zona: ${zone || "General"}. Operación: ${operationRoot}.`);
    const canShareFiles = navigator.share && (!navigator.canShare || navigator.canShare({ files }));
    if (canShareFiles) {
      try {
        await shareWithTimeout({ title: `Entrada - ${event.name}`, text: message, files });
        showToast("Entrada generada y compartida.");
        return;
      } catch (error) {
        if (error.name === "AbortError") {
          showToast("Compartir cancelado.", "error");
          return;
        }
        console.warn("No se abrio el panel de compartir PDF:", error);
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
    showToast(
      canShareFiles ? "Entrada generada y descargada." : "Este navegador no permite compartir el PDF directo; se descargo en su lugar.",
    );
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
  showToast("Selecciona un PDF, imagen o código para asignarlo a esta reserva.");
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

function readTicketCodes() {
  return $("#ticketCodes").value
    .split(/[\r\n,;]+/)
    .map((code) => code.trim())
    .filter(Boolean);
}

async function addTickets(event) {
  event.preventDefault();
  if (ticketUploadInProgress) return;

  const zone = $("#ticketZone").value.trim();
  const codeCount = readTicketCodes().length;
  if (!zone) return showToast("Ingresa una zona.", "error");
  if (uploadFormat === "file" && !queuedFiles.length) return showToast("Selecciona al menos un archivo.", "error");
  if (pendingReservationUploadClientId) {
    const reservationClient = state.clients?.find((client) => client.id === pendingReservationUploadClientId && !client.deletedAt);
    const remainingSlots = getReservationPendingSlots(reservationClient);
    const selectedCount = uploadFormat === "file" ? queuedFiles.length : uploadFormat === "code" ? codeCount : 0;

    if (!reservationClient) {
      return showToast("No encontramos la reserva seleccionada.", "error");
    }
    if (uploadFormat === "list") {
      return showToast("Para una reserva, asigna un PDF, imagen o código.", "error");
    }
    if (selectedCount < 1) {
      return showToast("Selecciona un PDF, imagen o código para asignarlo a esta reserva.", "error");
    }
    // Si se cargan más accesos que los cupos originales, la reserva se amplía
    // automáticamente durante la asignación para permitir clientes grupales.
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
    const codes = readTicketCodes();
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
  if (reservationClient && additions.length) {
    const info = getClientReservationInfo(reservationClient);
    const paymentStatus = reservationClient.stage === "pending" ? "pending" : "paid";
    const remainingBeforeAssign = getReservationPendingSlots(reservationClient);
    const assignedBeforeAssign = Math.max(0, info.quantity - remainingBeforeAssign);
    const expandedQuantity = Math.max(info.quantity, assignedBeforeAssign + additions.length);
    if (expandedQuantity > info.quantity) {
      reservationClient.tags = (Array.isArray(reservationClient.tags) ? reservationClient.tags : [])
        .filter((tag) => !/^cantidad(?:\s+de\s+(?:entradas|tickets|accesos)?)?\s*[:\-]?\s*\d+$/i.test(String(tag || "")));
      reservationClient.tags.push(`Cantidad ${expandedQuantity}`);
    }

    additions.forEach((ticket) => {
      ticket.buyerName = reservationClient.name || "";
      ticket.buyerPhone = reservationClient.phone || "";
      ticket.buyerDocument = reservationClient.document || reservationClient.dni || reservationClient.buyerDocument || "";
      ticket.zone = info.zone || ticket.zone;
      ticket.salePrice = info.price || ticket.basePrice;
      ticket.status = "sold";
      ticket.paymentStatus = paymentStatus;
      ticket.paymentMethod = ticket.paymentMethod || reservationClient.paymentMethod || "";
      ticket.notes = [ticket.notes, "Asignado desde reserva pendiente.", reservationClient.notes].filter(Boolean).join("\n");
    });

    const remainingAfterAssign = Math.max(0, remainingBeforeAssign - additions.length);
    reservationClient.stage = remainingAfterAssign === 0
      ? (paymentStatus === "paid" ? "delivery" : "pending")
      : reservationClient.stage;
    reservationClient.updatedAt = Date.now();
    reservationClient.interactions ||= [];
    const assignedAccessLabel = additions.length === 1
      ? (additions[0].format === "code" ? "Código asignado al inventario" : "Acceso asignado al inventario")
      : `${additions.length} accesos asignados al inventario`;
    reservationClient.interactions.unshift({
      id: uid("interaction"),
      text: `${assignedAccessLabel}: ${additions.map((ticket) => ticket.internalCode).join(", ")}`,
      createdAt: Date.now(),
    });
  }
  state.tickets.push(...additions);
  const eventRecord = state.events.find((item) => item.id === eventId);
  addActivity("ticket", "Entradas agregadas", `${additions.length} entradas en ${eventRecord?.name || "evento"}`);
  saveState();
  if (CLOUD_MODE && uploadFormat === "file") {
    try {
      // Primero registra las entradas en D1. El endpoint de archivos valida
      // que el ticket exista; si se sube antes, responde 404 y se pierde el
      // vínculo con el PDF. Se mantiene el flujo anterior, secuencial.
      setTicketUploadProgress(true, "Registrando entradas", "Preparando el inventario...", 35);
      await syncStateToCloud();
      setTicketUploadProgress(true, "Subiendo a la nube", `Guardando ${total} ${total === 1 ? "archivo" : "archivos"}...`, 40);
      for (let index = 0; index < additions.length; index += 1) {
        await uploadTicketFile(additions[index], queuedFiles[index]);
        saveState();
        setTicketUploadProgress(true, "Subiendo a la nube", `${index + 1} de ${additions.length} archivos completados`, 40 + ((index + 1) / additions.length) * 50);
      }
      saveState();
      setTicketUploadProgress(true, "Finalizando", "Actualizando el inventario...", 94);
      await syncStateToCloud();
    } catch {
      showToast("Las entradas se guardaron, pero algun archivo sigue pendiente de subir.", "error");
    }
  } else if (CLOUD_MODE) {
    setTicketUploadProgress(true, "Sincronizando", "Guardando los accesos en la nube...", 80);
    await syncStateToCloud();
  }
  setTicketUploadProgress(true, "Entradas listas!", `${additions.length} ${additions.length === 1 ? "entrada agregada" : "entradas agregadas"} al inventario.`, 100);
  await new Promise((resolve) => setTimeout(resolve, 450));
  $("#ticketUploadModal").close();
  pendingReservationUploadClientId = "";
  renderAll();
  showToast(reservationClient
    ? `${additions.length} ${additions.length === 1 ? "acceso asignado" : "accesos asignados"} a la reserva.`
    : `${additions.length} entradas agregadas al inventario.`);
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
  $("#editTicketCode").value = ticket.internalCode || "";
  $("#editTicketZone").value = ticket.zone || "";
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
  const internalCode = $("#editTicketCode").value.trim();
  const zone = $("#editTicketZone").value.trim();
  if (!internalCode || !zone) return showToast("Completa el nombre de la entrada y la zona.", "error");
  ticket.internalCode = internalCode;
  ticket.zone = zone;
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
  const firstBuyerName = tickets[0]?.buyerName || "";
  const firstBuyerPhone = tickets[0]?.buyerPhone || "";
  const sameBuyer = tickets.every((ticket) => (ticket.buyerName || "") === firstBuyerName
    && (ticket.buyerPhone || "") === firstBuyerPhone);

  $("#bulkSaleSummary").textContent = `${tickets.length} entradas para ${event?.name || "este evento"}: ${codesPreview}${extraCount}. Base total: ${formatMoney(baseTotal)}.`;
  $("#bulkTicketStatus").value = "sold";
  $("#bulkPaymentStatus").value = "paid";
  $("#bulkBuyerName").value = sameBuyer ? firstBuyerName : "";
  $("#bulkBuyerPhone").value = sameBuyer ? firstBuyerPhone : "";
  $("#bulkBuyerDocument").value = sameBuyer ? (tickets[0]?.buyerDocument || "") : "";
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

const ticketFileCache = new Map();
const unavailableTicketFiles = new Set();

async function getTicketFile(ticket, { forceRetry = false } = {}) {
  const cacheKey = ticket.id;
  if (ticketFileCache.has(cacheKey)) return ticketFileCache.get(cacheKey);
  if (forceRetry) unavailableTicketFiles.delete(cacheKey);
  if (unavailableTicketFiles.has(cacheKey)) return null;

  const local = await getFile(ticket.fileId);
  if (local) {
    ticketFileCache.set(cacheKey, local);
    return local;
  }
  // No dependas únicamente de objectKey: puede faltar en una copia local
  // antigua aunque el archivo siga guardado en R2. El endpoint valida al
  // usuario y resuelve el archivo por el ID de la entrada.
  try {
    const response = await apiFetch(`/api/files/${encodeURIComponent(ticket.id)}`);
    const blob = await response.blob();
    const record = {
      blob,
      name: ticket.fileName || "entrada",
      type: ticket.fileType || blob.type || "application/octet-stream",
    };
    ticketFileCache.set(cacheKey, record);
    return record;
  } catch (error) {
    // Solo recuerda los 404 reales. Un corte temporal de red no debe impedir
    // que el boton Compartir vuelva a intentarlo durante toda la sesion.
    if (/Archivo no encontrado/i.test(error?.message || "")) unavailableTicketFiles.add(cacheKey);
    else if (error?.message) console.warn("No se pudo recuperar el archivo de la entrada:", error);
    return null;
  }
}

async function attachMissingTicketFile(ticket, file) {
  if (!file) return null;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  const isImage = file.type.startsWith("image/");
  if (!isPdf && !isImage) throw new Error("Selecciona un archivo PDF o una imagen.");

  if (CLOUD_MODE) {
    await uploadTicketFile(ticket, file);
  } else {
    ticket.fileId = await putFile(file);
  }

  ticket.format = isPdf ? "pdf" : "image";
  ticket.fileName = file.name;
  ticket.fileType = file.type || (isPdf ? "application/pdf" : "image/jpeg");
  ticket.fileSize = file.size || 0;
  ticket.updatedAt = Date.now();
  const record = { blob: file, name: ticket.fileName, type: ticket.fileType };
  ticketFileCache.set(ticket.id, record);
  unavailableTicketFiles.delete(ticket.id);
  saveState();
  if (CLOUD_MODE) await syncStateToCloud();
  return record;
}

function requestMissingTicketFile(ticket, triggerButton = null) {
  showConfirm(
    "Volver a vincular el archivo",
    "El PDF de esta entrada no esta guardado en la nube. Seleccionalo nuevamente; Festholic lo vinculara a la entrada y continuara con Compartir.",
    () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/pdf,image/*";
      input.hidden = true;
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        setShareButtonLoading(triggerButton, true);
        showShareProgress("Guardando nuevamente el archivo de la entrada.");
        try {
          await attachMissingTicketFile(ticket, file);
          showToast("Archivo vinculado. Continuando con Compartir.");
          await shareTicket(ticket.id, triggerButton);
        } catch (error) {
          console.error("No se pudo vincular el archivo:", error);
          showToast(error?.message || "No se pudo vincular el archivo.", "error");
        } finally {
          hideShareProgress();
          setShareButtonLoading(triggerButton, false);
        }
      }, { once: true });
      input.addEventListener("cancel", () => input.remove(), { once: true });
      input.click();
    },
    "Seleccionar archivo",
  );
}

// Lee por adelantado los archivos de las entradas visibles, en cuanto se pintan en pantalla,
// para que al tocar "Compartir" el archivo ya este en memoria. En Chrome Android, una lectura
// async (IndexedDB/red) justo en el clic puede perder la "activacion de usuario" y el panel
// nativo de compartir no se abre ni siquiera con texto. Esto se corre en segundo plano, sin
// bloquear el render ni mostrar errores al usuario.
function prefetchTicketFiles(tickets) {
  tickets
    .filter((ticket) => (ticket.format === "pdf" || ticket.format === "image") && !ticketFileCache.has(ticket.id) && !unavailableTicketFiles.has(ticket.id))
    .forEach((ticket) => {
      getTicketFile(ticket).catch(() => {});
    });
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
  const attachment = fileTickets.length === 1
    ? "📎 Archivo adjunto:\nEncontrarás tu entrada en PDF con su código QR.\n"
    : fileTickets.length > 1
      ? "📎 Archivos adjuntos:\nEncontrarás tus entradas en PDF con sus códigos QR.\n"
      : "";
  const accessParts = [];
  if (codeTickets.length) {
    accessParts.push(`🔐 Código${codeTickets.length > 1 ? "s" : ""} de acceso:\n${codeTickets.map((ticket) => `• ${ticket.codeValue}`).join("\n")}\n\nCanjea tu código aquí:\nhttps://www.vastiontickets.com/canjear-codigo`);
  }
  if (listTickets.length) accessParts.push(`✅ ${listTickets.length === 1 ? "Tu acceso quedó registrado" : "Tus accesos quedaron registrados"} en lista.`);
  const values = {
    evento: eventName,
    entrada: count === 1 ? `tu entrada${zoneText}` : `tus ${count} entradas${zoneText}`,
    tipo: zones.join(", "),
    cantidad: String(count),
    cliente: tickets[0]?.buyerName || "",
    operacion_titulo: tickets.length > 1 ? "Nros. de operación" : "Nro. de operación",
    operaciones: operations,
    archivo: attachment,
    acceso: accessParts.length ? `${accessParts.join("\n\n")}\n` : "",
    responsabilidad: fileTickets.length || codeTickets.length
      ? `Guarda ${count > 1 ? "tus entradas" : "tu entrada"} y no ${count > 1 ? "las compartas" : "la compartas"} con terceros. Desde este momento ${count > 1 ? "quedan" : "queda"} bajo tu responsabilidad.`
      : "Conserva este mensaje como referencia de tu acceso.",
    firma: `${currentUser?.name || "Keen Sanchez"} | ${currentUser?.role === "owner" ? "Live Fest Perú" : "Festholic"}`,
  };
  return withFestholicFooter(String(deliveryMessageTemplate || DEFAULT_DELIVERY_TEMPLATE)
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => values[key.toLowerCase()] ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

async function markTicketsAsShared(tickets) {
  const sharedAt = Date.now();
  tickets.forEach((ticket) => {
    ticket.sharedAt = sharedAt;
    ticket.updatedAt = sharedAt;
  });
  saveState();
  renderAll();
  if (CLOUD_MODE) {
    syncStateToCloud().catch((error) => console.warn("No se pudo sincronizar el estado compartido:", error));
  }
}

async function shareTicket(ticketId, triggerButton = null) {
  const requestedId = String(ticketId || "");
  const ticket = state.tickets.find((item) => String(item.id) === requestedId && !item.deletedAt);
  if (!ticket) {
    showToast("No se encontró la entrada para compartir. Actualiza la lista e inténtalo de nuevo.", "error");
    return;
  }

  const event = state.events.find((item) => item.id === ticket.eventId);
  const text = buildDeliveryMessage([ticket], event);
  const files = [];
  showShareProgress("Estamos preparando la entrada y el mensaje para compartir.");
  setShareButtonLoading(triggerButton, true);

  try {
    let shareData = { title: event?.name || "Entrada", text };

    if (ticket.format === "pdf" || ticket.format === "image") {
      const record = await getTicketFile(ticket, { forceRetry: true });
      if (!record) {
        requestMissingTicketFile(ticket, triggerButton);
        return;
      }
      const file = new File([record.blob], record.name, { type: record.type });
      files.push(file);
      shareData = { ...shareData, files: [file] };
    }

    // Oculta el modal antes de abrir el panel del sistema: en movil puede quedarse abierto varios segundos.
    releaseShareUiForNativeSheet(triggerButton);
    const result = await openNativeShare(shareData);

    if (result.clipboard) {
      if (files.length) downloadSharedFiles(files);
      showToast(files.length ? "Entrada descargada y mensaje copiado para compartir." : "Mensaje copiado al portapapeles.");
      await markTicketsAsShared([ticket]);
      return;
    }
    if (!result.attached && files.length) {
      downloadSharedFiles(files);
      await copyShareText(text);
      await markTicketsAsShared([ticket]);
      showToast("El navegador no adjunta PDFs: entrada descargada y mensaje copiado.");
      return;
    }

    // Solo se marca como compartida cuando el panel nativo termina correctamente con el archivo.
    await markTicketsAsShared([ticket]);
    showToast("Entrada compartida.");
  } catch (error) {
    if (error?.name === "AbortError") {
      showToast("Compartir cancelado.", "error");
      return;
    }
    console.warn("No se pudo abrir el panel de compartir:", error);
    // En escritorio o navegadores sin Web Share, ofrece una copia manual del mensaje.
    try {
      if (files.length) downloadSharedFiles(files);
      const copied = await copyShareText(text);
      showToast(files.length
        ? "Entrada descargada y mensaje copiado para compartir."
        : copied ? "Mensaje copiado al portapapeles. Puedes pegarlo para compartir." : "No se pudo copiar el mensaje.",
        copied || files.length ? "success" : "error");
      if (copied || files.length) await markTicketsAsShared([ticket]);
    } catch {
      showToast("No se pudo abrir el panel de compartir.", "error");
    }
  } finally {
    hideShareProgress();
    setShareButtonLoading(triggerButton, false);
  }
}

async function shareSelectedTickets(triggerButton = null) {
  const tickets = state.tickets.filter((ticket) => selectedTickets.has(ticket.id) && !ticket.deletedAt);
  if (tickets.length < 2) return showToast("Selecciona al menos 2 entradas.", "error");

  const event = state.events.find((item) => item.id === tickets[0].eventId);
  const eventName = event?.name || "el evento";
  const text = buildDeliveryMessage(tickets, event);
  const files = [];

  showShareProgress("Estamos preparando las entradas seleccionadas para compartir.");
  setShareButtonLoading(triggerButton, true);

  try {
    const fileTickets = tickets.filter((item) => item.format === "pdf" || item.format === "image");
    const records = [];

    for (const ticket of fileTickets) {
      const record = await getTicketFile(ticket);
      if (!record) {
        showToast("Falta un archivo en las entradas seleccionadas. Vuelve a subirlo antes de compartir.", "error");
        return;
      }
      records.push(record);
    }

    files.push(...records.map((record) => new File([record.blob], record.name, { type: record.type })));
    const shareData = {
      title: `${tickets.length} entradas - ${eventName}`,
      text,
      ...(files.length ? { files } : {}),
    };

    releaseShareUiForNativeSheet(triggerButton);
    const result = await openNativeShare(shareData);

    if (result.clipboard) {
      if (files.length) downloadSharedFiles(files);
      await markTicketsAsShared(tickets);
      showToast(files.length ? "Entradas descargadas y mensaje copiado para compartir." : "Mensaje copiado al portapapeles.");
      return;
    }

    if (!result.attached && files.length) {
      downloadSharedFiles(files);
      await copyShareText(text);
      await markTicketsAsShared(tickets);
      showToast("El navegador no adjunta PDFs: entradas descargadas y mensaje copiado.");
      return;
    }

    await markTicketsAsShared(tickets);
    showToast("Entradas compartidas.");
  } catch (error) {
    if (error?.name === "AbortError") {
      showToast("Compartir cancelado.", "error");
      return;
    }
    console.warn("No se pudo abrir el panel de compartir las entradas:", error);
    // Respaldo para escritorio o navegadores que dejan pendiente el panel:
    // copia el mensaje completo y permite pegarlo en WhatsApp/Correo.
    try {
      if (files.length) downloadSharedFiles(files);
      const copied = await copyShareText(text);
      if (copied) {
        await markTicketsAsShared(tickets);
        showToast(files.length ? "Entradas descargadas y mensaje copiado para compartir." : "Mensaje copiado al portapapeles. Puedes pegarlo para compartir.");
      } else if (files.length) {
        await markTicketsAsShared(tickets);
        showToast("Entradas descargadas. Adjuntalas manualmente para compartir.");
      } else {
        showToast("No se pudo abrir el panel de compartir.", "error");
      }
    } catch {
      showToast("No se pudo abrir el panel de compartir.", "error");
    }
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
function splitNameForPdf(fullName) {
  const clean = formatPersonNameForPdf(fullName);
  if (!clean) return [];
  const words = clean.split(" ").filter(Boolean);
  if (words.length <= 2) return [clean];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

async function buildOfficialTicketPdfBlob(ticketLike, event) {
  const eventName = event?.name || "Evento";
  const { jsPDF } = window.jspdf;
  const outputWidth = 120;
  const outputHeight = 220;
  const pageWidth = 210;
  const pageHeight = 297;
  const documentPdf = new jsPDF({ unit: "mm", format: [outputWidth, outputHeight], orientation: "portrait" });
  const scaleX = outputWidth / pageWidth;
  const scaleY = outputHeight / pageHeight;
  const scaleFont = scaleX;
  const rawRect = documentPdf.rect.bind(documentPdf);
  const rawLine = documentPdf.line.bind(documentPdf);
  const rawTriangle = documentPdf.triangle.bind(documentPdf);
  const rawText = documentPdf.text.bind(documentPdf);
  const rawAddImage = documentPdf.addImage.bind(documentPdf);
  const rawSetFontSize = documentPdf.setFontSize.bind(documentPdf);
  const rawSetLineWidth = documentPdf.setLineWidth.bind(documentPdf);
  const rawSplitTextToSize = documentPdf.splitTextToSize.bind(documentPdf);
  documentPdf.rect = (x, y, width, height, ...args) => rawRect(x * scaleX, y * scaleY, width * scaleX, height * scaleY, ...args);
  documentPdf.line = (x1, y1, x2, y2, ...args) => rawLine(x1 * scaleX, y1 * scaleY, x2 * scaleX, y2 * scaleY, ...args);
  documentPdf.triangle = (x1, y1, x2, y2, x3, y3, ...args) => rawTriangle(x1 * scaleX, y1 * scaleY, x2 * scaleX, y2 * scaleY, x3 * scaleX, y3 * scaleY, ...args);
  documentPdf.text = (value, x, y, options = {}) => rawText(value, x * scaleX, y * scaleY, {
    ...options,
    ...(Number.isFinite(options?.maxWidth) ? { maxWidth: options.maxWidth * scaleX } : {}),
  });
  documentPdf.addImage = (image, format, x, y, width, height, ...args) => rawAddImage(image, format, x * scaleX, y * scaleY, width * scaleX, height * scaleY, ...args);
  documentPdf.setFontSize = (size) => rawSetFontSize(size * scaleFont);
  documentPdf.setLineWidth = (width) => rawSetLineWidth(width * scaleX);
  documentPdf.splitTextToSize = (value, maxWidth, options) => rawSplitTextToSize(value, maxWidth * scaleX, options);
  const hexToRgb = (hex, fallback = [66, 20, 155]) => {
    const clean = String(hex || "").replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;
    return [0, 2, 4].map((index) => Number.parseInt(clean.slice(index, index + 2), 16));
  };
  const PRIMARY = hexToRgb(ticketLike.primaryColor);
  const PINK = [255, 0, 85];
  const LIGHT = [246, 246, 247];
  const MUTED = [132, 128, 139];
  const DARK = [25, 22, 29];
  const ticketCode = String(ticketLike.internalCode || ticketLike.id || crypto.randomUUID()).toUpperCase();
  const numericCode = (ticketCode.replace(/\D/g, "") + Math.abs([...ticketCode].reduce((sum, char) => sum + char.charCodeAt(0), 0))).slice(-16).padStart(16, "0");
  const ticketNumber = numericCode.slice(-4).replace(/^0+/, "") || "1";
  const orderNumber = numericCode.slice(0, 8);
  const category = String(ticketLike.category || (Number(ticketLike.salePrice || ticketLike.basePrice || 0) > 0 ? "PAGADA" : "CORTESÍA")).toUpperCase();
  const dateLabel = event?.date
    ? new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "2-digit", month: "long" }).format(new Date(`${event.date}T12:00:00`))
    : "Fecha por confirmar";
  const dateText = `${dateLabel.charAt(0).toUpperCase()}${dateLabel.slice(1)}`;
  const year = event?.date ? new Date(`${event.date}T12:00:00`).getFullYear() : "";
  const timeLabel = event?.time || event?.hour || "Hora por confirmar";
  const price = Number(ticketLike.salePrice ?? ticketLike.basePrice ?? 0);
  let headerLogo = ticketLike.companyLogo || "";
  if (!headerLogo) {
    try {
      const logoBlob = await fetch("img/logo/festholic.png").then((response) => response.blob());
      headerLogo = await readFileAsDataUrl(logoBlob);
    } catch {}
  }
  const format = headerLogo?.startsWith("data:image/png") ? "PNG" : "JPEG";

  documentPdf.setFillColor(255, 255, 255);
  documentPdf.rect(0, 0, pageWidth, pageHeight, "F");
  documentPdf.setFillColor(0, 0, 0);
  documentPdf.rect(0, 0, pageWidth, 18, "F");
  if (headerLogo) {
    try { documentPdf.addImage(headerLogo, format, 89, 3, 32, 12, undefined, "FAST"); } catch {}
  } else {
    documentPdf.setTextColor(255, 255, 255);
    documentPdf.setFont("helvetica", "bold");
    documentPdf.setFontSize(18);
    documentPdf.text("FESTHOLIC", pageWidth / 2, 12, { align: "center" });
  }

  const heroTop = 18;
  const heroHeight = 59;
  const qrWidth = 52;
  documentPdf.setFillColor(...PRIMARY);
  documentPdf.rect(0, heroTop, pageWidth - qrWidth, heroHeight, "F");
  const K_DARK = PRIMARY.map((channel, index) => Math.max(0, channel - [18, 9, 30][index]));
  const K_LIGHT = PRIMARY.map((channel, index) => Math.min(255, channel + [10, 4, 18][index]));
  documentPdf.setFillColor(...K_DARK);
  documentPdf.rect(76, heroTop, 17, heroHeight, "F");
  documentPdf.triangle(93, heroTop + 29, 132, heroTop, 158, heroTop, "F");
  documentPdf.triangle(93, heroTop + 29, 132, heroTop + heroHeight, 158, heroTop + heroHeight, "F");
  documentPdf.setFillColor(...K_LIGHT);
  documentPdf.triangle(109, heroTop, 139, heroTop, 139, heroTop + 20, "F");
  documentPdf.setFillColor(255, 255, 255);
  documentPdf.rect(pageWidth - qrWidth, heroTop, qrWidth, heroHeight, "F");
  const officialCover = resolveOfficialTicketCover(event);
  if (officialCover) {
    try {
      const cover = await imageSourceToDataUrl(officialCover, 800, 800);
      documentPdf.addImage(cover, "JPEG", 20, heroTop + 8, 52, 43, undefined, "FAST");
    } catch {}
  }
  documentPdf.setFillColor(...PINK);
  documentPdf.rect(87, heroTop + 11, 1.8, 35, "F");
  documentPdf.setTextColor(255, 255, 255);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(10);
  documentPdf.text(dateText, 92, heroTop + 17);
  documentPdf.text(`${year}${year ? " / " : ""}${timeLabel}`, 92, heroTop + 24);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(9.5);
  const venueLines = documentPdf.splitTextToSize(String(event?.venue || "Lugar por confirmar").toUpperCase(), 61);
  documentPdf.text(venueLines, 92, heroTop + 36);

  const qrPayload = [
    "FESTHOLIC",
    "E-TICKET",
    `Evento: ${eventName}`,
    `Zona: ${ticketLike.zone || "General"}`,
    `Código: ${ticketCode}`,
    `ID: ${ticketLike.id}`,
  ].join("\n");
  const qrDataUrl = await window.QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 520, color: { dark: "#000000", light: "#ffffff" } });
  documentPdf.setTextColor(40, 40, 43);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(8);
  documentPdf.text(`N° ${ticketNumber}`, pageWidth - qrWidth / 2, heroTop + 7, { align: "center" });
  documentPdf.addImage(qrDataUrl, "PNG", pageWidth - 43, heroTop + 10, 34, 34);
  documentPdf.setFontSize(7.2);
  documentPdf.text(numericCode, pageWidth - qrWidth / 2, heroTop + 51, { align: "center" });
  const gradientStart = [112, 12, 156];
  const gradientSteps = 96;
  for (let step = 0; step < gradientSteps; step += 1) {
    const progress = step / (gradientSteps - 1);
    const color = gradientStart.map((channel, index) => Math.round(channel + (PINK[index] - channel) * progress));
    documentPdf.setFillColor(...color);
    documentPdf.rect((pageWidth / gradientSteps) * step, heroTop + heroHeight, (pageWidth / gradientSteps) + 0.15, 7, "F");
  }

  documentPdf.setTextColor(...PRIMARY);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(30);
  documentPdf.text("¡YA TIENES TU INVITACIÓN!", pageWidth / 2, 98, { align: "center" });
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(10.5);
  documentPdf.text("DISFRUTA DE LOS MEJORES ESPECTÁCULOS CON NOSOTROS", pageWidth / 2, 106, { align: "center" });

  documentPdf.setFillColor(...PRIMARY);
  documentPdf.rect(0, 112, pageWidth, 11, "F");
  documentPdf.setTextColor(255, 255, 255);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(8.5);
  documentPdf.text("SECTOR", 12, 119);
  documentPdf.text("FILA", 172, 119, { align: "center" });
  documentPdf.text("ASIENTO", 196, 119, { align: "center" });
  documentPdf.setFillColor(...LIGHT);
  documentPdf.rect(0, 123, pageWidth, 21, "F");
  documentPdf.setDrawColor(255, 255, 255);
  documentPdf.line(160, 112, 160, 144);
  documentPdf.line(184, 112, 184, 144);
  documentPdf.setTextColor(...PRIMARY);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(10.5);
  documentPdf.text(String(ticketLike.zone || "GENERAL").toUpperCase(), 12, 136);
  documentPdf.text(String(ticketLike.row || "-"), 172, 136, { align: "center" });
  documentPdf.text(String(ticketLike.seat || "-"), 196, 136, { align: "center" });

  documentPdf.setFillColor(239, 239, 241);
  documentPdf.rect(0, 144, pageWidth, 16, "F");
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(8.5);
  documentPdf.text("Categoría:", 12, 154);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.text(category, 39, 154);

  documentPdf.setTextColor(...PRIMARY);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(9.5);
  documentPdf.text("N° de orden:", 12, 172);
  documentPdf.setTextColor(...MUTED);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(11);
  documentPdf.text(orderNumber, 15, 181);
  documentPdf.setDrawColor(220, 220, 223);
  documentPdf.line(0, 188, pageWidth, 188);

  const detailRow = (label, value, y, maxWidth = 145) => {
    documentPdf.setTextColor(...PRIMARY);
    documentPdf.setFont("helvetica", "bold");
    documentPdf.setFontSize(9);
    documentPdf.text(label, 12, y);
    documentPdf.setTextColor(...MUTED);
    documentPdf.setFont("helvetica", "normal");
    documentPdf.setFontSize(8.5);
    documentPdf.text(documentPdf.splitTextToSize(String(value || "No registrado"), maxWidth), 38, y);
  };
  detailRow("Evento:", eventName, 201);
  detailRow("Produce:", ticketLike.producer || "FESTHOLIC", 214);
  detailRow("RUC:", ticketLike.ruc || "No registrado", 227, 65);
  documentPdf.setTextColor(...PRIMARY);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.text("Precio:", 122, 227);
  documentPdf.setTextColor(...MUTED);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.text(`S/ ${price.toFixed(2)}`, 156, 227);

  documentPdf.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(18);
  documentPdf.text(`${category} • ${category} • ${category}`, pageWidth / 2, 245, { align: "center" });
  documentPdf.setFontSize(5.5);
  documentPdf.setTextColor(182, 177, 188);
  documentPdf.text("PROHIBIDA SU VENTA • PROHIBIDA SU VENTA • PROHIBIDA SU VENTA", pageWidth / 2, 250, { align: "center" });
  documentPdf.setDrawColor(210, 210, 214);
  documentPdf.line(10, 254, pageWidth - 10, 254);
  documentPdf.setTextColor(...DARK);
  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(12);
  documentPdf.text("IMPORTANTE", 12, 264);
  documentPdf.setDrawColor(...PRIMARY);
  documentPdf.setLineWidth(1.1);
  documentPdf.line(12, 267, 40, 267);
  const defaultLegal = "Este e-ticket es válido únicamente para el evento, fecha, sector y código indicados. Presenta el QR desde tu celular o impreso, junto con un documento de identidad cuando sea solicitado. El primer escaneo válido permitirá el ingreso y anulará cualquier copia posterior. No compartas el código QR. Festholic y el organizador no responden por entradas adquiridas a terceros, pérdidas, duplicaciones o alteraciones. El ingreso está sujeto a las reglas del organizador, aforo, seguridad y condiciones del establecimiento.";
  documentPdf.setTextColor(112, 109, 116);
  documentPdf.setFont("helvetica", "normal");
  documentPdf.setFontSize(6);
  const legalLines = documentPdf.splitTextToSize(ticketLike.legalText || defaultLegal, pageWidth - 24).slice(0, 10);
  documentPdf.text(legalLines, 12, 274, { align: "justify", maxWidth: pageWidth - 24, lineHeightFactor: 1.2 });

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
    internalCode: `ENTRADA-${client.id.slice(-6).toUpperCase()}-${String(reservationIndex).padStart(2, "0")}`,
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
  showToast("Entrada descargada.");
}

async function openWhatsApp(ticketId) {
  const ticket = state.tickets.find((item) => item.id === ticketId);
  if (!ticket?.buyerPhone) return showToast("Primero registra el WhatsApp del comprador.", "error");
  await copyShareClipboardForTickets([ticket], ticket.buyerPhone);
  showToast("Número del cliente copiado. Pegalo en WhatsApp para buscar el chat.");
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
    const bulkForward = event.target.closest("[data-bulk-forward]");
    if (bulkForward) return document.getElementById(bulkForward.dataset.bulkForward)?.click();
    const legalTrigger = event.target.closest("[data-legal]");
    if (legalTrigger) {
      const content = LEGAL_CONTENT[legalTrigger.dataset.legal];
      if (!content) return;
      $("#legalEyebrow").textContent = content.eyebrow;
      $("#legalTitle").textContent = content.title;
      $("#legalContent").innerHTML = content.html;
      $("#legalModal").showModal();
      return;
    }
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
    const eventCard = event.target.closest("[data-event-card]");
    if (eventCard && !event.target.closest("button, a, input, select, textarea, label")) {
      return openEventInventory(eventCard.dataset.eventCard);
    }
    const addClientCurrent = event.target.closest("[data-add-client-current]");
    if (addClientCurrent) return openClientModal();
    const openClient = event.target.closest("[data-open-client]");
    if (openClient) return openClientModal(openClient.dataset.openClient, openClient.dataset.openClientPhone);
    const openUploadCurrent = event.target.closest("[data-open-upload-current]");
    if (openUploadCurrent) return openTicketUpload();
    const uploadReservation = event.target.closest("[data-upload-for-reservation]");
    if (uploadReservation) return openReservationTicketUpload(uploadReservation.dataset.uploadForReservation);
    const removeReservation = event.target.closest("[data-delete-reservation]");
    if (removeReservation) return deleteClient(removeReservation.dataset.deleteReservation);
    const openTicket = event.target.closest("[data-open-ticket]");
    if (openTicket) return openTicketModal(openTicket.dataset.openTicket);
    const share = event.target.closest("[data-share-ticket]");
    if (share) return shareTicket(share.dataset.shareTicket, share);
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

  document.addEventListener("keydown", (event) => {
    const eventCard = event.target.closest?.("[data-event-card]");
    if (!eventCard || !["Enter", " "].includes(event.key)) return;
    if (event.target.closest("button, a, input, select, textarea, label")) return;
    event.preventDefault();
    openEventInventory(eventCard.dataset.eventCard);
  });

  $("#newEventBtn").addEventListener("click", () => openEventModal());
  $("#promoterProfileForm")?.addEventListener("submit", savePromoterProfile);
  $("#deliveryTemplateForm")?.addEventListener("submit", saveDeliveryMessageTemplate);
  $("#deliveryMessageTemplate")?.addEventListener("input", (event) => { event.currentTarget.dataset.dirty = "true"; });
  $("#restoreDeliveryTemplate")?.addEventListener("click", () => {
    const textarea = $("#deliveryMessageTemplate");
    textarea.value = DEFAULT_DELIVERY_TEMPLATE;
    textarea.dataset.dirty = "true";
    textarea.focus();
  });
  $$(".delivery-template-variables span").forEach((chip) => chip.addEventListener("click", () => {
    const textarea = $("#deliveryMessageTemplate");
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText(chip.textContent, start, end, "end");
    textarea.dataset.dirty = "true";
    textarea.focus();
  }));
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
  const queueTicketFiles = (files) => {
    const accepted = [...(files || [])].filter((file) => file && (file.type === "application/pdf" || file.type.startsWith("image/")));
    if (!accepted.length) {
      showToast("Selecciona archivos PDF o imagenes.", "error");
      return;
    }
    queuedFiles = accepted;
    renderFileQueue();
  };
  ["dragenter", "dragover"].forEach((type) => $("#dropZone").addEventListener(type, (event) => {
    event.preventDefault();
    $("#dropZone").classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((type) => $("#dropZone").addEventListener(type, (event) => {
    event.preventDefault();
    $("#dropZone").classList.remove("dragover");
  }));
  $("#dropZone").addEventListener("drop", (event) => {
    queueTicketFiles(event.dataTransfer.files);
  });
  $("#ticketFiles").addEventListener("change", (event) => {
    queueTicketFiles(event.target.files);
    // Permite elegir nuevamente el mismo archivo si el usuario se equivoco.
    event.target.value = "";
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
      await generateStandaloneOfficialPdf(button);
    } finally {
      button.disabled = false;
    }
  });
}


async function init() {
  scheduleStartupLoader();
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  closeMobileMenu();
  bindEvents();
  window.addEventListener("scroll", updateBulkFloatingBar, { passive: true });
  window.addEventListener("resize", updateBulkFloatingBar, { passive: true });
  if (CLOUD_MODE) {
    try {
      await loadCurrentUser();
      await loadPromoterWorkspace();
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
  restoreUiState();
  const requestedView = new URLSearchParams(location.search).get("view");
  if (new Set(["dashboard", "events", "inventory", "clients", "messages", "generator", "feedback", "profile", "trash"]).has(requestedView)) {
    currentView = requestedView;
  }
  setView(currentView);
  await window.FestholicLoader?.ready?.();
  dismissStartupLoader();
  requestAnimationFrame(() => document.documentElement.classList.remove("ui-starting"));
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  const localDevelopment = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (localDevelopment && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    }).catch(() => {});
  } else if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
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
window.addEventListener("pageshow", closeMobileMenu);
/* IAP_AVAILABLE_CODES_HOOK_START */
window.IAmPromoteInventory = window.IAmPromoteInventory || {};
window.IAmPromoteInventory.getCurrentEvent = () => state.events.find((event) => event.id === state.selectedEventId && !event.deletedAt) || null;
window.IAmPromoteInventory.getAvailableCodes = () => {
  if (!state.selectedEventId) return [];
  return getEventTickets(state.selectedEventId)
    .filter((ticket) => ticket.format === 'code' && ticket.status === 'available' && String(ticket.codeValue || '').trim())
    .map((ticket) => ({ id: ticket.id, code: String(ticket.codeValue).trim(), zone: ticket.zone || '' }));
};
window.dispatchEvent(new Event('iap:available-codes-ready'));
/* IAP_AVAILABLE_CODES_HOOK_END */
