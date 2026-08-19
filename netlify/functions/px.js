// Proxy générique vers les domaines LNH / PuckPedia, avec des en-têtes
// de navigateur normal pour éviter le blocage anti-bot (erreur 403) que
// ces sites renvoient aux requêtes provenant d'infrastructures cloud
// génériques (Netlify, AWS, etc.) sans en-têtes réalistes.
//
// Appelé via les redirections définies dans netlify.toml :
//   /nhl/*     -> /.netlify/functions/px/nhl/:splat
//   /nhlweb/*  -> /.netlify/functions/px/nhlweb/:splat
//   /search/*  -> /.netlify/functions/px/search/:splat
//   /pp/*      -> /.netlify/functions/px/pp/:splat

const TARGETS = {
  nhl: "https://api.nhle.com/stats/rest/en",
  nhlweb: "https://api-web.nhle.com",
  search: "https://search.d3.nhle.com",
  pp: "https://puckpedia.com",
};

const REFERERS = {
  nhl: "https://www.nhl.com/",
  nhlweb: "https://www.nhl.com/",
  search: "https://www.nhl.com/",
  pp: "https://puckpedia.com/",
};

exports.handler = async (event) => {
  try {
    let p = event.path || "";
    const fnPrefix = "/.netlify/functions/px";
    if (p.startsWith(fnPrefix)) p = p.slice(fnPrefix.length);
    if (p.startsWith("/")) p = p.slice(1);

    const slash = p.indexOf("/");
    const key = slash === -1 ? p : p.slice(0, slash);
    const path = slash === -1 ? "" : p.slice(slash);

    const base = TARGETS[key];
    if (!base) {
      return {
        statusCode: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "unknown_target", key }),
      };
    }

    const qs = event.rawQuery ? "?" + event.rawQuery : "";
    const url = base + path + qs;

    const method = event.httpMethod || "GET";
    const hasBody = method !== "GET" && method !== "HEAD" && event.body;

    const upstream = await fetch(url, {
      method,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8",
        "Referer": REFERERS[key] || base,
        "Origin": REFERERS[key] ? REFERERS[key].replace(/\/$/, "") : base,
        "Content-Type": "application/json",
      },
      body: hasBody
        ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body)
        : undefined,
    });

    const body = await upstream.text();

    return {
      statusCode: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Location, X-jsonblob",
        "Location": upstream.headers.get("location") || "",
        "X-jsonblob": upstream.headers.get("x-jsonblob") || "",
        "Cache-Control": "no-store",
      },
      body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "proxy_failed", message: String(err) }),
    };
  }
};
