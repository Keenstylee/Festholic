(() => {
  const $ = (selector) => document.querySelector(selector);
  let activeQrData = "";
  let activeEventId = "";

  function notify(message, type = "success") {
    if (typeof window.showToast === "function") return window.showToast(message, type);
    if (type === "error") console.error(message); else console.log(message);
  }

  function setStatus(text, tone = "") {
    const box = $("#digitizeQrStatus");
    if (!box) return;
    box.hidden = !text;
    box.textContent = text || "";
    box.className = `qr-digitize-status${tone ? ` is-${tone}` : ""}`;
  }

  function setResult({ tone = "", badge, title, text, meta = "", cleanPng = "", allowCheckin = false }) {
    const panel = $("#digitizeQrResult");
    if (!panel) return;
    panel.hidden = false;
    panel.className = `qr-digitize-result${tone ? ` is-${tone}` : ""}`;
    $("#digitizeQrBadge").textContent = badge;
    $("#digitizeQrResultTitle").textContent = title;
    $("#digitizeQrResultText").textContent = text;
    $("#digitizeQrResultMeta").textContent = meta;
    const preview = $("#digitizeQrPreview");
    preview.innerHTML = cleanPng
      ? `<img src="data:image/png;base64,${cleanPng}" alt="QR reconstruido" />`
      : '<i data-lucide="scan-qr-code"></i>';
    const download = $("#downloadCleanQrBtn");
    download.hidden = !cleanPng;
    if (cleanPng) download.href = `data:image/png;base64,${cleanPng}`;
    $("#digitizeQrCheckinBtn").hidden = !allowCheckin;
    window.lucide?.createIcons?.();
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => resolve({ image, objectUrl });
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("No se pudo leer la imagen")); };
      image.src = objectUrl;
    });
  }

  function imageData(image, scale = 1, enhance = false) {
    const maxSide = 3200;
    const naturalScale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const appliedScale = naturalScale * scale;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * appliedScale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * appliedScale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    if (enhance) {
      for (let index = 0; index < data.data.length; index += 4) {
        const gray = .299 * data.data[index] + .587 * data.data[index + 1] + .114 * data.data[index + 2];
        const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.7 + 128));
        data.data[index] = data.data[index + 1] = data.data[index + 2] = contrast;
      }
    }
    return data;
  }

  async function decodeLocally(image) {
    if ("BarcodeDetector" in window) {
      try {
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        const codes = await detector.detect(image);
        if (codes[0]?.rawValue) return { data: codes[0].rawValue, method: "BarcodeDetector" };
      } catch (_) {}
    }
    for (const attempt of [{ scale: 1, enhance: false }, { scale: 1, enhance: true }, { scale: 1.6, enhance: true }]) {
      try {
        const data = imageData(image, attempt.scale, attempt.enhance);
        const result = window.jsQR?.(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
        if (result?.data) return { data: result.data, method: attempt.enhance ? "jsQR + contraste" : "jsQR" };
      } catch (_) {}
    }
    return null;
  }

  function existingCodes() {
    return ($("#ticketCodes")?.value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  function appendCode(code) {
    const textarea = $("#ticketCodes");
    if (!textarea || !code) return;
    const values = existingCodes();
    if (!values.includes(code)) textarea.value = [...values, code].join("\n");
  }

  async function validateCode(qrData, decoding) {
    const event = window.IAmPromoteInventory?.getCurrentEvent?.();
    activeQrData = qrData;
    activeEventId = event?.id || "";
    if (!event?.id) {
      setResult({ badge: "QR detectado", title: "Código listo", text: "Selecciona un evento para validarlo.", meta: decoding.method, cleanPng: decoding.result?.clean_png_base64 || "" });
      return;
    }
    const response = await fetch("/api/promoter/tickets/validate-qr", {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qr_data: qrData, event_id: event.id }),
    });
    const result = await response.json().catch(() => ({}));
    const cleanPng = decoding.result?.clean_png_base64 || "";
    if (response.status === 404 || result.status === "not_found") {
      setResult({ badge: "Código nuevo", title: "Listo para agregar", text: `No existe aún en ${event.name}. Se añadió al listado de códigos.`, meta: decoding.method, cleanPng });
      return;
    }
    if (!response.ok) throw new Error(result.error || "No se pudo validar el código");
    const ticket = result.ticket || {};
    const buyer = ticket.buyerName ? ` · ${ticket.buyerName}` : "";
    if (result.status === "already_used") {
      const usedAt = result.checkedInAt ? new Date(result.checkedInAt).toLocaleString("es-PE") : "fecha no disponible";
      setResult({ tone: "used", badge: "Ya utilizado", title: ticket.internalCode || "Entrada registrada", text: `El check-in ya fue registrado el ${usedAt}${buyer}.`, meta: decoding.method, cleanPng });
      return;
    }
    setResult({ tone: "valid", badge: "Entrada válida", title: ticket.internalCode || "Ticket encontrado", text: `${ticket.zone || "General"}${buyer}`, meta: decoding.method, cleanPng, allowCheckin: true });
  }

  async function processFile(file, index, total) {
    setStatus(`Analizando imagen ${index + 1} de ${total}...`);
    const { image, objectUrl } = await loadImage(file);
    let decoding;
    try {
      decoding = await decodeLocally(image);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    if (!decoding) throw new Error("No se pudo leer el QR. Prueba con una imagen más nítida, bien iluminada y sin reflejos.");
    appendCode(decoding.data);
    await validateCode(decoding.data, decoding);
    return decoding;
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const button = $("#digitizeQrBtn");
    if (button) button.disabled = true;
    let completed = 0;
    const errors = [];
    for (let index = 0; index < files.length; index += 1) {
      try {
        await processFile(files[index], index, files.length);
        completed += 1;
      } catch (error) {
        errors.push(`${files[index].name}: ${error.message}`);
      }
    }
    if (completed) {
      setStatus(`${completed} de ${files.length} QR digitalizado${completed === 1 ? "" : "s"}.`, errors.length ? "warn" : "ok");
      notify(`${completed} QR digitalizado${completed === 1 ? "" : "s"}.`);
    } else {
      setStatus(errors[0] || "No se pudo leer el QR. Prueba otra fotografía.", "error");
      notify("No se pudo digitalizar el QR.", "error");
    }
    if (button) button.disabled = false;
  }

  async function checkin() {
    if (!activeQrData || !activeEventId) return;
    const button = $("#digitizeQrCheckinBtn");
    button.disabled = true;
    try {
      const response = await fetch("/api/promoter/tickets/checkin", {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_data: activeQrData, event_id: activeEventId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No se pudo registrar el check-in");
      setResult({ tone: "used", badge: "Check-in realizado", title: result.ticket?.internalCode || "Entrada registrada", text: `Ingreso confirmado a las ${new Date(result.checkedInAt).toLocaleTimeString("es-PE")}.`, meta: "Validado por Festholic" });
      notify("Check-in registrado correctamente.");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  function ensureBound() {
    const button = $("#digitizeQrBtn");
    const input = $("#digitizeQrInput");
    if (!button || !input || button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => { handleFiles(input.files); input.value = ""; });
    $("#digitizeQrCheckinBtn")?.addEventListener("click", checkin);
  }

  document.addEventListener("DOMContentLoaded", () => setTimeout(ensureBound, 100));
  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-format="code"]') || event.target.closest("#digitizeQrBtn")) setTimeout(ensureBound, 0);
  });
})();
