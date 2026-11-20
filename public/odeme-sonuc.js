// PayTR return page (merchant_ok_url / merchant_fail_url). PayTR may open it in the top window, inside its
// payment iframe on our payment page, or in the app's in-app browser. The booking is never confirmed here:
// that only happens on the server (PayTR notification / status query). This only routes the customer back.
(function () {
  var query = new URLSearchParams(window.location.search);
  var id = query.get('randevu') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
  var target = '/odeme/' + id + '?paytr=' + (query.get('durum') === 'ok' ? 'ok' : 'hata');

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
  // In the app's in-app browser (kaynak=app) the page stays as is; the app closes it or the customer does.
  if (query.get('kaynak') === 'web' && window.top === window.self) {
    window.location.replace(target);
  }
})();
