// PayTR return page (merchant_ok_url / merchant_fail_url). Tested with PayTR's test mode: PayTR moves the
// top window here with a GET, also when its page runs inside our payment iframe. It could also open it inside
// its iframe or in the app's in-app browser, so all three are handled. The booking is never confirmed here:
// that only happens on the server (PayTR notification / status query). This only routes the customer back.
(function () {
  var query = new URLSearchParams(window.location.search);
  var id = query.get('randevu') || '';
  var ok = query.get('durum') === 'ok';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
  var target = '/odeme/' + id + '?paytr=' + (ok ? 'ok' : 'hata');

  // Inside PayTR's iframe on our own payment page: move our top window (same origin) to the payment page.
  if (window.top !== window.self) {
    try {
      if (window.top.location.origin === window.location.origin) {
        window.top.location.replace(target);
        return;
      }
    } catch (e) {
      /* the top window is not ours: stay on this page */
    }
  }

  // Website, opened in the top window: continue on the payment page, which waits for the confirmation.
  if (query.get('kaynak') === 'web' && window.top === window.self) {
    window.location.replace(target);
    return;
  }

  // App (in-app browser): show the result in the phone's language; the app closes this page on its own
  // once the booking is confirmed, or the customer closes it.
  var lang = (navigator.language || 'tr').toLowerCase().indexOf('en') === 0 ? 'en' : 'tr';
  var show = document.getElementById((ok ? 'ok-' : 'hata-') + lang);
  var general = document.getElementById('genel');
  if (show && general) {
    general.hidden = true;
    show.hidden = false;
    document.documentElement.lang = lang;
  }
})();
