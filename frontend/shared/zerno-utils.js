/** Часовой пояс кофейни (Москва / Минск UTC+3) */
const ZERNO_TZ = 'Europe/Moscow';
const PHONE_PREFIX = '+375';
const PHONE_DIGITS_AFTER = 9;

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0')
  ].join('-');
}

function getMoscowDateStr(d) {
  const date = d || new Date();
  return date.toLocaleDateString('en-CA', { timeZone: ZERNO_TZ });
}

function getMoscowTimeParts(d) {
  const date = d || new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZERNO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
  return { h, m, minutes: h * 60 + m };
}

/** Минимальное время заказа: сейчас (Москва) + 30 мин, в пределах 10:00–22:00 */
function getMinOrderSlotMoscow() {
  const now = new Date();
  let totalMin = getMoscowTimeParts(now).minutes + 30;
  totalMin = Math.ceil(totalMin / 30) * 30;

  let dateStr = getMoscowDateStr(now);
  const minDate = dateStr;

  if (totalMin >= 22 * 60) {
    dateStr = addDaysToDateStr(dateStr, 1);
    totalMin = 10 * 60;
  } else if (totalMin < 10 * 60) {
    totalMin = 10 * 60;
  }

  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return { date: dateStr, time, minDate };
}

function setupPhoneInput(inputId, options = {}) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const prefix = options.prefix || PHONE_PREFIX;
  const maxDigits = options.digits || PHONE_DIGITS_AFTER;

  function formatValue(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('375')) digits = digits.slice(3);
    digits = digits.slice(0, maxDigits);
    return prefix + digits;
  }

  if (!el.value || !el.value.startsWith(prefix)) {
    el.value = prefix;
  }

  el.setAttribute('inputmode', 'numeric');
  el.setAttribute('autocomplete', 'tel');

  el.addEventListener('focus', () => {
    if (!el.value.startsWith(prefix)) el.value = prefix;
    setTimeout(() => {
      if (el.selectionStart < prefix.length) el.setSelectionRange(prefix.length, prefix.length);
    }, 0);
  });

  el.addEventListener('keydown', (e) => {
    const pos = el.selectionStart || 0;
    if ((e.key === 'Backspace' || e.key === 'Delete') && pos <= prefix.length) {
      e.preventDefault();
    }
  });

  el.addEventListener('input', () => {
    el.value = formatValue(el.value);
    if (el.selectionStart < prefix.length) {
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    el.value = formatValue(prefix + text.replace(/\D/g, ''));
  });
}

function getPhoneForSubmit(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return '';
  const digits = el.value.replace(/\D/g, '');
  if (digits.length < 12) return el.value.trim();
  return '+' + digits;
}
