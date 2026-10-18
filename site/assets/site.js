// Store list: the ONLY place to edit when a store goes live (set live: true).
// review 는 확장의 STORE_REVIEW_URLS(src/ui/popup/logic.ts)와 같게 둔다.
var STORES = [
  { id: 'chrome', name: 'Chrome', url: 'https://chromewebstore.google.com/detail/nakgmloofpboegibcjhainbpjjokmbgj', review: 'https://chromewebstore.google.com/detail/nakgmloofpboegibcjhainbpjjokmbgj/reviews', live: true },
  { id: 'edge', name: 'Edge', url: 'https://microsoftedge.microsoft.com/addons/detail/edipphpgdmfabonchodjfnejlbjoknhh', review: 'https://microsoftedge.microsoft.com/addons/detail/edipphpgdmfabonchodjfnejlbjoknhh', live: true },
  { id: 'firefox', name: 'Firefox', url: 'https://addons.mozilla.org/firefox/addon/popout-authenticator/', review: 'https://addons.mozilla.org/firefox/addon/popout-authenticator/reviews/', live: true },
  { id: 'whale', name: 'Whale', url: 'https://store.whale.naver.com/detail/bcfobdldplagmohdgaiocjddlokiolgc', review: 'https://store.whale.naver.com/detail/bcfobdldplagmohdgaiocjddlokiolgc', live: true },
  { id: 'safari', name: 'Safari (macOS)', url: 'https://apps.apple.com/app/id6823010294', review: 'https://apps.apple.com/app/id6823010294?action=write-review', live: false }
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

  document.querySelectorAll('.stores:not(.reviews)').forEach(function (box) {
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

  // 평가 남기기: 공개된 스토어의 리뷰 주소만 단추로 보이고, 하나도 없으면 상자째 숨긴 채 둔다.
  var rateOn = lang === 'ko' ? '평가' : 'Review on';
  document.querySelectorAll('.review-ask').forEach(function (ask) {
    var box = ask.querySelector('.reviews');
    if (!box) return;
    var campaign = box.getAttribute('data-campaign') || 'pa-review';
    box.textContent = '';
    STORES.forEach(function (s) {
      if (!s.live) return;
      var a = document.createElement('a');
      a.className = 'store store-review';
      a.href = withUtm(s.review, campaign);
      a.rel = 'noopener';
      a.textContent = lang === 'ko' ? s.name + ' ' + rateOn : rateOn + ' ' + s.name;
      box.appendChild(a);
    });
    if (box.firstChild) ask.hidden = false;
  });

  // data-autoplay 영상은 화면에 보일 때만 소리 없이 돌리고(preload="none" 이라 그때 받는다),
  // 움직임 줄이기를 켠 사람에게는 포스터만 보여 준다.
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clips = document.querySelectorAll('video[data-autoplay]');
  if (!still && clips.length && 'IntersectionObserver' in window) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) {
          if (v.dataset.stopped) return;
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        } else if (!v.paused) {
          v.dataset.auto = '1';
          v.pause();
        }
      });
    }, { threshold: 0.5 });
    clips.forEach(function (v) {
      // 사람이 직접 멈추면 다시 보일 때 저절로 돌리지 않는다.
      v.addEventListener('pause', function () {
        if (v.dataset.auto) delete v.dataset.auto;
        else if (!v.ended) v.dataset.stopped = '1';
      });
      v.addEventListener('play', function () { delete v.dataset.stopped; });
      seen.observe(v);
    });
  }

  if (incoming.length) {
    document.querySelectorAll('a[data-keep-utm]').forEach(function (a) {
      var u = new URL(a.getAttribute('href'), window.location.href);
      incoming.forEach(function (p) { u.searchParams.set(p[0], p[1]); });
      a.href = u.toString();
    });
  }
})();
