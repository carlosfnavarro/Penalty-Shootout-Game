/**
 * Servidor de diagnóstico para el Juego de Penales Luna Negra.
 * Muestra las carpetas en pantalla si no encuentra el index.html.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// Probamos con la ruta subiendo tres niveles
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
  let filePath = path.join(JUEGO_ROOT, safePath);

  if (urlPath === "/") {
    filePath = path.join(JUEGO_ROOT, "index.html");
  }

  // SI EL ARCHIVO EXISTE, LO MANDA NORMAL
  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "content-type": contentType });
    res.end(content);
    return;
  }

  // SI NO EXISTE, MUESTRA ESTE DIAGNÓSTICO EN LA PÁGINA
  res.writeHead(404, { "content-type": "text/html; charset=utf-8" });

  let carpetasVisibles = [];
  try {
    carpetasVisibles = fs.readdirSync(JUEGO_ROOT);
  } catch (e) {
    carpetasVisibles = ["No se pudo leer la carpeta raíz: " + e.message];
  }

  res.end(`
    <div style="font-family: monospace; padding: 20px; background: #1a1a1a; color: #fff; line-height: 1.6;">
      <h2 style="color: #ff4a4a;">🔍 Detective del Servidor</h2>
      <p><b>Ruta donde busqué el juego:</b> <span style="color: #e9c46a;">${filePath}</span></p>
      <p><b>Archivos que encontré en esa raíz:</b></p>
      <ul style="color: #2a9d8f;">
        ${carpetasVisibles.map(f => `<li>${f}</li>`).join("")}
      </ul>
      <p><i>Mandame una captura de esta pantalla para ver la lista y te digo cómo acomodarlo ya mismo.</i></p>
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