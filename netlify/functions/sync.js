// Stockage de la synchro du pool, hébergé directement chez Netlify
// (Netlify Blobs) plutôt que via un service externe (extendsclass /
// jsonblob), qui bloquaient les requêtes ou exigeaient une clé API.
//
// Reproduit le même contrat que les anciens services pour que
// index.html n'ait rien à changer :
//   POST /bin ou /blob            -> crée une entrée, répond {id}
//   GET  /bin/<id> ou /blob/<id>  -> renvoie le contenu JSON stocké
//   PUT  /bin/<id> ou /blob/<id>  -> remplace le contenu stocké

const { getStore } = require("@netlify/blobs");

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

exports.handler = async (event) => {
  try {
    let p = event.path || "";
    const fnPrefix = "/.netlify/functions/sync";
    if (p.startsWith(fnPrefix)) p = p.slice(fnPrefix.length);
    if (p.startsWith("/")) p = p.slice(1);
    const parts = p.split("/").filter(Boolean);
    const id = parts[1] || "";

    const store = getStore({
      name: "pool-sync",
      consistency: "strong",
      siteID: process.env.BLOBS_SITE_ID,
      token: process.env.BLOBS_TOKEN,
    });
    const method = event.httpMethod || "GET";

    if (method === "POST") {
      const newId = randomId();
      const body = event.body || "{}";
      await store.set(newId, body);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ id: newId }),
      };
    }

    if (!id) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "missing_id" }),
      };
    }

    if (method === "GET") {
      const data = await store.get(id);
      if (data === null) {
        return { statusCode: 404, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "not_found" }) };
      }
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
        body: data,
      };
    }

    if (method === "PUT") {
      const body = event.body || "{}";
      await store.set(id, body);
      return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "method_not_allowed" }) };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "sync_failed", message: String(err) }),
    };
  }
};
