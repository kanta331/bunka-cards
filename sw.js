/* オフライン用。アプリ本体とデータは先に保存し、開くたびに裏で新しいものに入れ替える。
   中身を更新して公開するときは VERSION を上げる。 */
var VERSION = 'v17';
var CACHE = 'bunka-' + VERSION;
var SHELL = [
  './',
  'index.html',
  'cards.json',
  'aliases.json',
  'cloze.json',
  'dialogues.json',
  'figure.js',
  'figure.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function(e){
  /* 写真（photos/）は cards.json に載っている分をインストール時にまとめて取る */
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.addAll(SHELL).then(function(){ return c.match('cards.json'); }).then(function(r){ return r.json(); }).then(function(cards){
      var files = cards.filter(function(x){ return x.photo && x.photo.file; }).map(function(x){ return encodeURI(x.photo.file); });
      return c.addAll(files);
    });
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k.indexOf('bunka-')===0 && k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

/* 保存済みがあればすぐ返し、裏でネットから取り直して保存を更新する（フォントも同じ扱い） */
self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);
  /* Claude の API は保存しない（network only）。古い答えを返さないため */
  if(url.hostname === 'api.anthropic.com') return;
  var same = url.origin === self.location.origin;
  var font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if(!same && !font) return;

  e.respondWith(
    caches.open(CACHE).then(function(cache){
      return cache.match(req, { ignoreSearch: same }).then(function(hit){
        var net = fetch(req).then(function(res){
          if(res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(function(){ return hit; });
        if(hit) e.waitUntil(net.then(function(){}, function(){}));
        return hit || net;
      });
    })
  );
});
