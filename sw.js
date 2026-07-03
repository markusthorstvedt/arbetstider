// Service worker för Nils & Vidar – Arbetstider
// 1) Cachar appskalet så appen går att öppna offline / installera på hemskärmen.
// 2) Best-effort bakgrundskoll av schemat via Periodic Background Sync, för
//    webbläsare/OS som stödjer det (i praktiken Chrome/Android, installerad PWA).
//    På t.ex. iOS Safari saknas stöd — där sköts kollen istället av sidan själv
//    (foreground-polling var 5:e minut, se index.html).

const CACHE_NAME = "arbetstider-shell-v1";
const DATA_CACHE  = "arbetstider-data-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTmVn336HAXYDHUCJE-_fBO1ZjJeqmdjuZ2Gz0OXmzOoP93B7lNYj9xKQIB0PjHnxSE2HewugTmH5cW/pub?gid=0&single=true&output=csv";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== DATA_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Schemat ändras ofta — hämta alltid färskt om möjligt, fall tillbaka på cache offline.
  if (url.includes("docs.google.com/spreadsheets")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Appskalet: cache-first för snabb start / offline-stöd.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

async function checkForScheduleChange() {
  try {
    const res = await fetch(CSV_URL + "&cachebust=" + Date.now());
    if (!res.ok) return;
    const text = await res.text();

    const cache    = await caches.open(DATA_CACHE);
    const prevResp = await cache.match("last-csv");
    const prevText = prevResp ? await prevResp.text() : null;
    await cache.put("last-csv", new Response(text));

    if (prevText !== null && prevText !== text) {
      await self.registration.showNotification("Schemat har uppdaterats", {
        body: "Nya tider finns för Nils & Vidar.",
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
      });
    }
  } catch (e) {
    // Offline eller nätverksfel — försöker igen vid nästa sync/poll.
  }
}

// Bakgrundskoll för webbläsare som stödjer Periodic Background Sync.
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-schedule") {
    event.waitUntil(checkForScheduleChange());
  }
});

// Reservväg: sidan kan be service workern köra samma koll (t.ex. vid manuell
// uppdatering), via navigator.serviceWorker.controller.postMessage(...).
self.addEventListener("message", (event) => {
  if (event.data === "check-schedule") {
    checkForScheduleChange();
  }
});
