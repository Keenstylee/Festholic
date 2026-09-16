const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const loginTab = document.querySelector("#loginTab");
const registerTab = document.querySelector("#registerTab");
const authTitle = document.querySelector("#authTitle");
const authSubtitle = document.querySelector("#authSubtitle");
const verificationState = document.querySelector("#verificationState");
const verificationEmail = document.querySelector("#verificationEmail");
const forgotForm = document.querySelector("#forgotForm");
const resetForm = document.querySelector("#resetForm");
const resendButton = document.querySelector("#resendButton");
const verificationResendButton = document.querySelector("#verificationResendButton");
const googleLoginButton = document.querySelector("#googleLoginButton");
const socialAuth = document.querySelector("#socialAuth");
let pendingVerificationEmail = "";

function destination(user = {}) {
  const value = new URLSearchParams(location.search).get("next");
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return ({ attendee: "/fan.html", media: "/media.html", promoter: "/index.html" })[user.experience] || "/experiencia.html";
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function setLoading(button, active, idleLabel, loadingLabel) {
  button.disabled = active;
  button.innerHTML = active
    ? `<i class="spin" data-lucide="loader-circle"></i><span>${loadingLabel}</span>`
    : `<span>${idleLabel}</span><i data-lucide="arrow-right"></i>`;
  window.lucide?.createIcons();
}

function setMode(mode) {
  const registering = mode === "register";
  loginForm.hidden = registering || mode !== "login";
  registerForm.hidden = !registering;
  forgotForm.hidden = mode !== "forgot";
  resetForm.hidden = mode !== "reset";
  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);
  loginTab.setAttribute("aria-selected", String(!registering));
  registerTab.setAttribute("aria-selected", String(registering));
  authTitle.textContent = mode === "forgot" ? "Recupera tu cuenta" : mode === "reset" ? "Nueva contraseña" : registering ? "Crea tu cuenta" : "Inicia sesión";
  authSubtitle.textContent = mode === "forgot" ? "Te enviaremos un enlace seguro." : mode === "reset" ? "Protege nuevamente tu cuenta." : registering ? "Elige tu experiencia y crea tu espacio." : "Accede a tu espacio de trabajo.";
  verificationState.hidden = true;
  socialAuth.hidden = mode === "forgot" || mode === "reset";
  document.querySelector(".auth-tabs").hidden = mode === "forgot" || mode === "reset";
  document.querySelectorAll(".login-error").forEach((element) => { element.hidden = true; });
  resendButton.hidden = true;
}

function showVerification(email) {
  pendingVerificationEmail = email;
  loginForm.hidden = true;
  registerForm.hidden = true;
  socialAuth.hidden = true;
  document.querySelector(".auth-tabs").hidden = true;
  verificationState.hidden = false;
  verificationEmail.textContent = email;
  authTitle.textContent = "Confirma tu cuenta";
  authSubtitle.textContent = "Te enviamos un enlace de activacion.";
}

async function resendVerification(button, email = pendingVerificationEmail) {
  if (!email) return;
  const idle = button.textContent;
  button.disabled = true;
  button.textContent = "Enviando...";
  try {
    const response = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "No se pudo reenviar el correo.");
    button.textContent = "Correo enviado";
    setTimeout(() => { button.textContent = idle; button.disabled = false; }, 2500);
  } catch (error) {
    button.textContent = error.message || "Intenta nuevamente";
    setTimeout(() => { button.textContent = idle; button.disabled = false; }, 3000);
  }
}

googleLoginButton.addEventListener("click", () => {
  const params = new URLSearchParams();
  const next = new URLSearchParams(location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) params.set("next", next);
  const registering = registerTab.classList.contains("active");
  params.set("experience", registering ? new FormData(registerForm).get("experience") || "attendee" : "attendee");
  location.assign(`/api/auth/google?${params}`);
});

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));
resendButton.addEventListener("click", () => resendVerification(resendButton));
verificationResendButton.addEventListener("click", () => resendVerification(verificationResendButton));
document.querySelector("#backToLoginButton").addEventListener("click", () => setMode("login"));
document.querySelector("#forgotPasswordButton").addEventListener("click", () => {
  document.querySelector("#forgotEmail").value = document.querySelector("#email").value;
  setMode("forgot");
});
document.querySelectorAll("[data-back-login]").forEach((button) => button.addEventListener("click", () => {
  history.replaceState({}, "", location.pathname);
  setMode("login");
}));

