// Service Worker(Ver1.3)
// ・サイトの部品(HTML/CSS/JS/アイコン)を端末に保存して、起動を速くする
// ・更新があるときは、まずネットから最新を取る(古い版が残らないようにする)
// ・Supabaseへの通信(注文データ)は保存せず、いつも直接ネットに接続する
const VERSION = "1.3";
const CACHE = "shokken-" + VERSION;

const SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "config.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isSupabaseLib = url.hostname === "cdn.jsdelivr.net";
  // それ以外(Supabase本体のAPIなど)はそのままネットへ
  if (!sameOrigin && !isSupabaseLib) return;

  // ネット優先。つながらないときだけ保存したものを使う
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => {
          if (hit) return hit;
          if (req.mode === "navigate") return caches.match("index.html");
          return Response.error();
        })
      )
  );
});
