document.addEventListener("click", (event) => {
  const option = event.target.closest("[data-experience]");
  if (!option) return;

  const experience = String(option.dataset.experience || "").toLowerCase();
  const destinations = {
    attendee: "/fan.html",
    promoter: "/promotor",
    media: "/media",
  };
  const destination = destinations[experience];
  if (!destination) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  option.href = destination;
  option.dataset.loading = "true";
  option.setAttribute("aria-busy", "true");
  localStorage.setItem("festholic-preferred-experience", experience);

  // El enlace navega inmediatamente; keepalive permite que Cloudflare termine
  // de guardar la preferencia aun cuando la página ya esté cambiando.
  fetch("/api/auth/profile", {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ experience }),
  }).catch(() => {});

  window.location.assign(destination);
});
