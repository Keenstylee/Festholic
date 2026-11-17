import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerSource = await readFile(
  new URL("../cloudflare/src/index.js", import.meta.url),
  "utf8",
);
const { default: worker } = await import(
  `data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`
);

test("GET / redirige a la selección de experiencia", async () => {
  const response = await worker.fetch(
    new Request("https://festholic.test/"),
    {},
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://festholic.test/experiencia",
  );
});

test("GET /api/health devuelve el estado del Worker", async () => {
  const response = await worker.fetch(
    new Request("https://festholic.test/api/health"),
    {},
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "iampromote-api",
  });
});

test("las rutas privadas rechazan solicitudes sin sesión", async () => {
  const response = await worker.fetch(
    new Request("https://festholic.test/api/events"),
    {},
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "No autorizado" });
});
