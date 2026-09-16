(async () => {
  try {
    const response = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("unauthorized");
    document.documentElement.classList.remove("auth-pending");
  } catch (_) {
    const next = `${location.pathname}${location.search}`;
    location.replace(`/login.html?next=${encodeURIComponent(next)}`);
  }
})();
