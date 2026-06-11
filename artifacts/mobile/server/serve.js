/**
 * Servidor de diagnóstico Fase 2 - Buscando el index.html
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// Dejamos la raíz del proyecto
const JUEGO_ROOT = path.resolve(__dirname, "..", "..", ".."); 
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");

  // PROBAMOS BUSCAR EL INDEX ADENTRO DE ARTIFACTS/MOBILE O DONDE ESTÉ EL FRONTEND
  // Si no funciona, el diagnóstico nos va a mostrar qué hay adentro de 'artifacts'
  let filePath = path.join(JUEGO_ROOT, safePath);

  if (urlPath === "/") {
    // Intentamos apuntar a donde debería estar el HTML del juego
    filePath = path.join(JUEGO_ROOT, "artifacts", "mobile", "index.html");

    // Si ahí no existe, probamos en artifacts/api-server/static-build
    if (!fs.existsSync(filePath)) {
      filePath = path.join(JUEGO_ROOT, "artifacts", "api-server", "static-build", "index.html");
    }
  }

  // SI EXISTE, LO MANDA NORMAL
  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "content-type": contentType });
    res.end(content);
    return;
  }

  // SI NO EXISTE, MUESTRA QUÉ HAY ADENTRO DE ARTIFACTS
  res.writeHead(404, { "content-type": "text/html; charset=utf-8" });

  let archivosArtifacts = [];
  let archivosMobile = [];
  try {
    archivosArtifacts = fs.readdirSync(path.join(JUEGO_ROOT, "artifacts"));
    archivosMobile = fs.readdirSync(path.join(JUEGO_ROOT, "artifacts", "mobile"));
  } catch (e) {
    archivosMobile = ["Error leyendo subcarpetas: " + e.message];
  }

  res.end(`
    <div style="font-family: monospace; padding: 20px; background: #1a1a1a; color: #fff; line-height: 1.6;">
      <h2 style="color: #ff4a4a;">🔍 Detective Fase 2: Buscando el HTML</h2>
      <p><b>Intenté cargar sin éxito:</b> <span style="color: #e9c46a;">${filePath}</span></p>
      <p><b>Carpetas dentro de "artifacts":</b> <span style="color: #2a9d8f;">${archivosArtifacts.join(", ")}</span></p>
      <p><b>Archivos dentro de "artifacts/mobile":</b> <span style="color: #e9c46a;">${archivosMobile.join(", ")}</span></p>
      <p><i>Copiame lo que te salga en esta nueva pantalla y ya lo dejamos andando fijo.</i></p>
    </div>
  `);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Servidor de diagnóstico corriendo en puerto ${port}`);
});