document.querySelectorAll("[data-password-target], #togglePassword").forEach((button) => {
  button.addEventListener("click", () => {
    const input = button.id === "togglePassword"
      ? document.querySelector("#password")
      : document.querySelector(`#${button.dataset.passwordTarget}`);
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.setAttribute("aria-label", reveal ? "Ocultar contraseña" : "Mostrar contraseña");
    button.innerHTML = `<i data-lucide="${reveal ? "eye-off" : "eye"}"></i>`;
    window.lucide?.createIcons();
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#email");
  const password = document.querySelector("#password");
  const errorBox = document.querySelector("#loginError");
  const button = document.querySelector("#submitButton");
  errorBox.hidden = true;
  if (!email.validity.valid || !password.value) return showError(errorBox, "Ingresa un correo y una contraseña validos.");
  setLoading(button, true, "Ingresar", "Ingresando...");
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value.trim(), password: password.value }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (result.code === "EMAIL_NOT_VERIFIED") {
        pendingVerificationEmail = result.email || email.value.trim();
        resendButton.hidden = false;
      }
      throw new Error(result.error || "No se pudo iniciar sesión.");
    }
    location.replace(destination(result.user));
  } catch (error) {
    showError(errorBox, error.message || "No se pudo conectar. Intenta nuevamente.");
    setLoading(button, false, "Ingresar", "Ingresando...");
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#registerName");
  const email = document.querySelector("#registerEmail");
  const password = document.querySelector("#registerPassword");
  const confirm = document.querySelector("#registerConfirm");
  const errorBox = document.querySelector("#registerError");
  const button = document.querySelector("#registerButton");
  errorBox.hidden = true;
  if (!name.validity.valid || !email.validity.valid || !password.validity.valid) {
    return showError(errorBox, "Completa tus datos y usa una contraseña de al menos 10 caracteres.");
  }
  if (password.value !== confirm.value) return showError(errorBox, "Las contraseñas no coinciden.");
  setLoading(button, true, "Crear cuenta", "Creando cuenta...");
  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.value.trim(), email: email.value.trim(), password: password.value, experience: new FormData(registerForm).get("experience") }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "No se pudo crear la cuenta.");
    if (result.verificationRequired) {
      showVerification(result.email || email.value.trim());
    } else {
      location.replace(destination(result.user));
    }
  } catch (error) {
    showError(errorBox, error.message || "No se pudo conectar. Intenta nuevamente.");
    setLoading(button, false, "Crear cuenta", "Creando cuenta...");
  }
});

forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#forgotEmail");
  const errorBox = document.querySelector("#forgotError");
  const success = document.querySelector("#forgotSuccess");
  const button = document.querySelector("#forgotSubmit");
  errorBox.hidden = success.hidden = true;
  if (!email.validity.valid) return showError(errorBox, "Ingresa un correo valido.");
  setLoading(button, true, "Enviar enlace", "Enviando...");
  try {
    const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.value.trim() }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "No se pudo enviar el enlace.");
    success.textContent = result.message;
    success.hidden = false;
  } catch (error) { showError(errorBox, error.message); }
  finally { setLoading(button, false, "Enviar enlace", "Enviando..."); }
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#resetPassword");
  const confirm = document.querySelector("#resetConfirm");
  const errorBox = document.querySelector("#resetError");
  const success = document.querySelector("#resetSuccess");
  const button = document.querySelector("#resetSubmit");
  errorBox.hidden = success.hidden = true;
  if (!password.validity.valid) return showError(errorBox, "Usa al menos 10 caracteres.");
  if (password.value !== confirm.value) return showError(errorBox, "Las contraseñas no coinciden.");
  setLoading(button, true, "Guardar contraseña", "Guardando...");
  try {
    const token = new URLSearchParams(location.search).get("reset");
    const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: password.value }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "No se pudo actualizar la contraseña.");
    success.textContent = result.message;
    success.hidden = false;
    resetForm.querySelectorAll("input,button[type=submit]").forEach((element) => { element.disabled = true; });
  } catch (error) { showError(errorBox, error.message); }
  finally { if (success.hidden) setLoading(button, false, "Guardar contraseña", "Guardando..."); }
});

document.addEventListener("DOMContentLoaded", async () => {
  window.lucide?.createIcons();
  if (new URLSearchParams(location.search).has("reset")) setMode("reset");
  const googleError = new URLSearchParams(location.search).get("google_error");
  if (googleError) {
    const messages = {
      not_configured: "El acceso con Google aún no está configurado.",
      cancelled: "El acceso con Google fue cancelado.",
      invalid_state: "La solicitud de Google venció o no es válida. Intenta nuevamente.",
      account_disabled: "Esta cuenta se encuentra desactivada.",
      account_conflict: "Ese correo ya está vinculado con otra cuenta de Google.",
      failed: "No pudimos iniciar sesión con Google. Intenta nuevamente.",
    };
    const notice = document.createElement("div");
    notice.className = "login-error";
    notice.textContent = messages[googleError] || messages.failed;
    document.querySelector(".auth-tabs").before(notice);
  }
  const verification = new URLSearchParams(location.search).get("verification");
  if (verification) {
    const notice = document.createElement("div");
    notice.className = verification === "success" ? "auth-notice" : "login-error";
    notice.textContent = verification === "success"
      ? "Correo confirmado. Ya puedes iniciar sesión."
      : verification === "expired"
        ? "El enlace vencio. Ingresa tus datos y solicita uno nuevo."
        : "El enlace de verificacion no es valido.";
    document.querySelector(".auth-tabs").before(notice);
  }
  if (location.protocol === "file:") return;
  try {
    const response = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
    if (response.ok) location.replace(destination((await response.json()).user));
  } catch (_) {}
});
