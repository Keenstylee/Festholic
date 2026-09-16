const STORAGE_KEY = "iampromote-media-plan-v1";
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const defaultEvents = [
  {
    id: "mana-2026",
    name: "Mana",
    date: "2026-12-02T20:30",
    venue: "Estadio Nacional, Lima",
    image: "fan-mana.png",
    angle: "clasicos, nostalgia y anuncio de grupo de WhatsApp",
    targetVideos: 24,
    targetPosts: 10,
  },
  {
    id: "hugel-2026",
    name: "Hugel",
    date: "2026-10-16T22:00",
    venue: "Paradiso, Lima",
    image: "fan-hugel.png",
    angle: "viralidad, clips cortos y recordatorios de entradas",
    targetVideos: 18,
    targetPosts: 8,
  },
  {
    id: "cochinola-2026",
    name: "Cochinola",
    date: "2026-08-22T17:00",
    venue: "Lima, Peru",
    image: "fan-cochinola.jpg",
    angle: "cartel, artistas confirmados, noticias y codigos",
    targetVideos: 30,
    targetPosts: 12,
  },
];

const defaultMissions = [
  {
    id: "m1",
    eventId: "mana-2026",
    title: "Publicar reel corto con anuncio del grupo",
    channel: "Instagram",
    kind: "video",
    date: todayOffset(0),
    time: "19:00",
    notes: "Hook: si vas a Mana en Lima, entra al grupo para enterarte primero.",
    done: false,
  },
  {
    id: "m2",
    eventId: "cochinola-2026",
    title: "Preparar noticia web con datos oficiales",
    channel: "Noticia web",
    kind: "news",
    date: todayOffset(1),
    time: "12:00",
    notes: "Titulo SEO, portada, flyer y cierre con entradas/código.",
    done: false,
  },
  {
    id: "m3",
    eventId: "hugel-2026",
    title: "Subir TikTok con audio tendencia",
    channel: "TikTok",
    kind: "video",
    date: todayOffset(2),
    time: "20:30",
    notes: "Usar video vertical, CTA a entradas y comentario fijado.",
    done: false,
  },
  {
    id: "m4",
    eventId: "mana-2026",
    title: "Enviar recordatorio al grupo de WhatsApp",
    channel: "WhatsApp",
    kind: "post",
    date: todayOffset(4),
    time: "18:00",
    notes: "Mensaje directo con fecha, lugar, link y recomendacion de seguir IG.",
    done: false,
  },
];

let state = loadState();

function todayOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.missions && saved?.events) return normalizeState(saved);
  } catch {}
  return normalizeState({ events: defaultEvents, missions: defaultMissions });
}

function normalizeState(data) {
  return {
    events: (data.events || []).map((event) => ({
      targetVideos: 20,
      targetPosts: 8,
      ...event,
    })),
    missions: (data.missions || []).map((mission) => ({
      kind: inferKind(mission),
      ...mission,
    })),
  };
}

function inferKind(mission) {
  const text = `${mission?.title || ""} ${mission?.channel || ""}`.toLowerCase();
  if (text.includes("tiktok") || text.includes("reel") || text.includes("video")) return "video";
  if (text.includes("noticia")) return "news";
  if (text.includes("historia") || text.includes("story")) return "story";
  if (text.includes("post") || text.includes("flyer") || text.includes("whatsapp")) return "post";
  return "other";
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
}

