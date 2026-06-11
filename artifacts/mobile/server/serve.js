/**
 * Servidor de producción adaptado para el Juego de Penales Luna Negra.
 * Sirve el archivo index.html del juego en la raíz y los archivos estáticos.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// Apuntamos a la raíz del repositorio donde está el index.html de tu juego
const JUEGO_ROOT = path.resolve(__dirname, "..", ".."); 
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
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = path.join(JUEGO_ROOT, safePath);

  // Si piden la raíz "/", les mandamos el index.html del juego de penales
  if (urlPath === "/") {
    filePath = path.join(JUEGO_ROOT, "index.html");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Archivo no encontrado en el servidor del juego");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  // Cualquier petición se maneja buscando los archivos de tu juego
  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Servidor del Juego de Penales corriendo en el puerto ${port}`);
});