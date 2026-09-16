const STORAGE_KEY = "iampromote-fan-events-v1";
const PREP_KEY = "iampromote-fan-prep-v1";
const PROFILE_KEY = "iampromote-fan-profile-v1";
const COMPANIONS_KEY = "iampromote-fan-companions-v1";
const REMINDERS_KEY = "iampromote-fan-reminders-v1";
const NOTES_KEY = "iampromote-fan-notes-v1";
const DB_NAME = "iampromote-fan-files";
const DB_STORE = "tickets";

const sampleEvents = [
  { id: "mana-2026", name: "Maná", venue: "Estadio Nacional, Lima", date: "2026-12-02T20:30", image: "fan-mana.png", theme: "cyan", spotify: "" },
  { id: "hugel-2026", name: "Hugel", venue: "Paradiso, Lima", date: "2026-10-16T22:00", image: "fan-hugel.png", theme: "coral", spotify: "" },
  { id: "cochinola-2026", name: "Cochinola", venue: "Lima, Perú", date: "2026-08-22T17:00", image: "fan-cochinola.jpg", theme: "violet", spotify: "" },
];

const colors = { violet: "#8b5cf6", coral: "#fb4b6a", cyan: "#22d3ee", yellow: "#f59e0b", green: "#2dd4bf", blue: "#2563eb", purple: "#a855f7", red: "#dc2626" };
const $ = (selector) => document.querySelector(selector);
const setText = (selector, value) => {
  const element = $(selector);
  if (element) element.textContent = value;
};
let events = loadEvents();
let profile = loadProfile();
let ticketStatus = new Set();
let activeTicketUrl = "";
let activeTicketEventId = "";
let activeDetailEventId = "";
let activeTimeline = "upcoming";
let activeFanView = "home";
let chatNudgeIndex = 0;
let activeChatNudge = "";
let fanWorkspaceHydrated = false;

function fanWorkspaceData() {
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  };
  return {
    events: read(STORAGE_KEY, sampleEvents),
    prep: read(PREP_KEY, []),
    profile: read(PROFILE_KEY, {}),
    companions: read(COMPANIONS_KEY, {}),
    reminders: read(REMINDERS_KEY, {}),
    notes: read(NOTES_KEY, {}),
  };
}

function scheduleFanWorkspaceSync() {
  if (fanWorkspaceHydrated) window.FestholicWorkspace?.schedule("attendee", fanWorkspaceData());
}

async function hydrateFanWorkspace() {
  try {
    const remote = await window.FestholicWorkspace?.load("attendee");
    if (remote) {
      const map = { events: STORAGE_KEY, prep: PREP_KEY, profile: PROFILE_KEY, companions: COMPANIONS_KEY, reminders: REMINDERS_KEY, notes: NOTES_KEY };
      Object.entries(map).forEach(([field, key]) => {
        if (remote[field] !== undefined) localStorage.setItem(key, JSON.stringify(remote[field]));
      });
    }
    fanWorkspaceHydrated = true;
    if (!remote) window.FestholicWorkspace?.schedule("attendee", fanWorkspaceData(), 0);
  } catch (error) {
    fanWorkspaceHydrated = true;
    console.warn("Assistant workspace", error);
  }
}

function applyTimelineView() {
  const showingPast = activeTimeline === "past";
  const showingProfile = activeFanView === "profile";
  const upcomingSection = $("#eventsSection");
  const pastSection = $("#pastEventsSection");
  if (upcomingSection) upcomingSection.hidden = showingProfile || showingPast;
  if (pastSection) pastSection.hidden = showingProfile || !showingPast;
  $("#fanProfileView").hidden = !showingProfile;
  $(".fan-timeline-tabs").hidden = showingProfile;
  document.querySelectorAll("[data-timeline-tab]").forEach((button) => {
    const active = button.dataset.timelineTab === activeTimeline;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function scrollFanViewToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.scrollingElement?.scrollTo({ top: 0, behavior: "smooth" });
  $(".fan-main")?.scrollTo?.({ top: 0, behavior: "smooth" });
}

function loadObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveObject(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  scheduleFanWorkspaceSync();
}

function loadEvents() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return sampleEvents;
    return saved.map((event) => ({
      ...event,
      name: event.name === "Man\u00c3\u00a1" ? "Maná" : event.name,
      venue: event.venue?.replace("Per\u00c3\u00ba", "Perú"),
    }));
  } catch {
    return sampleEvents;
  }
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  scheduleFanWorkspaceSync();
}