function formatEventDate(value) {
  return new Date(value).toLocaleDateString("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function kindLabel(kind) {
  return {
    video: "Video/Reel",
    post: "Post/Flyer",
    news: "Noticia",
    story: "Historia",
    other: "Otro",
  }[kind] || "Otro";
}

function getEvent(id) {
  return state.events.find((event) => event.id === id) || state.events[0];
}

function getEventProgress(event) {
  const missions = state.missions.filter((mission) => mission.eventId === event.id);
  const doneVideos = missions.filter((mission) => mission.done && mission.kind === "video").length;
  const donePosts = missions.filter((mission) => mission.done && mission.kind === "post").length;
  const targetVideos = Number(event.targetVideos || 0);
  const targetPosts = Number(event.targetPosts || 0);
  return {
    targetVideos,
    targetPosts,
    doneVideos,
    donePosts,
    pendingVideos: Math.max(0, targetVideos - doneVideos),
    pendingPosts: Math.max(0, targetPosts - donePosts),
    videoPercent: targetVideos ? Math.min(100, Math.round((doneVideos / targetVideos) * 100)) : 100,
    postPercent: targetPosts ? Math.min(100, Math.round((donePosts / targetPosts) * 100)) : 100,
  };
}

function getTotals() {
  return state.events.reduce((total, event) => {
    const progress = getEventProgress(event);
    total.pendingVideos += progress.pendingVideos;
    total.pendingPosts += progress.pendingPosts;
    return total;
  }, { pendingVideos: 0, pendingPosts: 0 });
}

function getWeekDays() {
  const base = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function sortedMissions() {
  return [...state.missions].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function renderSummary() {
  const active = state.missions.filter((mission) => !mission.done).length;
  const done = state.missions.filter((mission) => mission.done).length;
  const totals = getTotals();
  const priority = state.events
    .map((event) => ({
      ...event,
      pending: getEventProgress(event).pendingVideos + getEventProgress(event).pendingPosts,
    }))
    .sort((a, b) => b.pending - a.pending)[0];

  $("#activeMissionCount").textContent = active;
  $("#doneMissionCount").textContent = done;
  $("#priorityEventName").textContent = priority?.name || "Sin eventos";
  $("#pendingVideoCount").textContent = totals.pendingVideos;
  $("#pendingPostCount").textContent = totals.pendingPosts;
}

function renderCalendar() {
  const today = todayOffset(0);
  $("#calendarGrid").innerHTML = getWeekDays().map((day) => {
    const missions = sortedMissions().filter((mission) => mission.date === day);
    return `
      <article class="day-card ${day === today ? "today" : ""}">
        <header>
          <span>${escapeHtml(formatDate(day))}</span>
          <strong>${missions.length}</strong>
        </header>
        ${missions.length ? missions.map((mission) => `
          <div class="mini-task ${mission.done ? "done" : ""}">
            <span>${escapeHtml(mission.channel)} · ${escapeHtml(mission.time || "")}</span>
            <p>${escapeHtml(mission.title)}</p>
          </div>
        `).join("") : `<div class="mini-task"><span>Libre</span><p>Espacio para reforzar el evento con mas urgencia.</p></div>`}
      </article>
    `;
  }).join("");
}

function renderMissions() {
  const missions = sortedMissions();
  $("#missionList").innerHTML = missions.length ? missions.map((mission) => {
    const event = getEvent(mission.eventId);
    return `
      <article class="mission-card ${mission.done ? "done" : ""}" data-mission-id="${escapeHtml(mission.id)}">
        <button class="mission-check" type="button" data-action="toggle" aria-label="Marcar mision">
          <i data-lucide="check"></i>
        </button>
        <div class="mission-copy">
          <h3>${escapeHtml(mission.title)}</h3>
          <p>${escapeHtml(mission.notes || "Sin notas adicionales.")}</p>
          <div class="mission-meta">
            <span><i data-lucide="radio"></i>${escapeHtml(mission.channel)}</span>
            <span><i data-lucide="layers-3"></i>${escapeHtml(kindLabel(mission.kind))}</span>
            <span><i data-lucide="calendar"></i>${escapeHtml(formatDate(mission.date))}</span>
            <span><i data-lucide="clock"></i>${escapeHtml(mission.time || "Todo el dia")}</span>
            <span><i data-lucide="ticket"></i>${escapeHtml(event?.name || "Evento")}</span>
          </div>
        </div>
        <div class="mission-actions">
          <button type="button" data-action="copy" aria-label="Copiar mision"><i data-lucide="copy"></i></button>
          <button type="button" data-action="delete" aria-label="Eliminar mision"><i data-lucide="trash-2"></i></button>
        </div>
      </article>
    `;
  }).join("") : `<p class="empty-state">Aun no tienes misiones. Crea una para ordenar la difusion de tus eventos.</p>`;
  lucide.createIcons();
}

function renderEvents() {
  $("#eventPlanGrid").innerHTML = state.events.map((event) => {
    const eventDate = new Date(event.date);
    const daysLeft = Math.max(0, Math.ceil((eventDate - new Date()) / 86400000));
    const missions = state.missions.filter((mission) => mission.eventId === event.id);
    const done = missions.filter((mission) => mission.done).length;
    const pending = missions.length - done;
    const progress = getEventProgress(event);
    return `
      <article class="event-plan-card" data-event-id="${escapeHtml(event.id)}">
        <div class="event-plan-cover"><img src="${escapeHtml(event.image)}" alt="${escapeHtml(event.name)}" loading="lazy" /></div>
        <div class="event-plan-body">
          <h3>${escapeHtml(event.name)}</h3>
          <p>${escapeHtml(formatEventDate(event.date))} - ${escapeHtml(event.venue)}</p>
          <p>${escapeHtml(event.angle)}</p>
          <div class="campaign-progress">
            <div class="progress-row">
              <header><span>Videos</span><strong>${progress.doneVideos}/${progress.targetVideos} - faltan ${progress.pendingVideos}</strong></header>
              <div class="progress-track"><div class="progress-fill" style="--value:${progress.videoPercent}%"></div></div>
            </div>
            <div class="progress-row">
              <header><span>Posts</span><strong>${progress.donePosts}/${progress.targetPosts} - faltan ${progress.pendingPosts}</strong></header>
              <div class="progress-track"><div class="progress-fill" style="--value:${progress.postPercent}%"></div></div>
            </div>
          </div>
          <div class="event-stats">
            <span><strong>${daysLeft}</strong> dias</span>
            <span><strong>${pending}</strong> pendientes</span>
            <span><strong>${done}</strong> hechas</span>
          </div>
          <div class="event-card-actions">
            <button type="button" data-event-action="done-video">+ Video subido</button>
            <button type="button" data-event-action="done-post">+ Post subido</button>
            <button type="button" data-event-action="plan-rest">Planear faltantes</button>
            <button type="button" data-event-action="delete-event">Eliminar</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}
function renderEventOptions() {
  $("#missionEvent").innerHTML = state.events
    .map((event) => `<option value="${escapeHtml(event.id)}">${escapeHtml(event.name)}</option>`)
    .join("");
}

function renderAll() {
  renderSummary();
  renderCalendar();
  renderMissions();
  renderEvents();
  renderEventOptions();
}

async function copyText(text) {
  await navigator.clipboard.writeText(text).catch(() => {});
}

function missionText(mission) {
  const event = getEvent(mission.eventId);
  return [
    `Mision: ${mission.title}`,
    `Evento: ${event?.name || "Evento"}`,
    `Canal: ${mission.channel}`,
    `Tipo: ${kindLabel(mission.kind)}`,
    `Fecha: ${formatDate(mission.date)} ${mission.time || ""}`,
    mission.notes ? `Notas: ${mission.notes}` : "",
  ].filter(Boolean).join("\n");
}

function weeklyPlanText() {
  return sortedMissions()
    .filter((mission) => !mission.done)
    .map(missionText)
    .join("\n\n---\n\n") || "No hay misiones pendientes esta semana.";
}

function openMissionModal() {
  $("#missionForm").reset();
  $("#missionDate").value = todayOffset(0);
  $("#missionTime").value = "19:00";
  $("#missionModal").showModal();
}

function addMission(data) {
  state.missions.push({
    id: `mission-${Date.now()}`,
    done: false,
    ...data,
  });
  saveState();
  renderAll();
}

function openCampaignModal() {
  $("#campaignForm").reset();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 30);
  tomorrow.setHours(20, 0, 0, 0);
  $("#campaignDate").value = tomorrow.toISOString().slice(0, 16);
  $("#campaignVideos").value = 20;
  $("#campaignPosts").value = 8;
  $("#campaignModal").showModal();
}

function dayBetween(start, end, index, total) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(end);
  const days = Math.max(1, Math.floor((endDate - startDate) / 86400000));
  const step = total <= 1 ? 0 : Math.floor((days * index) / Math.max(1, total - 1));
  startDate.setDate(startDate.getDate() + Math.min(days, step));
  return startDate.toISOString().slice(0, 10);
}

function buildCampaignMissions(event) {
  const start = todayOffset(0);
  const created = [];
  const videoCount = Number(event.targetVideos || 0);
  const postCount = Number(event.targetPosts || 0);

  for (let index = 0; index < videoCount; index += 1) {
    created.push({
      id: `campaign-${event.id}-video-${Date.now()}-${index}`,
      eventId: event.id,
      title: `Video ${index + 1}/${videoCount}: ${event.name}`,
      channel: index % 2 ? "TikTok" : "Instagram",
      kind: "video",
      date: dayBetween(start, event.date, index, videoCount),
      time: index % 2 ? "20:00" : "19:00",
      notes: "Subir video corto con hook, dato importante del evento y CTA claro.",
      done: false,
    });
  }

  for (let index = 0; index < postCount; index += 1) {
    created.push({
      id: `campaign-${event.id}-post-${Date.now()}-${index}`,
      eventId: event.id,
      title: `Post ${index + 1}/${postCount}: ${event.name}`,
      channel: "Instagram",
      kind: "post",
      date: dayBetween(start, event.date, index, postCount),
      time: "12:00",
      notes: "Publicar flyer, carrusel o recordatorio con fecha, lugar, entradas y CTA.",
      done: false,
    });
  }

  return created;
}

function addCampaign(data) {
  const event = {
    id: `event-${Date.now()}`,
    image: "fan-mana.png",
    angle: "Anuncio, detalles, contenido viral, recordatorios y ultimo llamado.",
    targetVideos: 0,
    targetPosts: 0,
    ...data,
  };
  state.events.unshift(event);
  state.missions.push(...buildCampaignMissions(event));
  saveState();
  renderAll();
}

function addCompletedUpload(eventId, kind) {
  const event = getEvent(eventId);
  const label = kind === "video" ? "Video" : "Post";
  state.missions.push({
    id: `manual-${Date.now()}`,
    eventId,
    title: `${label} publicado: ${event?.name || "Evento"}`,
    channel: kind === "video" ? "Instagram/TikTok" : "Instagram",
    kind,
    date: todayOffset(0),
    time: new Date().toTimeString().slice(0, 5),
    notes: "Registro rapido creado desde la tarjeta del evento.",
    done: true,
  });
  saveState();
  renderAll();
}

function planRemaining(eventId) {
  const event = getEvent(eventId);
  if (!event) return;
  const missions = state.missions.filter((mission) => mission.eventId === event.id);
  const plannedVideos = missions.filter((mission) => mission.kind === "video").length;
  const plannedPosts = missions.filter((mission) => mission.kind === "post").length;
  const base = {
    ...event,
    targetVideos: Math.max(0, Number(event.targetVideos || 0) - plannedVideos),
    targetPosts: Math.max(0, Number(event.targetPosts || 0) - plannedPosts),
  };
  const planned = buildCampaignMissions(base);
  if (!planned.length) return;
  state.missions.push(...planned);
  saveState();
  renderAll();
}

function seedWeek() {
  const event = state.events[0];
  const base = [
    ["Reel de anuncio con hook fuerte", "Instagram", "video", 0, "19:00", "Video corto, fecha clara y CTA a grupo o entradas."],
    ["Nota web informativa del evento", "Noticia web", "news", 1, "12:00", "Titulo SEO, portada, flyer oficial, detalles y cierre."],
    ["TikTok con pregunta para comentarios", "TikTok", "video", 2, "20:00", "Pregunta simple para activar comentarios y guardar interesados."],
    ["Historia con encuesta o caja de preguntas", "Instagram", "story", 3, "18:30", "Recolectar dudas: precios, zonas, edad minima, horarios."],
    ["Mensaje resumen para WhatsApp", "WhatsApp", "post", 4, "17:00", "Enviar info completa para reducir preguntas repetidas."],
  ];
  const stamp = Date.now();
  state.missions.push(...base.map(([title, channel, kind, offset, time, notes], index) => ({
    id: `seed-${stamp}-${index}`,
    eventId: event.id,
    title,
    channel,
    kind,
    date: todayOffset(offset),
    time,
    notes,
    done: false,
  })));
  saveState();
  renderAll();
}

function closeSidebar() {
  $("#mediaSidebar")?.classList.remove("open");
  $("#sidebarBackdrop")?.classList.remove("open");
}

document.addEventListener("click", async (event) => {
  if (event.target.closest("#menuBtn")) {
    $("#mediaSidebar")?.classList.add("open");
    $("#sidebarBackdrop")?.classList.add("open");
    return;
  }
  if (event.target.closest("#sidebarBackdrop")) return closeSidebar();
  if (event.target.closest(".media-nav a")) closeSidebar();
  if (event.target.closest("#newCampaignBtn")) return openCampaignModal();
  if (event.target.closest("#newMissionBtn")) return openMissionModal();
  if (event.target.closest("#seedWeekBtn")) return seedWeek();
  if (event.target.closest("#copyPlanBtn")) return copyText(weeklyPlanText());
  if (event.target.closest("#clearDoneBtn")) {
    state.missions = state.missions.filter((mission) => !mission.done);
    saveState();
    renderAll();
    return;
  }
  if (event.target.closest("#todayBtn")) {
    $("#missionsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (event.target.closest("[data-close-modal]")) {
    event.target.closest("dialog")?.close();
    return;
  }

  const eventCard = event.target.closest("[data-event-id]");
  const eventAction = event.target.closest("[data-event-action]")?.dataset.eventAction;
  if (eventCard && eventAction) {
    const eventId = eventCard.dataset.eventId;
    if (eventAction === "done-video") addCompletedUpload(eventId, "video");
    if (eventAction === "done-post") addCompletedUpload(eventId, "post");
    if (eventAction === "plan-rest") planRemaining(eventId);
    if (eventAction === "delete-event") {
      state.events = state.events.filter((item) => item.id !== eventId);
      state.missions = state.missions.filter((item) => item.eventId !== eventId);
      saveState();
      renderAll();
    }
    return;
  }

  const card = event.target.closest("[data-mission-id]");
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!card || !action) return;

  const mission = state.missions.find((item) => item.id === card.dataset.missionId);
  if (!mission) return;

  if (action === "toggle") mission.done = !mission.done;
  if (action === "copy") await copyText(missionText(mission));
  if (action === "delete") state.missions = state.missions.filter((item) => item.id !== mission.id);

  saveState();
  renderAll();
});

$("#missionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addMission({
    title: $("#missionTitle").value.trim(),
    eventId: $("#missionEvent").value,
    channel: $("#missionChannel").value,
    kind: $("#missionKind").value,
    date: $("#missionDate").value,
    time: $("#missionTime").value,
    notes: $("#missionNotes").value.trim(),
  });
  $("#missionModal").close();
});

$("#campaignForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addCampaign({
    name: $("#campaignName").value.trim(),
    date: $("#campaignDate").value,
    venue: $("#campaignVenue").value.trim() || "Lugar pendiente",
    image: $("#campaignImage").value,
    targetVideos: Number($("#campaignVideos").value || 0),
    targetPosts: Number($("#campaignPosts").value || 0),
    angle: $("#campaignAngle").value.trim() || "Anuncio, detalles oficiales, recordatorios, contenido viral y ultimo llamado.",
  });
  $("#campaignModal").close();
});

document.addEventListener("DOMContentLoaded", async () => {
  renderAll();
  lucide.createIcons();
  await window.FestholicLoader?.ready?.();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js?v=20260913221616", { updateViaCache: "none" }).catch(() => {});
  }
});

