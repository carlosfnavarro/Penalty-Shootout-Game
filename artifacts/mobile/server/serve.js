/**
 * Servidor de producción híbrido - Soporta dist y web-build
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const MOBILE_ROOT = path.resolve(__dirname, "..");
// Revisa si existe 'dist', si no, usa 'web-build'
const JUEGO_ROOT = fs.existsSync(path.join(MOBILE_ROOT, "dist")) 
  ? path.join(MOBILE_ROOT, "dist") 
  : path.join(MOBILE_ROOT, "web-build");

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

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("La compilacion de Expo todavia no se encuentra en: " + filePath + "\nVerifica el Build Command en Render.");
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

  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${port}`);
});