function loadProfile() {
  try {
    return { name: "", city: "", social: "", phone: "", reminders: true, news: false, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") };
  } catch {
    return { name: "", city: "", social: "", phone: "", reminders: true, news: false };
  }
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  scheduleFanWorkspaceSync();
}

function renderProfile() {
  const name = profile.name?.trim() || "Festholic";
  const welcomeName = profile.name?.trim()?.split(/\s+/)[0] || "fan";
  const city = profile.city?.trim();
  const social = profile.social?.trim();
  const initial = (profile.name?.trim()?.[0] || "MF").toUpperCase();
  setText("#profileInitial", initial);
  setText("#profileNameLabel", name);
  setText("#profileMetaLabel", city || "Ticket workspace");
  setText("#headerProfileInitial", initial);
  const headerAvatar = $("#headerProfileInitial");
  if (headerAvatar) {
    headerAvatar.textContent = profile.avatarUrl ? "" : initial;
    headerAvatar.style.backgroundImage = profile.avatarUrl ? `url("${profile.avatarUrl}")` : "";
    headerAvatar.style.backgroundSize = profile.avatarUrl ? "cover" : "";
    headerAvatar.style.backgroundPosition = profile.avatarUrl ? "center" : "";
  }
  setText("#headerProfileName", name);
  setText("#headerProfileMeta", city || social || "Ticket workspace");
  setText("#fanWelcomeName", welcomeName);
  setText("#profileCardTitle", profile.name ? `Hola, ${profile.name}` : "Tu perfil asistente");
  setText("#profileCardCopy", [city, social].filter(Boolean).join(" · ") || "Personaliza tu panel para tus conciertos.");
}

function renderProfilePage() {
  const upcoming = events.filter((event) => !isEventPast(event));
  const past = events.filter(isEventPast);
  const displayName = profile.name?.trim() || "Festholic";
  setText("#profilePageInitial", (profile.name?.trim()?.[0] || "MF").toUpperCase());
  const pageAvatar = $("#profilePageInitial");
  if (pageAvatar) {
    pageAvatar.textContent = profile.avatarUrl ? "" : (profile.name?.trim()?.[0] || "MF").toUpperCase();
    pageAvatar.style.backgroundImage = profile.avatarUrl ? `url("${profile.avatarUrl}")` : "";
    pageAvatar.style.backgroundSize = profile.avatarUrl ? "cover" : "";
    pageAvatar.style.backgroundPosition = profile.avatarUrl ? "center" : "";
  }
  setText("#profilePageName", displayName);
  setText("#profilePageMeta", [profile.city, profile.social].filter(Boolean).join(" · ") || "Completa tu perfil para personalizar tu experiencia.");
  setText("#profileUpcomingCount", String(upcoming.length));
  setText("#profileTicketCount", String(ticketStatus.size));
  setText("#profilePastCount", String(past.length));
  $("#profilePageNameInput").value = profile.name || "";
  $("#profilePageEmailInput").value = profile.pendingEmail || profile.email || "";
  $("#profilePageCityInput").value = profile.city || "";
  $("#profilePageSocialInput").value = profile.social || "";
  $("#profilePagePhoneInput").value = profile.phone || "";
  $("#profilePageReminders").checked = profile.reminders !== false;
  $("#profilePageNews").checked = Boolean(profile.news);
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
  try {
    const response = await fetch(`/api/user-files/attendee/${encodeURIComponent(eventId)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name || "entrada") },
      body: file,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.warn("Entrada guardada solo en este dispositivo", error);
  }
}

async function getTicket(eventId) {
  const db = await openDb();
  const result = await new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE).objectStore(DB_STORE).get(eventId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (result?.file) return result;
  try {
    const response = await fetch(`/api/user-files/attendee/${encodeURIComponent(eventId)}`, { credentials: "same-origin" });
    if (!response.ok) return null;
    const fileName = decodeURIComponent(response.headers.get("X-File-Name") || "entrada");
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
    const remote = { eventId, file, name: fileName, type: file.type, updatedAt: Date.now() };
    const cache = await openDb();
    await new Promise((resolve, reject) => {
      const tx = cache.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(remote);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    cache.close();
    return remote;
  } catch (error) {
    console.warn("No se pudo recuperar la entrada sincronizada", error);
    return null;
  }
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
  try {
    await fetch(`/api/user-files/attendee/${encodeURIComponent(eventId)}`, { method: "DELETE", credentials: "same-origin" });
  } catch (error) {
    console.warn("No se pudo eliminar la copia sincronizada", error);
  }
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

function compactCountdownLabel(count) {
  if (count.past) return "Finalizado";
  if (count.days >= 30) return plural(Math.floor(count.days / 30), "mes", "meses");
  if (count.days >= 7) return plural(Math.floor(count.days / 7), "semana");
  if (count.days > 0) return plural(count.days, "día");
  if (count.hours > 0) return plural(count.hours, "hora");
  return plural(Math.max(count.minutes, 1), "minuto");
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

function updateCountdowns() {
  document.querySelectorAll("[data-event-card]").forEach((card) => {
    const event = events.find((item) => item.id === card.dataset.eventCard);
    if (!event) return;
    const summary = countdownSummary(countdown(event.date));
    const mainElement = card.querySelector("[data-count-main]");
    const detailElement = card.querySelector("[data-count-detail]");

    if (mainElement) mainElement.textContent = summary.main;
    if (detailElement) detailElement.textContent = summary.detail;
  });
  const hero = $("#nextEventFeature [data-event-card]");
  if (hero) {
    const event = events.find((item) => item.id === hero.dataset.eventCard);
    const count = event ? countdown(event.date) : null;
    if (count) {
      setText("#nextEventDays", String(count.days).padStart(2, "0"));
      setText("#nextEventHours", String(count.hours).padStart(2, "0"));
      setText("#nextEventMinutes", String(count.minutes).padStart(2, "0"));
    }
  }
  if ($("#eventDetailModal")?.open && activeDetailEventId) {
    const event = events.find((item) => item.id === activeDetailEventId);
    if (event) $("#detailCountdown").textContent = countdownSummary(countdown(event.date)).main;
  }
}

function isEventPast(event) {
  return Date.now() > new Date(event.date).getTime() + (12 * 60 * 60 * 1000);
}

function isEventToday(event) {
  const now = new Date();
  const date = new Date(event.date);
  return now.getFullYear() === date.getFullYear()
    && now.getMonth() === date.getMonth()
    && now.getDate() === date.getDate();
}

function eventMonthKey(event) {
  const date = new Date(event.date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function eventMonthLabel(event) {
  const date = new Date(event.date);
  const month = new Intl.DateTimeFormat("es-PE", { month: "long" }).format(date);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getFullYear()}`;
}

function monthHeading(event, previousEvent = null) {
  if (previousEvent && eventMonthKey(previousEvent) === eventMonthKey(event)) return "";
  return `<h3 class="event-month-heading"><span>${escapeHtml(eventMonthLabel(event))}</span></h3>`;
}

function renderEvents() {
  const grid = $("#eventGrid");
  const ordered = sortedEvents();
  const upcoming = ordered.filter((event) => !isEventPast(event));
  const past = ordered.filter(isEventPast).reverse();
  const featured = upcoming[0];
  const feature = $("#nextEventFeature");
  const showFeatured = activeFanView === "home" && Boolean(featured);
  feature.hidden = !showFeatured;
  feature.innerHTML = featured ? (() => {
    const count = countdown(featured.date);
    const ready = ticketStatus.has(featured.id);
    return `
      <div class="next-event-feature__heading"><h2>Próximo evento</h2><button data-open-event-detail="${escapeHtml(featured.id)}" type="button">Ver detalles <i data-lucide="chevron-right"></i></button></div>
      <article class="next-event-hero" data-event-card="${escapeHtml(featured.id)}" style="--hero-image:url('${escapeHtml(featured.image)}')">
        <div class="next-event-hero__copy">
          <span class="next-event-hero__badge">${count.days === 1 ? "1 día" : `${count.days} días`}</span>
          <h3>${escapeHtml(featured.name)}</h3>
          <p><i data-lucide="calendar-days"></i>${escapeHtml(formatDate(featured.date))}</p>
          <p><i data-lucide="map-pin"></i>${escapeHtml(featured.venue)}</p>
          <div class="next-event-hero__actions">
            <button data-ticket="${escapeHtml(featured.id)}" type="button"><i data-lucide="ticket-check"></i>${ready ? "Ver entrada" : "Guardar entrada"}</button>
            <button data-edit="${escapeHtml(featured.id)}" type="button" aria-label="Editar evento"><i data-lucide="ellipsis"></i></button>
          </div>
        </div>
        <div class="next-event-countdown" aria-label="Cuenta regresiva">
          <span><small>Días</small><strong id="nextEventDays">${String(count.days).padStart(2, "0")}</strong></span>
          <span><small>Horas</small><strong id="nextEventHours">${String(count.hours).padStart(2, "0")}</strong></span>
          <span><small>Min</small><strong id="nextEventMinutes">${String(count.minutes).padStart(2, "0")}</strong></span>
        </div>
      </article>`;
  })() : "";
  const visibleUpcoming = activeFanView === "events" ? upcoming : upcoming.slice(1, 4);
  grid.innerHTML = visibleUpcoming.map((event, index) => {
    const summary = countdownSummary(countdown(event.date));
    const ready = ticketStatus.has(event.id);
    const theme = event.theme || "violet";
    if (activeFanView === "home") {
      const ticketCount = getEventCompanions(event.id).length + 1;
      return `
        <article class="event-card event-card--compact" data-event-card="${escapeHtml(event.id)}" data-open-event-detail="${escapeHtml(event.id)}">
          <img class="event-photo" src="${escapeHtml(event.image)}" alt="${escapeHtml(event.name)}" />
          <div class="event-main">
            <h3>${escapeHtml(event.name)}</h3>
            <p class="event-date-line">${formatDate(event.date)}</p>
            <p class="event-meta"><i data-lucide="map-pin"></i>${escapeHtml(event.venue)}</p>
          </div>
          <div class="event-compact-status">
            <span>${escapeHtml(compactCountdownLabel(countdown(event.date)))}</span>
            <small><i data-lucide="ticket"></i>${ticketCount}</small>
          </div>
          <i class="event-compact-arrow" data-lucide="chevron-right"></i>
        </article>`;
    }
    const spotify = event.spotify ? `<button class="event-action spotify-action" data-spotify="${escapeHtml(event.spotify)}" title="Abrir playlist en Spotify" aria-label="Abrir playlist en Spotify"><img src="img/apps/spotify.png" alt=""></button>` : "";
    return `
      ${monthHeading(event, visibleUpcoming[index - 1])}
      <article class="event-card theme-${theme}" data-event-card="${escapeHtml(event.id)}" data-open-event-detail="${escapeHtml(event.id)}" style="--accent:${colors[theme] || colors.violet}; --accent-strong:${colors[theme] || colors.violet}">
        <img class="event-photo" src="${escapeHtml(event.image)}" alt="${escapeHtml(event.name)}" />
        <div class="event-main">
          <div class="event-title-line"><h3>${escapeHtml(event.name)}</h3></div>
          <p class="event-date-line">${formatDate(event.date)}</p>
          <div class="event-count-main" data-count-main>${escapeHtml(summary.main)}</div>
          <div class="event-count-detail" data-count-detail>${escapeHtml(summary.detail)}</div>
          <p class="event-meta"><span></span>${escapeHtml(event.venue)}</p>
          ${ready ? `<p class="event-ticket-status"><i data-lucide="shield-check"></i>Entrada disponible sin conexión</p>` : ""}
        </div>
        <div class="event-tools">
          <button class="event-menu" data-edit="${event.id}" type="button" aria-label="Editar ${escapeHtml(event.name)}"><i data-lucide="pencil"></i></button>
          <button class="event-action event-ticket-button ${ready ? "ticket-ready" : ""}" data-ticket="${event.id}" type="button" title="${ready ? "Ver mi entrada" : "Guardar mi entrada"}" aria-label="${ready ? "Ver la entrada de" : "Guardar una entrada para"} ${escapeHtml(event.name)}"><i data-lucide="${ready ? "ticket-check" : "ticket-plus"}"></i></button>
          ${spotify}
        </div>
      </article>`;
  }).join("");

  $("#emptyState").hidden = upcoming.length > 0;
  grid.hidden = visibleUpcoming.length === 0;
  setText("#eventsSectionTitle", activeFanView === "events" ? "Mis eventos" : "Tus próximos eventos");
  $("#pastEventCount").textContent = String(past.length);
  $("#pastEventList").innerHTML = past.map((event, index) => `
    ${monthHeading(event, past[index - 1])}
    <button class="past-event-item" data-open-event-detail="${escapeHtml(event.id)}" type="button">
      <img src="${escapeHtml(event.image)}" alt="" />
      <span><strong>${escapeHtml(event.name)}</strong><span>${escapeHtml(formatDate(event.date))}</span></span>
      <i data-lucide="chevron-right"></i>
    </button>`).join("");

  const today = upcoming.find(isEventToday);
  const homeView = activeFanView === "home";
  $(".fan-welcome").hidden = !homeView;
  $("#prepSection").hidden = !homeView;
  $("#todayStrip").hidden = !homeView || !today;
  if (today) {
    $("#todayEventName").textContent = today.name;
    $("#todayTicketBtn").dataset.eventId = today.id;
    $("#todayTicketBtn span").textContent = ticketStatus.has(today.id) ? "Ver entrada" : "Guardar entrada";
  }
  $("#prepHeading").textContent = "Checklist";
  applyTimelineView();
  window.lucide?.createIcons();
}

function resetForm(event = null) {
  $("#eventForm").reset();
  $("#eventId").value = event?.id || "";
  $("#eventName").value = event?.name || "";
  $("#eventVenue").value = event?.venue || "";
  $("#eventDate").value = event?.date || "";
  $("#eventTheme").value = event?.theme || "violet";
  document.querySelectorAll("#eventColorPicker [data-color]").forEach((button) => button.classList.toggle("is-selected", button.dataset.color === (event?.theme || "violet")));
  $("#eventImageFile").value = "";
  $("#eventImageFile").dataset.defaultImage = "";
  $("#eventImageLabel").textContent = event?.image ? "Portada actual conservada. Elige otra para reemplazarla." : "Si no subes una imagen, usaremos una portada de conciertos de Festholic.";
  $("#modalTitle").textContent = event ? "Editar evento" : "Nuevo evento";
  $("#deleteEventBtn").hidden = !event;
  $("#ticketFileLabel").textContent = event && ticketStatus.has(event.id) ? "Ya tienes una entrada guardada. Elige otra para reemplazarla." : "Puedes agregarla ahora o después.";
}

$("#eventColorPicker")?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const button = event.target.closest("[data-color]");
  if (!button) return;
  $("#eventTheme").value = button.dataset.color;
  document.querySelectorAll("#eventColorPicker [data-color]").forEach((item) => item.classList.toggle("is-selected", item === button));
});

$("#useDefaultImage")?.addEventListener("click", () => {
  const defaults = ["fan-mana.png", "fan-hugel.png", "fan-cochinola.jpg"];
  const image = defaults[Math.floor(Math.random() * defaults.length)];
  $("#eventImageFile").value = "";
  $("#eventImageFile").dataset.defaultImage = image;
  $("#eventImageLabel").textContent = "Portada predeterminada seleccionada.";
});

function openEventModal(event = null) {
  resetForm(event);
  $("#eventModal").showModal();
}

function openQuickTicketModal(event) {
  if (!event) return;
  $("#quickTicketForm").reset();
  $("#quickTicketEventId").value = event.id;
  $("#quickTicketEventName").textContent = event.name;
  $("#quickTicketFileName").textContent = "PDF o imagen, máximo 20 MB";
  $("#quickTicketModal").showModal();
  window.lucide?.createIcons();
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
    const event = events.find((item) => item.id === eventId);
    activeTicketEventId = eventId;
    $("#ticketAccessTitle").textContent = event?.name || "Entrada del evento";
    $("#ticketAccessDate").textContent = event ? formatDate(event.date) : "Fecha del evento";
    $("#ticketAccessVenue").textContent = event?.venue || "Lugar del evento";
    $("#ticketAccessCover").style.backgroundImage = `url("${(event?.image || "fan-mana.png").replace(/["\\]/g, "")}")`;
    $("#ticketAccessModal").showModal();
    window.lucide?.createIcons();
    return;
  }
  openQuickTicketModal(events.find((item) => item.id === eventId));
}

