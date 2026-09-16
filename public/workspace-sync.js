(function () {
  const timers = new Map();
  async function request(experience, options = {}) {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(experience)}`, {
      credentials: "include",
      cache: "no-store",
      ...options,
    });
    if (response.status === 401) {
      location.replace(`/login.html?next=${encodeURIComponent(location.pathname)}`);
      throw new Error("Sesión vencida");
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "No se pudo sincronizar");
    return result;
  }
  window.FestholicWorkspace = {
    async load(experience) { return (await request(experience)).data; },
    async save(experience, data) {
      return request(experience, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
    },
    schedule(experience, data, delay = 650) {
      clearTimeout(timers.get(experience));
      timers.set(experience, setTimeout(() => {
        this.save(experience, data).catch((error) => console.warn("Workspace sync", error));
      }, delay));
    },
  };
})();

