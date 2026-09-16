const STORAGE_KEY = "iampromote-fan-events-v1";
const PREP_KEY = "iampromote-fan-prep-v1";
const PROFILE_KEY = "iampromote-fan-profile-v1";
const DB_NAME = "iampromote-fan-files";
const DB_STORE = "tickets";

const sampleEvents = [
  { id: "mana-2026", name: "Maná", venue: "Estadio Nacional, Lima", date: "2026-12-02T20:30", image: "fan-mana.png", theme: "cyan", spotify: "" },
  { id: "hugel-2026", name: "Hugel", venue: "Paradiso, Lima", date: "2026-10-16T22:00", image: "fan-hugel.png", theme: "coral", spotify: "" },
  { id: "cochinola-2026", name: "Cochinola", venue: "Lima, Perú", date: "2026-08-22T17:00", image: "fan-cochinola.jpg", theme: "violet", spotify: "" },
];

const colors = { violet: "#9b5cff", coral: "#ff625d", cyan: "#38d9ff", yellow: "#ffd84d" };
const $ = (selector) => document.querySelector(selector);
const setText = (selector, value) => {
  const element = $(selector);
  if (element) element.textContent = value;
};
let events = loadEvents();
let profile = loadProfile();
let ticketStatus = new Set();

function loadEvents() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : sampleEvents;
  } catch {
    return sampleEvents;
  }
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function loadProfile() {
  try {
    return { name: "", city: "", social: "", ...JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") };
  } catch {
    return { name: "", city: "", social: "" };
  }
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function renderProfile() {
  const name = profile.name?.trim() || "I Am Promote";
  const city = profile.city?.trim();
  const social = profile.social?.trim();
  const initial = (profile.name?.trim()?.[0] || "IP").toUpperCase();
  setText("#profileInitial", initial);
  setText("#profileNameLabel", name);
  setText("#profileMetaLabel", city || "Ticket workspace");
  setText("#headerProfileInitial", initial);
  setText("#headerProfileName", name);
  setText("#headerProfileMeta", city || social || "Ticket workspace");
  setText("#profileCardTitle", profile.name ? `Hola, ${profile.name}` : "Tu perfil asistente");
  setText("#profileCardCopy", [city, social].filter(Boolean).join(" · ") || "Personaliza tu panel para tus conciertos.");
}

function openProfileModal() {
  $("#profileName").value = profile.name || "";
  $("#profileCity").value = profile.city || "";
  $("#profileSocial").value = profile.social || "";
  $("#profileModal").showModal();
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) {
        request.result.createObjectStore(DB_STORE, { keyPath: "eventId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putTicket(eventId, file) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put({ eventId, file, name: file.name, type: file.type, updatedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getTicket(eventId) {
  const db = await openDb();
  const result = await new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE).objectStore(DB_STORE).get(eventId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function deleteTicket(eventId) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(eventId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function refreshTicketStatus() {
  const checks = await Promise.all(events.map(async (event) => [event.id, Boolean(await getTicket(event.id))]));
  ticketStatus = new Set(checks.filter(([, exists]) => exists).map(([id]) => id));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function countdown(dateValue) {
  const diff = new Date(dateValue).getTime() - Date.now();
  if (diff <= 0) return { past: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    past: false,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

function plural(value, singular, pluralText = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralText}`;
}

function countdownSummary(count) {
  if (count.past) {
    return { main: "¡Ya empezó!", detail: "Guarda tus recuerdos del show" };
  }
  if (count.days >= 30) {
    const months = Math.floor(count.days / 30);
    const weeks = Math.floor((count.days % 30) / 7);
    const days = count.days % 7;
    return {
      main: `${plural(months, "mes", "meses")}${weeks ? `, ${plural(weeks, "semana")}` : ""}`,
      detail: `${days ? `${plural(days, "día")}, ` : ""}${plural(count.hours, "hora")}, ${plural(count.minutes, "minuto")}`,
    };
  }
  if (count.days >= 7) {
    const weeks = Math.floor(count.days / 7);
    const days = count.days % 7;
    return {
      main: `${plural(weeks, "semana")}${days ? `, ${plural(days, "día")}` : ""}`,
      detail: `${plural(count.hours, "hora")}, ${plural(count.minutes, "minuto")}, ${plural(count.seconds, "segundo")}`,
    };
  }
  if (count.days > 0) {
    return {
      main: `${plural(count.days, "día")}, ${plural(count.hours, "hora")}`,
      detail: `${plural(count.minutes, "minuto")}, ${plural(count.seconds, "segundo")}`,
    };
  }
  return {
    main: `${plural(count.hours, "hora")}, ${plural(count.minutes, "minuto")}`,
    detail: `${plural(count.seconds, "segundo")} para vivirlo`,
  };
}

function alertText(dateValue) {
  const now = new Date();
  const eventDate = new Date(dateValue);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const days = Math.round((target - today) / 86400000);
  if (days === 0) return { text: "¡Es hoy! Ten tu entrada lista", className: "tomorrow" };
  if (days === 1) return { text: "¡Es mañana! Prepara todo", className: "tomorrow" };
  if (days > 1 && days <= 7) return { text: `Faltan ${days} días. Ya casi`, className: "" };
  return null;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function sortedEvents() {
  return [...events].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function renderSummary(upcoming = sortedEvents()) {
  const next = upcoming.find((event) => !countdown(event.date).past) || upcoming[0];
  setText("#eventCount", String(events.length));
  setText("#ticketCount", String(ticketStatus.size));
  if (!next) {
    setText("#nextEventName", "Sin eventos");
    setText("#nextEventTime", "Agrega tu primer concierto");
    return;
  }
  const summary = countdownSummary(countdown(next.date));
  setText("#nextEventName", next.name);
  setText("#nextEventTime", `${summary.main} · ${next.venue}`);
}

function updateCountdowns() {
  const upcoming = sortedEvents();
  renderSummary(upcoming);
  document.querySelectorAll("[data-event-card]").forEach((card) => {
    const event = events.find((item) => item.id === card.dataset.eventCard);
    if (!event) return;
    const summary = countdownSummary(countdown(event.date));
    const alert = alertText(event.date);
    const alertElement = card.querySelector("[data-event-alert]");
    const mainElement = card.querySelector("[data-count-main]");
    const detailElement = card.querySelector("[data-count-detail]");

    if (mainElement) mainElement.textContent = summary.main;
    if (detailElement) detailElement.textContent = summary.detail;
    card.classList.toggle("is-soon", Boolean(alert?.className));

    if (alertElement) {
      alertElement.textContent = alert?.text || "";
      alertElement.className = `event-alert ${alert?.className || ""}`.trim();
      alertElement.hidden = !alert;
    }
  });
}

function renderEvents() {
  const grid = $("#eventGrid");
  const upcoming = sortedEvents();
  renderSummary(upcoming);
  grid.innerHTML = upcoming.map((event) => {
    const count = countdown(event.date);
    const summary = countdownSummary(count);
    const alert = alertText(event.date);
    const ready = ticketStatus.has(event.id);
    const theme = event.theme || "violet";
    const spotify = event.spotify ? `<button class="event-action spotify-action" data-spotify="${escapeHtml(event.spotify)}" title="Abrir playlist en Spotify" aria-label="Abrir playlist en Spotify"><img src="img/apps/spotify.png" alt=""></button>` : "";
    return `
      <article class="event-card theme-${theme} ${alert?.className ? "is-soon" : ""}" data-event-card="${escapeHtml(event.id)}" style="--accent:${colors[theme] || colors.violet}; --accent-strong:${colors[theme] || colors.violet}">
        <img class="event-photo" src="${escapeHtml(event.image)}" alt="${escapeHtml(event.name)}" />
        <div class="event-main">
          <p class="event-alert ${alert?.className || ""}" data-event-alert ${alert ? "" : "hidden"}>${alert ? escapeHtml(alert.text) : ""}</p>
          <div class="event-title-line">
            <h3>${escapeHtml(event.name)}</h3>
          </div>
          <p class="event-date-line">${formatDate(event.date)}</p>
          <div class="event-count-main" data-count-main>${escapeHtml(summary.main)}</div>
          <div class="event-count-detail" data-count-detail>${escapeHtml(summary.detail)}</div>
          <p class="event-meta"><span></span>${escapeHtml(event.venue)}</p>
        </div>
        <div class="event-tools">
          <button class="event-menu" data-edit="${event.id}" type="button" aria-label="Editar ${escapeHtml(event.name)}"><i data-lucide="pencil"></i></button>
          <button class="event-action ${ready ? "ticket-ready" : ""}" data-ticket="${event.id}" type="button" title="${ready ? "Ver entrada" : "Guardar entrada"}"><i data-lucide="${ready ? "eye" : "upload"}"></i></button>
          ${spotify}
          <button class="event-action" data-share="${event.id}" type="button" title="Compartir tarjeta"><i data-lucide="share-2"></i></button>
        </div>
      </article>`;
  }).join("");
  $("#emptyState").hidden = upcoming.length > 0;
  grid.hidden = upcoming.length === 0;
  window.lucide?.createIcons();
}function resetForm(event = null) {
  $("#eventForm").reset();
  $("#eventId").value = event?.id || "";
  $("#eventName").value = event?.name || "";
  $("#eventVenue").value = event?.venue || "";
  $("#eventDate").value = event?.date || "";
  $("#eventTheme").value = event?.theme || "violet";
  $("#eventImage").value = event?.image || "fan-mana.png";
  $("#eventSpotify").value = event?.spotify || "";
  $("#modalTitle").textContent = event ? "Editar evento" : "Nuevo evento";
  $("#deleteEventBtn").hidden = !event;
  $("#ticketFileLabel").textContent = event && ticketStatus.has(event.id) ? "Ya tienes una entrada guardada. Elige otra para reemplazarla." : "Puedes agregarla ahora o después.";
}

function openEventModal(event = null) {
  resetForm(event);
  $("#eventModal").showModal();
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
}

async function handleTicket(eventId) {
  const stored = await getTicket(eventId);
  if (stored?.file) {
    const url = URL.createObjectURL(stored.file);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  openEventModal(events.find((item) => item.id === eventId));
  setTimeout(() => $("#eventTicket").click(), 180);
}

async function shareCard(eventId) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  const image = new Image();
  image.src = event.image;
  await image.decode();
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
  ctx.drawImage(image, (canvas.width - image.width * scale) / 2, (canvas.height - image.height * scale) / 2, image.width * scale, image.height * scale);
  const gradient = ctx.createLinearGradient(0, 280, 0, 1350);
  gradient.addColorStop(0, "rgba(8,5,14,0)");
  gradient.addColorStop(.55, "rgba(8,5,14,.55)");
  gradient.addColorStop(1, "rgba(8,5,14,.98)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = colors[event.theme] || colors.violet;
  ctx.fillRect(72, 905, 130, 10);
  ctx.fillStyle = "#fff";
  ctx.font = "700 100px Arial";
  ctx.fillText(event.name, 72, 1045);
  ctx.font = "600 34px Arial";
  ctx.fillStyle = "#d8d0e0";
  ctx.fillText(event.venue, 76, 1110);
  ctx.font = "700 30px Arial";
  ctx.fillStyle = colors[event.theme] || colors.violet;
  ctx.fillText(formatDate(event.date).toUpperCase(), 76, 1170);
  ctx.font = "700 24px Arial";
  ctx.fillStyle = "#fff";
  ctx.fillText("I AM PROMOTE · MIS EVENTOS", 76, 1270);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const file = new File([blob], `${event.name.replace(/\W+/g, "-").toLowerCase()}-countdown.png`, { type: "image/png" });
  const text = `Nos vemos en ${event.name} · ${formatDate(event.date)}`;
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title: event.name, text, files: [file] }).catch(() => {});
  } else {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
    toast("Tarjeta descargada");
  }
}

function renderPrep() {
  const selected = new Set(JSON.parse(localStorage.getItem(PREP_KEY) || "[]"));
  document.querySelectorAll("[data-prep]").forEach((card) => {
    const done = selected.has(card.dataset.prep);
    card.classList.toggle("done", done);
    card.querySelector(".check").setAttribute("data-lucide", done ? "circle-check-big" : "circle");
  });
  $("#prepScore").textContent = `${selected.size}/4 listo`;
  window.lucide?.createIcons();
}

function closeSidebar() {
  $("#fanSidebar")?.classList.remove("open");
  $("#sidebarBackdrop")?.classList.remove("open");
}

document.addEventListener("click", async (click) => {
  const add = click.target.closest("#addEventTopBtn, [data-add-event]");
  if (add) return openEventModal();
  if (click.target.closest("#menuBtn")) {
    $("#fanSidebar")?.classList.add("open");
    $("#sidebarBackdrop")?.classList.add("open");
    return;
  }
  if (click.target.closest("#sidebarBackdrop")) return closeSidebar();
  if (click.target.closest(".fan-nav a")) closeSidebar();
  if (click.target.closest("#profileBtn, #profileCard, #headerProfileBtn")) {
    closeSidebar();
    return openProfileModal();
  }
  if (click.target.closest("#ticketQuickBtn")) {
    if (!events.length) return openEventModal();
    return openEventModal(events[0]);
  }
  if (click.target.closest("[data-close-modal]")) return $("#eventModal").close();
  if (click.target.closest("[data-close-profile]")) return $("#profileModal").close();
  const edit = click.target.closest("[data-edit]");
  if (edit) return openEventModal(events.find((event) => event.id === edit.dataset.edit));
  const ticket = click.target.closest("[data-ticket]");
  if (ticket) return handleTicket(ticket.dataset.ticket);
  const share = click.target.closest("[data-share]");
  if (share) return shareCard(share.dataset.share);
  const spotify = click.target.closest("[data-spotify]");
  if (spotify) return window.open(spotify.dataset.spotify, "_blank", "noopener");
  const prep = click.target.closest("[data-prep]");
  if (prep) {
    const selected = new Set(JSON.parse(localStorage.getItem(PREP_KEY) || "[]"));
    selected.has(prep.dataset.prep) ? selected.delete(prep.dataset.prep) : selected.add(prep.dataset.prep);
    localStorage.setItem(PREP_KEY, JSON.stringify([...selected]));
    renderPrep();
  }
});

$("#eventForm").addEventListener("submit", async (submit) => {
  submit.preventDefault();
  const currentId = $("#eventId").value;
  const id = currentId || `fan-${Date.now()}`;
  const record = {
    id,
    name: $("#eventName").value.trim(),
    venue: $("#eventVenue").value.trim(),
    date: $("#eventDate").value,
    theme: $("#eventTheme").value,
    image: $("#eventImage").value,
    spotify: $("#eventSpotify").value.trim(),
  };
  const index = events.findIndex((event) => event.id === id);
  if (index >= 0) events[index] = record;
  else events.push(record);
  const file = $("#eventTicket").files[0];
  if (file) {
    if (file.size > 20 * 1024 * 1024) return toast("La entrada no debe superar 20 MB");
    await putTicket(id, file);
    ticketStatus.add(id);
  }
  saveEvents();
  $("#eventModal").close();
  renderEvents();
  toast(currentId ? "Evento actualizado" : "Evento agregado");
});

$("#profileForm").addEventListener("submit", (submit) => {
  submit.preventDefault();
  profile = {
    name: $("#profileName").value.trim(),
    city: $("#profileCity").value.trim(),
    social: $("#profileSocial").value.trim(),
  };
  saveProfile();
  renderProfile();
  $("#profileModal").close();
  toast("Perfil actualizado");
});

$("#deleteEventBtn").addEventListener("click", async () => {
  const id = $("#eventId").value;
  if (!id || !confirm("¿Eliminar este evento y su entrada guardada?")) return;
  events = events.filter((event) => event.id !== id);
  saveEvents();
  await deleteTicket(id);
  ticketStatus.delete(id);
  $("#eventModal").close();
  renderEvents();
  toast("Evento eliminado");
});

async function start() {
  await refreshTicketStatus();
  renderProfile();
  renderEvents();
  renderPrep();
  setInterval(updateCountdowns, 1000);
  await window.FestholicLoader?.ready?.();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js?v=20260913221616", { updateViaCache: "none" }).catch(() => {});
  }
}

start();