async function openStoredTicket() {
  if (!activeTicketEventId) return;
  const stored = await getTicket(activeTicketEventId);
  if (!stored?.file) {
    $("#ticketAccessModal")?.close();
    ticketStatus.delete(activeTicketEventId);
    renderEvents();
    return toast("No encontramos esta entrada. Vuelve a guardarla.");
  }
  const event = events.find((item) => item.id === activeTicketEventId);
  closeTicketViewer();
  activeTicketUrl = URL.createObjectURL(stored.file);
  $("#ticketViewerTitle").textContent = event?.name || "Entrada del evento";
  $("#ticketViewerBody").innerHTML = stored.file.type === "application/pdf"
    ? `<iframe src="${activeTicketUrl}" title="Entrada PDF de ${escapeHtml(event?.name || "evento")}"></iframe>`
    : `<img src="${activeTicketUrl}" alt="Entrada de ${escapeHtml(event?.name || "evento")}" />`;
  $("#ticketAccessModal")?.close();
  $("#ticketViewerModal").showModal();
  window.lucide?.createIcons();
}

function closeTicketViewer() {
  const viewer = $("#ticketViewerModal");
  if (viewer?.open) viewer.close();
  $("#ticketViewerBody").replaceChildren();
  if (activeTicketUrl) URL.revokeObjectURL(activeTicketUrl);
  activeTicketUrl = "";
}

