// Store list: the ONLY place to edit when a store goes live (set live: true).
var STORES = [
  { id: 'chrome', name: 'Chrome', url: 'https://chromewebstore.google.com/detail/nakgmloofpboegibcjhainbpjjokmbgj', live: true },
  { id: 'edge', name: 'Edge', url: 'https://microsoftedge.microsoft.com/addons/detail/edipphpgdmfabonchodjfnejlbjoknhh', live: true },
  { id: 'firefox', name: 'Firefox', url: 'https://addons.mozilla.org/firefox/addon/popout-authenticator/', live: false },
  { id: 'whale', name: 'Whale', url: 'https://store.whale.naver.com/detail/bcfobdldplagmohdgaiocjddlokiolgc', live: false },
  { id: 'safari', name: 'Safari (macOS)', url: 'https://apps.apple.com/app/id6823010294', live: false }
];

(function () {
  'use strict';
  // 들어온 utm_* 는 모두 그대로 넘기고, 하나도 없을 때만 기본값을 쓴다.
  var incoming = [];
  new URLSearchParams(window.location.search).forEach(function (v, k) {
    if (k.indexOf('utm_') === 0) incoming.push([k, v]);
  });
  var hasIncoming = incoming.length > 0;
  var lang = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2);
  var pending = lang === 'ko' ? '심사 중' : 'in review';

  function withUtm(url, campaign) {
    var u = new URL(url);
    if (hasIncoming) {
      incoming.forEach(function (p) { u.searchParams.set(p[0], p[1]); });
    } else {
      u.searchParams.set('utm_source', 'site');
      u.searchParams.set('utm_medium', 'button');
      u.searchParams.set('utm_campaign', campaign);
    }
    return u.toString();
  }

  document.querySelectorAll('.stores').forEach(function (box) {
    var campaign = box.getAttribute('data-campaign') || 'pa-home';
    box.textContent = '';
    STORES.forEach(function (s) {
      var el;
      if (s.live) {
        el = document.createElement('a');
        el.className = 'store';
        el.href = withUtm(s.url, campaign);
        el.rel = 'noopener';
        el.textContent = s.name;
      } else {
        el = document.createElement('span');
        el.className = 'store store-pending';
        el.textContent = s.name + ' — ' + pending;
      }
      box.appendChild(el);
    });
  });

  if (incoming.length) {
    document.querySelectorAll('a[data-keep-utm]').forEach(function (a) {
      var u = new URL(a.getAttribute('href'), window.location.href);
      incoming.forEach(function (p) { u.searchParams.set(p[0], p[1]); });
      a.href = u.toString();
    });
  }
})();
