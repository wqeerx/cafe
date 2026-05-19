/**
 * Диалоги и уведомления без alert / confirm / prompt
 */
(function () {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureDialog() {
    if (document.getElementById('appDialogModal')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<div id="appDialogModal" class="app-dialog modal" role="dialog" aria-modal="true" aria-hidden="true">' +
        '<div class="app-dialog-content modal-content">' +
          '<h3 class="modal-title" id="appDialogTitle"></h3>' +
          '<p class="app-dialog-message" id="appDialogMessage"></p>' +
          '<div class="app-dialog-actions" id="appDialogActions"></div>' +
        '</div>' +
      '</div>' +
      '<div id="appToast" class="app-toast" aria-live="polite"></div>'
    );
  }

  let dialogResolve = null;

  function closeAppDialog(value) {
    const modal = document.getElementById('appDialogModal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
    if (dialogResolve) {
      const r = dialogResolve;
      dialogResolve = null;
      r(value);
    }
  }

  function showAppDialog({ title, message, html, buttons }) {
    ensureDialog();
    return new Promise((resolve) => {
      dialogResolve = resolve;
      const modal = document.getElementById('appDialogModal');
      document.getElementById('appDialogTitle').textContent = title || 'Zerno';
      const msgEl = document.getElementById('appDialogMessage');
      if (html) msgEl.innerHTML = message;
      else msgEl.textContent = message || '';

      const actions = document.getElementById('appDialogActions');
      actions.innerHTML = '';
      (buttons || [{ label: 'OK', value: true, primary: true }]).forEach((btn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = btn.label;
        b.className = btn.primary ? 'btn-primary' : 'btn-outline';
        if (btn.danger) b.classList.add('btn-danger');
        b.onclick = () => closeAppDialog(btn.value);
        actions.appendChild(b);
      });

      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
    });
  }

  function appNotify(message, type) {
    ensureDialog();
    const toast = document.getElementById('appToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'app-toast show app-toast--' + (type || 'info');
    clearTimeout(appNotify._t);
    appNotify._t = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function showAppAlert(message, title) {
    return showAppDialog({
      title: title || 'Сообщение',
      message,
      buttons: [{ label: 'Понятно', value: true, primary: true }]
    });
  }

  function showAppConfirm(message, options) {
    const opts = options || {};
    return showAppDialog({
      title: opts.title || 'Подтверждение',
      message,
      buttons: [
        { label: opts.cancelLabel || 'Отмена', value: false },
        { label: opts.confirmLabel || 'Подтвердить', value: true, primary: true, danger: !!opts.danger }
      ]
    });
  }

  function showNoAccountChoice(email) {
    const safe = escapeHtml(email);
    return showAppDialog({
      title: 'Аккаунт не найден',
      message: `Пользователя с адресом <strong>${safe}</strong> нет в системе.<br><br>Хотите создать аккаунт?`,
      html: true,
      buttons: [
        { label: 'Закрыть', value: false },
        { label: 'Создать аккаунт', value: 'register', primary: true }
      ]
    });
  }

  window.appNotify = appNotify;
  window.showAppDialog = showAppDialog;
  window.showAppAlert = showAppAlert;
  window.showAppConfirm = showAppConfirm;
  window.showNoAccountChoice = showNoAccountChoice;
})();