function getEventCompanions(eventId) {
  return loadObject(COMPANIONS_KEY)[eventId] || [];
}

function reminderEnabled(eventId) {
  return Boolean(loadObject(REMINDERS_KEY)[eventId]?.enabled);
}

function updateDetailReminder(eventId = activeDetailEventId) {
  const enabled = reminderEnabled(eventId);
  $("#detailReminderBtn").classList.toggle("is-active", enabled);
  $("#detailReminderState").textContent = enabled ? "Avisos activados" : "Activar avisos";
  $("#detailReminderBtn [data-lucide]")?.setAttribute("data-lucide", enabled ? "bell-ring" : "bell");
  window.lucide?.createIcons();
}

function openEventDetail(eventId) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return;
  const past = isEventPast(event);
  activeDetailEventId = event.id;
  $("#detailCover").style.backgroundImage = `url("${(event.image || "fan-mana.png").replace(/["\\]/g, "")}")`;
  $("#detailName").textContent = event.name;
  $("#detailDate").textContent = formatDate(event.date);
  $("#detailCountdown").textContent = countdownSummary(countdown(event.date)).main;
  $("#detailVenue").textContent = event.venue;
  $("#detailTicketState").textContent = ticketStatus.has(event.id) ? "Disponible sin conexión" : "Guardar entrada";
  $("#detailTicketBtn").classList.toggle("is-ready", ticketStatus.has(event.id));
  $("#detailTicketBtn [data-lucide]")?.setAttribute("data-lucide", ticketStatus.has(event.id) ? "ticket-check" : "ticket-plus");
  $("#detailRouteBtn").hidden = past;
  $("#detailReminderBtn").hidden = past;
  $(".event-detail-actions").classList.toggle("single-action", past);
  $("#eventNoteSection").hidden = !past;
  $("#eventMemoryNote").value = loadObject(NOTES_KEY)[event.id] || "";
  updateDetailReminder(event.id);
  $("#eventDetailModal").showModal();
  window.lucide?.createIcons();
}

