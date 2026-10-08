/* sw.js - Service worker: precache explicito y estrategia cache-first. */
'use strict';

var VERSION = 'ajedrez164-v1';
var CACHE = VERSION;

/* Lista versionada de TODOS los archivos de la PWA (rutas relativas al scope). */
var ARCHIVOS = [
  './',
  './index.html',
  './css/app.css',
  './js/engine.js',
  './js/numeros.js',
  './js/ia.js',
  './js/app.js',
  './manifest.webmanifest',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-maskable-512.png',
  './test.html',
  './tests.js'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ARCHIVOS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.map(function (clave) {
        return clave === VERSION ? null : caches.delete(clave);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (ev) {
  var peticion = ev.request;
  if (peticion.method !== 'GET') return;

  var url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  ev.respondWith(
    caches.match(peticion, { ignoreSearch: false }).then(function (guardada) {
      if (guardada) return guardada;

      return fetch(peticion).then(function (respuesta) {
        if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
          var copia = respuesta.clone();
          caches.open(CACHE).then(function (cache) { cache.put(peticion, copia); });
        }
        return respuesta;
      }).catch(function () {
        if (peticion.mode === 'navigate') {
          return caches.match('./index.html').then(function (index) {
            return index || caches.match('./');
          });
        }
        return caches.match(peticion);
      });
    })
  );
});