async function toggleReminder(eventId) {
  const reminders = loadObject(REMINDERS_KEY);
  const enabled = !reminders[eventId]?.enabled;
  if (enabled && "Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission().catch(() => "default");
  }
  reminders[eventId] = { ...reminders[eventId], enabled, lastStage: enabled ? reminders[eventId]?.lastStage || "" : "" };
  saveObject(REMINDERS_KEY, reminders);
  updateDetailReminder(eventId);
  toast(enabled ? "Recordatorio activado" : "Recordatorio desactivado");
}

function reminderStage(event) {
  const diff = new Date(event.date).getTime() - Date.now();
  if (diff <= 0) return "today";
  if (diff <= 3 * 60 * 60 * 1000) return "hours";
  if (diff <= 24 * 60 * 60 * 1000) return "tomorrow";
  if (diff <= 7 * 24 * 60 * 60 * 1000) return "week";
  return "";
}

function checkReminders() {
  const reminders = loadObject(REMINDERS_KEY);
  let changed = false;
  events.forEach((event) => {
    const reminder = reminders[event.id];
    if (!reminder?.enabled || isEventPast(event)) return;
    const stage = reminderStage(event);
    if (!stage || reminder.lastStage === stage) return;
    const messages = {
      week: `Falta menos de una semana para ${event.name}`,
      tomorrow: `${event.name} es mañana`,
      hours: `Faltan pocas horas para ${event.name}`,
      today: `${event.name} es hoy. Ten tu entrada lista`,
    };
    reminder.lastStage = stage;
    changed = true;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Festholic", { body: messages[stage], icon: "icon-192.png" });
    } else {
      toast(messages[stage]);
    }
  });
  if (changed) saveObject(REMINDERS_KEY, reminders);
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

function addChatMessage(text, role = "assistant") {
  const message = document.createElement("div");
  message.className = `fan-chat__message ${role}`;
  const bubble = document.createElement("p");
  bubble.textContent = text;
  message.appendChild(bubble);
  $("#fanChatMessages").appendChild(message);
  $("#fanChatMessages").scrollTop = $("#fanChatMessages").scrollHeight;
}

function normalizeChatText(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function chatEventFromQuestion(question) {
  const normalized = normalizeChatText(question);
  return events.find((event) => normalized.includes(normalizeChatText(event.name)));
}

function getChatReply(question) {
  const normalized = normalizeChatText(question);
  const upcoming = sortedEvents().filter((event) => !isEventPast(event));
  const past = sortedEvents().filter(isEventPast).reverse();
  const mentioned = chatEventFromQuestion(question);
  const target = mentioned || upcoming[0];
  const name = profile.name?.trim()?.split(/\s+/)[0];

  if (/hola|buenas|hey|holi/.test(normalized)) {
    return `¡Hola${name ? `, ${name}` : ""}! Puedo ayudarte con tus eventos, entradas, ubicaciones y preparativos.`;
  }
  if (/proximo|siguiente|cuando|fecha|falta/.test(normalized)) {
    if (!target) return "No tienes próximos eventos guardados. Puedes agregar uno desde el botón +.";
    return `Tu próximo evento es ${target.name}, el ${formatDate(target.date)}, en ${target.venue}. ${countdownSummary(countdown(target.date)).main}.`;
  }
  if (/entrada|ticket|qr|boleto/.test(normalized)) {
    if (!target) return "Aún no tienes un próximo evento al que pueda asociar una entrada.";
    return ticketStatus.has(target.id)
      ? `Sí, tu entrada para ${target.name} está guardada y disponible incluso sin conexión. Puedes abrirla desde la tarjeta del evento.`
      : `Todavía no hay una entrada guardada para ${target.name}. Entra al evento y selecciona “Mi entrada” para agregarla.`;
  }
  if (/como lleg|ubicacion|direccion|donde|mapa|lugar/.test(normalized)) {
    if (!target) return "Primero agrega un próximo evento para poder mostrarte su ubicación.";
    return `${target.name} será en ${target.venue}. Abre el evento y toca “Cómo llegar” para ver el mapa y abrir la ruta en Google Maps.`;
  }
  if (/llevar|checklist|prepar|necesito/.test(normalized)) {
    return "Para el evento: lleva tu DNI, guarda tu entrada, carga el celular al 100% y libera espacio para fotos y videos. Puedes marcar cada punto en el checklist del inicio.";
  }
  if (/pasado|anteriores|recuerdo/.test(normalized)) {
    if (!past.length) return "Todavía no tienes eventos pasados guardados.";
    return `Tienes ${past.length} evento${past.length === 1 ? "" : "s"} pasado${past.length === 1 ? "" : "s"}. El más reciente fue ${past[0].name}. Puedes verlos en la pestaña Pasados.`;
  }
  if (/cuantos|lista|eventos|agenda/.test(normalized)) {
    if (!upcoming.length) return "Tu agenda no tiene próximos eventos por ahora.";
    return `Tienes ${upcoming.length} próximo${upcoming.length === 1 ? " evento" : "s eventos"}: ${upcoming.map((event) => event.name).join(", ")}.`;
  }
  if (/perfil|nombre|ciudad|cuenta/.test(normalized)) {
    return profile.name
      ? `Tu perfil está registrado como ${profile.name}${profile.city ? ` en ${profile.city}` : ""}. Puedes actualizarlo desde Perfil.`
      : "Aún no has completado tu perfil. Puedes agregar tu nombre y ciudad desde la sección Perfil.";
  }
  return "Puedo ayudarte con tu próximo evento, entrada, ubicación, checklist o eventos pasados. Prueba preguntándome: “¿Dónde será mi próximo evento?”.";
}

function openFanChat() {
  hideChatNudge();
  const chat = $("#fanChat");
  chat.classList.add("open");
  chat.setAttribute("aria-hidden", "false");
  $("#fanChatLauncher").setAttribute("aria-expanded", "true");
  if (!$("#fanChatMessages").children.length) {
    const name = profile.name?.trim()?.split(/\s+/)[0];
    addChatMessage(`¡Hola${name ? `, ${name}` : ""}! Soy tu asistente de Festholic. ¿En qué te ayudo?`);
  }
  setTimeout(() => $("#fanChatInput").focus(), 180);
}

function closeFanChat() {
  $("#fanChat").classList.remove("open");
  $("#fanChat").setAttribute("aria-hidden", "true");
  $("#fanChatLauncher").setAttribute("aria-expanded", "false");
}

function askFanAssistant(question) {
  const value = question.trim();
  if (!value) return;
  addChatMessage(value, "user");
  $("#fanChatInput").value = "";
  window.setTimeout(() => addChatMessage(getChatReply(value)), 280);
}

function getChatNudges() {
  const upcoming = sortedEvents().filter((event) => !isEventPast(event));
  const next = upcoming[0];
  if (!next) return ["Tu agenda está libre. ¿Agregamos tu próximo evento?"];
  const eventDate = new Date(next.date);
  const today = new Date();
  const days = Math.max(0, Math.ceil((eventDate - today) / 86400000));
  let completedPrep = 0;
  try {
    completedPrep = new Set(JSON.parse(localStorage.getItem(PREP_KEY) || "[]")).size;
  } catch {}
  const nudges = [];

  if (days === 0) nudges.push(`¡${next.name} es hoy! ¿Todo listo?`);
  else if (days === 1) nudges.push(`¡${next.name} es mañana! ¿Listo para disfrutar?`);
  else if (days <= 7) nudges.push(`Faltan ${days} días para ${next.name}. ¡Ya casi!`);
  else nudges.push(`Tu próximo evento, ${next.name}, es en ${days} días.`);

  if (!ticketStatus.has(next.id)) nudges.push(`Aún falta guardar tu entrada para ${next.name}.`);
  if (completedPrep < 4) nudges.push(`Te faltan ${4 - completedPrep} punto${4 - completedPrep === 1 ? "" : "s"} del checklist.`);
  if (days <= 2 && completedPrep < 4) nudges.push("¿DNI, batería y espacio listos para el evento?");
  nudges.push(`¿Quieres saber cómo llegar a ${next.name}?`);
  return nudges;
}

function hideChatNudge() {
  const nudge = $("#fanChatNudge");
  if (!nudge) return;
  nudge.classList.remove("show");
  window.setTimeout(() => { nudge.hidden = true; }, 180);
}

function showNextChatNudge() {
  if ($("#fanChat")?.classList.contains("open") || document.hidden) return;
  const nudges = getChatNudges();
  activeChatNudge = nudges[chatNudgeIndex % nudges.length];
  chatNudgeIndex += 1;
  setText("#fanChatNudgeText", activeChatNudge);
  const nudge = $("#fanChatNudge");
  nudge.hidden = false;
  requestAnimationFrame(() => nudge.classList.add("show"));
  window.setTimeout(hideChatNudge, 8500);
}

document.addEventListener("click", async (click) => {
  const logoutButton = click.target.closest("#fanLogoutBtn");
  if (logoutButton) {
    logoutButton.disabled = true;
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    window.location.href = "/login";
    return;
  }
  if (click.target.closest("[data-chat-nudge-close]")) {
    click.stopPropagation();
    return hideChatNudge();
  }
  if (click.target.closest("#fanChatNudge")) {
    hideChatNudge();
    openFanChat();
    if (activeChatNudge) window.setTimeout(() => addChatMessage(activeChatNudge), 120);
    return;
  }
  if (click.target.closest("#fanChatLauncher")) return openFanChat();
  if (click.target.closest("#fanChatClose")) return closeFanChat();
  const chatQuestion = click.target.closest("[data-chat-question]");
  if (chatQuestion) return askFanAssistant(chatQuestion.dataset.chatQuestion);
  const viewControl = click.target.closest("[data-fan-view]");
  if (viewControl) {
    click.preventDefault();
    activeFanView = viewControl.dataset.fanView;
    activeTimeline = "upcoming";
    document.querySelectorAll("[data-fan-view]").forEach((item) => {
      const active = item.dataset.fanView === activeFanView;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-timeline-link]").forEach((item) => {
      item.classList.remove("active");
      item.removeAttribute("aria-current");
    });
    if (activeFanView === "profile") renderProfilePage();
    renderEvents();
    closeSidebar();
    scrollFanViewToTop();
    return;
  }
  const timelineControl = click.target.closest("[data-timeline-tab], [data-timeline-link]");
  if (timelineControl) {
    click.preventDefault();
    activeTimeline = timelineControl.dataset.timelineTab || timelineControl.dataset.timelineLink;
    if (activeTimeline === "past") {
      activeFanView = "events";
      document.querySelectorAll("[data-fan-view]").forEach((item) => {
        item.classList.remove("active");
        item.removeAttribute("aria-current");
      });
      document.querySelectorAll("[data-timeline-link]").forEach((item) => {
        const active = item.dataset.timelineLink === "past";
        item.classList.toggle("active", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
    }
    renderEvents();
    closeSidebar();
    scrollFanViewToTop();
    return;
  }
  const add = click.target.closest("#addEventTopBtn, [data-add-event]");
  if (add) return openEventModal();
  if (click.target.closest("#menuBtn")) {
    $("#fanSidebar")?.classList.add("open");
    $("#sidebarBackdrop")?.classList.add("open");
    return;
  }
  if (click.target.closest("#sidebarBackdrop")) return closeSidebar();
  if (click.target.closest(".fan-nav a")) closeSidebar();
  if (click.target.closest("#profileBtn, #profileCard, #headerProfileBtn, [data-mobile-profile]")) {
    closeSidebar();
    activeFanView = "profile";
    activeTimeline = "upcoming";
    document.querySelectorAll("[data-fan-view]").forEach((item) => {
      const active = item.dataset.fanView === "profile";
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    renderProfilePage();
    renderEvents();
    scrollFanViewToTop();
    return;
  }
  if (click.target.closest("#ticketQuickBtn")) {
    if (!events.length) return openEventModal();
    return handleTicket(events[0].id);
  }
  if (click.target.closest("[data-close-modal]")) return $("#eventModal").close();
  if (click.target.closest("[data-close-profile]")) return $("#profileModal").close();
  if (click.target.closest("[data-close-quick-ticket]")) return $("#quickTicketModal").close();
  if (click.target.closest("[data-close-ticket-access]")) return $("#ticketAccessModal").close();
  if (click.target.closest("#openStoredTicketBtn")) return openStoredTicket();
  if (click.target.closest("[data-close-ticket-viewer]")) return closeTicketViewer();
  if (click.target.closest("[data-close-event-detail]")) return $("#eventDetailModal").close();
  if (click.target.closest("[data-close-route]")) {
    $("#routeModal").close();
    $("#routeMapFrame").src = "";
    return;
  }
  if (click.target.closest("#todayTicketBtn")) return handleTicket($("#todayTicketBtn").dataset.eventId);
  if (click.target.closest("#detailTicketBtn")) {
    $("#eventDetailModal").close();
    return handleTicket(activeDetailEventId);
  }
  if (click.target.closest("#detailRouteBtn")) {
    const event = events.find((item) => item.id === activeDetailEventId);
    if (event) {
      const query = encodeURIComponent(event.venue);
      $("#eventDetailModal").close();
      setText("#routeModalTitle", event.name);
      setText("#routeModalAddress", event.venue);
      $("#routeMapFrame").src = `https://www.google.com/maps?q=${query}&output=embed`;
      $("#routeModalOpen").href = `https://www.google.com/maps/search/?api=1&query=${query}`;
      $("#routeModal").showModal();
      window.lucide?.createIcons();
    }
    return;
  }
  if (click.target.closest("#detailReminderBtn")) return toggleReminder(activeDetailEventId);
  const edit = click.target.closest("[data-edit]");
  if (edit) return openEventModal(events.find((event) => event.id === edit.dataset.edit));
  const ticket = click.target.closest("[data-ticket]");
  if (ticket) return handleTicket(ticket.dataset.ticket);
  const spotify = click.target.closest("[data-spotify]");
  if (spotify) return window.open(spotify.dataset.spotify, "_blank", "noopener");
  const detail = click.target.closest("[data-open-event-detail]");
  if (detail) return openEventDetail(detail.dataset.openEventDetail);
  const prep = click.target.closest("[data-prep]");
  if (prep) {
    const selected = new Set(JSON.parse(localStorage.getItem(PREP_KEY) || "[]"));
    selected.has(prep.dataset.prep) ? selected.delete(prep.dataset.prep) : selected.add(prep.dataset.prep);
    localStorage.setItem(PREP_KEY, JSON.stringify([...selected]));
    scheduleFanWorkspaceSync();
    renderPrep();
  }
});

$("#fanChatForm")?.addEventListener("submit", (submit) => {
  submit.preventDefault();
  askFanAssistant($("#fanChatInput").value);
});

$("#eventMemoryNote").addEventListener("input", (input) => {
  if (!activeDetailEventId) return;
  const notes = loadObject(NOTES_KEY);
  notes[activeDetailEventId] = input.target.value;
  saveObject(NOTES_KEY, notes);
});

$("#quickTicketFile").addEventListener("change", (change) => {
  const file = change.target.files[0];
  $("#quickTicketFileName").textContent = file ? file.name : "PDF o imagen, máximo 20 MB";
});

$("#quickTicketForm").addEventListener("submit", async (submit) => {
  submit.preventDefault();
  const eventId = $("#quickTicketEventId").value;
  const file = $("#quickTicketFile").files[0];
  if (!file) return toast("Selecciona una entrada");
  if (file.size > 20 * 1024 * 1024) return toast("La entrada no debe superar 20 MB");
  const button = $("#saveQuickTicketBtn");
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-circle"></i>Guardando...`;
  window.lucide?.createIcons();
  try {
    await putTicket(eventId, file);
    ticketStatus.add(eventId);
    $("#quickTicketModal").close();
    renderEvents();
    toast("Entrada guardada");
  } finally {
    button.disabled = false;
    button.innerHTML = `<i data-lucide="save"></i>Guardar entrada`;
    window.lucide?.createIcons();
  }
});

$("#eventForm").addEventListener("submit", async (submit) => {
  submit.preventDefault();
  const currentId = $("#eventId").value;
  const id = currentId || `fan-${Date.now()}`;
  const imageFile = $("#eventImageFile").files[0];
  let image = $("#eventImageFile").dataset.defaultImage || (events.find((event) => event.id === id)?.image || "fan-mana.png");
  if (imageFile) {
    if (!imageFile.type.startsWith("image/") || imageFile.size > 8 * 1024 * 1024) return toast("La portada debe ser una imagen de máximo 8 MB");
    image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(imageFile); });
  }
  const record = {
    id,
    name: $("#eventName").value.trim(),
    venue: $("#eventVenue").value.trim(),
    date: $("#eventDate").value,
    theme: $("#eventTheme").value,
    image,
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

$("#profilePageForm")?.addEventListener("submit", async (submit) => {
  submit.preventDefault();
  const button = submit.submitter;
  if (button) button.disabled = true;
  try {
    const account = await window.FestholicAccount.update($("#profilePageNameInput").value.trim(), $("#profilePageEmailInput").value.trim());
  profile = {
    ...profile,
    name: account.name,
    email: account.email,
    pendingEmail: account.pendingEmail || "",
    city: $("#profilePageCityInput").value.trim(),
    social: $("#profilePageSocialInput").value.trim(),
    phone: $("#profilePagePhoneInput").value.trim(),
    reminders: $("#profilePageReminders").checked,
    news: $("#profilePageNews").checked,
  };
  saveProfile();
  renderProfile();
  renderProfilePage();
  toast(account.pendingEmail ? "Perfil guardado · correo pendiente" : "Perfil actualizado");
  } catch (error) {
    toast(error.message || "No se pudo actualizar el perfil");
  } finally {
    if (button) button.disabled = false;
  }
});

$("#deleteEventBtn").addEventListener("click", async () => {
  const id = $("#eventId").value;
  if (!id || !confirm("¿Eliminar este evento y su entrada guardada?")) return;
  events = events.filter((event) => event.id !== id);
  saveEvents();
  await deleteTicket(id);
  ticketStatus.delete(id);
  [COMPANIONS_KEY, REMINDERS_KEY, NOTES_KEY].forEach((key) => {
    const values = loadObject(key);
    delete values[id];
    saveObject(key, values);
  });
  $("#eventModal").close();
  renderEvents();
  toast("Evento eliminado");
});

async function start() {
  await hydrateFanWorkspace();
  events = loadEvents();
  profile = loadProfile();
  try {
    const account = await window.FestholicAccount.load();
    profile = { ...profile, name: account.name, email: account.email, pendingEmail: account.pendingEmail || "", avatarUrl: account.avatarUrl || profile.avatarUrl || "" };
    saveProfile();
  } catch (error) { console.warn("Account profile", error); }
  await refreshTicketStatus();
  renderProfile();
  renderEvents();
  renderPrep();
  checkReminders();
  setInterval(updateCountdowns, 1000);
  setInterval(checkReminders, 15 * 60 * 1000);
  setTimeout(showNextChatNudge, 2200);
  setInterval(showNextChatNudge, 45000);
  await window.FestholicLoader?.ready?.();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js?v=20260913221616", { updateViaCache: "none" }).catch(() => {});
  }
}

start();



