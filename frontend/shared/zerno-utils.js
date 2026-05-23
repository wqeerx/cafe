/** Часовой пояс кофейни (Москва / Минск UTC+3) */
const ZERNO_TZ = 'Europe/Moscow';
const PHONE_PREFIX = '+375';
const PHONE_DIGITS_AFTER = 9;
const PICKUP_ADDRESS = 'г. Минск, ул. Победителей 65 — Zerno в ТЦ «Замок»';
const CAFE_OPEN_MIN = 10 * 60;
const CAFE_CLOSE_MIN = 22 * 60;
/** Последний слот самовывоза (не позже чем за 20 мин до закрытия в 22:00) */
const CAFE_LAST_ORDER_MIN = 21 * 60 + 30;
const ORDER_PREP_MIN = 30;
const ORDER_SLOT_STEP = 30;

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
    hour12: false,
    hourCycle: 'h23'
  }).formatToParts(date);
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
  return { h, m, minutes: h * 60 + m };
}

function parseTimeHM(str) {
  if (!str) return 0;
  const [h, m] = String(str).split(':').map(Number);
  return h * 60 + (m || 0);
}

function formatMinutesHM(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getMinPickupMinutesForDate(dateStr) {
  if (dateStr !== getMoscowDateStr()) return CAFE_OPEN_MIN;
  const nowMin = getMoscowTimeParts().minutes + ORDER_PREP_MIN;
  return Math.max(CAFE_OPEN_MIN, nowMin);
}

function clampPickupSlot(dateStr, timeStr) {
  let min = parseTimeHM(timeStr);
  const minAllowed = getMinPickupMinutesForDate(dateStr);
  min = Math.max(minAllowed, Math.min(CAFE_LAST_ORDER_MIN, min));
  return { date: dateStr, time: formatMinutesHM(min) };
}

function adjustPickupSlot(dateStr, timeStr, deltaMin) {
  let min = parseTimeHM(timeStr) + deltaMin;
  const minAllowed = getMinPickupMinutesForDate(dateStr);
  min = Math.max(minAllowed, Math.min(CAFE_LAST_ORDER_MIN, min));
  return { date: dateStr, time: formatMinutesHM(min) };
}

function validatePickupSlot(dateStr, timeStr) {
  if (!dateStr || !timeStr) return 'Укажите дату и время';
  const moscowToday = getMoscowDateStr();
  if (dateStr < moscowToday) return 'Нельзя выбрать прошедшую дату';
  const min = parseTimeHM(timeStr);
  if (min < CAFE_OPEN_MIN || min > CAFE_CLOSE_MIN) {
    return 'Время работы кофейни: 10:00–22:00 (МСК)';
  }
  if (min >= CAFE_CLOSE_MIN) return 'Нельзя выбрать время закрытия кофейни';
  if (min > CAFE_LAST_ORDER_MIN) {
    return 'Заказ принимается не позже чем за 20 минут до закрытия (последний слот 21:30)';
  }
  if (dateStr === moscowToday) {
    const minAllowed = getMinPickupMinutesForDate(dateStr);
    if (min < minAllowed) {
      return 'Минимум +30 минут от текущего времени (МСК) на сбор заказа';
    }
  }
  return null;
}

/** Минимальное время заказа: сейчас (Москва) + 30 мин, в пределах 10:00–21:30 */
function getMinOrderSlotMoscow() {
  const now = new Date();
  let dateStr = getMoscowDateStr(now);
  const minDate = dateStr;
  let totalMin = getMoscowTimeParts(now).minutes + ORDER_PREP_MIN;

  if (totalMin > CAFE_LAST_ORDER_MIN) {
    dateStr = addDaysToDateStr(dateStr, 1);
    totalMin = CAFE_OPEN_MIN;
  } else if (totalMin < CAFE_OPEN_MIN) {
    totalMin = CAFE_OPEN_MIN;
  }

  return { date: dateStr, time: formatMinutesHM(totalMin), minDate };
}

/** SQLite CURRENT_TIMESTAMP (UTC) → Date */
function parseOrderCreatedAt(createdAt) {
  if (!createdAt) return null;
  const s = String(createdAt).trim();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  if (s.includes('T')) {
    const d = new Date(s.endsWith('Z') ? s : s + 'Z');
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

function getOrderElapsedMinutes(createdAt) {
  const d = parseOrderCreatedAt(createdAt);
  if (!d) return Infinity;
  return (Date.now() - d.getTime()) / 60000;
}

function canCancelOrderClient(order) {
  if (!order) return false;
  if (isOrderHistoryStatus(order.status)) return false;
  return getOrderElapsedMinutes(order.created_at) < 10;
}

function getOrderStatusNotifyMessage(order) {
  if (!order) return '';
  const status = normalizeOrderStatus(order.status);
  if (status === 'готов к выдаче') {
    return `Заказ #${order.id}: готов к выдаче. Код отправлен на email.`;
  }
  if (status === 'выдан') {
    return `Заказ #${order.id}: выдан. Приятного аппетита!`;
  }
  if (status === 'отменен') {
    return `Заказ #${order.id}: отменён`;
  }
  return `Заказ #${order.id}: ${order.status}`;
}

/** Обновляет карту статусов и показывает toast при изменении (не при первой загрузке). */
function trackOrderStatusChanges(orders, knownMap) {
  const map = knownMap ? { ...knownMap } : {};
  if (!Array.isArray(orders)) return map;
  for (const o of orders) {
    const key = String(o.id);
    if (map[key] !== undefined && map[key] !== o.status && typeof appNotify === 'function') {
      appNotify(getOrderStatusNotifyMessage(o), 'info');
    }
    map[key] = o.status;
  }
  return map;
}

function setupPhoneInput(inputId, options = {}) {
  const el = document.getElementById(inputId);
  if (!el || el.dataset.zernoPhoneInit === '1') return;
  el.dataset.zernoPhoneInit = '1';
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

const ZERNO_USER_KEY = 'zerno_user';
const ZERNO_ORDERS_TAB_KEY = 'zerno_orders_tab';

function getAuthToken() {
  const raw = localStorage.getItem('token');
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  return raw.replace(/^Bearer\s+/i, '').trim() || null;
}

function setAuthToken(token) {
  if (!token || typeof token !== 'string') return false;
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  if (!clean) return false;
  localStorage.setItem('token', clean);
  return true;
}

function parseJwtPayload(token) {
  try {
    if (!token) return null;
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return JSON.parse(atob(base64));
  } catch (e) {
    return null;
  }
}

function isAuthTokenExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return true;
  return payload.exp * 1000 <= Date.now();
}

function saveClientSession(user, token) {
  if (!user) return;
  const payload = parseJwtPayload(token || getAuthToken());
  const toSave = {
    ...user,
    role: user.role || payload?.role || 'client'
  };
  localStorage.setItem(ZERNO_USER_KEY, JSON.stringify(toSave));
}

function loadClientSession() {
  try {
    return JSON.parse(localStorage.getItem(ZERNO_USER_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

function clearClientSession() {
  localStorage.removeItem('token');
  localStorage.removeItem(ZERNO_USER_KEY);
}

function shouldForceClientLogout(status, token) {
  if (status !== 401 && status !== 403) return false;
  if (!token) return true;
  return isAuthTokenExpired(token);
}

async function fetchClientProfile(token) {
  const authToken = token || getAuthToken();
  if (!authToken) return { ok: false, authFailed: true, user: null };

  try {
    const res = await fetch('/api/user/profile', {
      headers: { Authorization: 'Bearer ' + authToken }
    });
    if (res.ok) {
      const user = await res.json();
      return { ok: true, authFailed: false, user };
    }
    return { ok: false, authFailed: shouldForceClientLogout(res.status, authToken), user: null };
  } catch (e) {
    return { ok: false, authFailed: false, user: null };
  }
}

function isClientRole(user, token) {
  const role = user?.role || parseJwtPayload(token)?.role;
  return !role || role === 'client';
}

function normalizeOrderStatus(status) {
  return String(status || '').toLowerCase().replace(/ё/g, 'е').trim();
}

function isOrderActiveStatus(status) {
  return !['выдан', 'отменен'].includes(normalizeOrderStatus(status));
}

function isOrderHistoryStatus(status) {
  return ['выдан', 'отменен'].includes(normalizeOrderStatus(status));
}

const MIN_BOOKING_MINUTES = 60;
const MAX_BOOKING_MINUTES = 180;
const BOOKING_DURATION_STEP = 30;
function snapNowToBookingSlotMinutes(totalMin) {
  return Math.floor(totalMin / BOOKING_DURATION_STEP) * BOOKING_DURATION_STEP;
}

/** Округление времени брони вверх до слота 30 мин (ближайшее будущее) */
function snapBookingTimeUpMinutes(totalMin) {
  return Math.ceil(totalMin / BOOKING_DURATION_STEP) * BOOKING_DURATION_STEP;
}

function getMoscowNowClockLabel() {
  return new Date().toLocaleTimeString('ru-RU', {
    timeZone: ZERNO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function normalizeBookingDuration(value) {
  let d = parseInt(value, 10) || 120;
  d = Math.round(d / BOOKING_DURATION_STEP) * BOOKING_DURATION_STEP;
  d = Math.max(MIN_BOOKING_MINUTES, Math.min(MAX_BOOKING_MINUTES, d));
  return d;
}

function formatBookingDuration(minutes) {
  const m = normalizeBookingDuration(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h} ч ${r} мин`;
  if (h > 0) return `${h} ч`;
  return `${r} мин`;
}

function getBookingTimeSlots() {
  const slots = [];
  for (let m = CAFE_OPEN_MIN; m <= CAFE_LAST_ORDER_MIN; m += BOOKING_DURATION_STEP) {
    slots.push(formatMinutesHM(m));
  }
  return slots;
}

/** Ближайший слот начала брони не раньше указанного времени */
/** Выбранный слот пересекается с текущим моментом (МСК) — показываем «занят сейчас» */
function isViewingNowBookingSlot(dateStr, timeStr, durationMin) {
  const moscowToday = getMoscowDateStr();
  if (dateStr !== moscowToday) return false;
  const nowMin = getMoscowTimeParts().minutes;
  const startMin = parseTimeHM(timeStr);
  const endMin = startMin + normalizeBookingDuration(durationMin);
  return startMin <= nowMin && nowMin < endMin;
}

function snapTimeToBookingSlot(timeStr) {
  const slots = getBookingTimeSlots();
  const target = parseTimeHM(timeStr);
  const found = slots.find((s) => parseTimeHM(s) >= target);
  return found || slots[slots.length - 1];
}

/** Дата и время начала брони по умолчанию (МСК): сейчас, округлено вверх до слота 30 мин */
function getMinBookingSlotMoscow() {
  const now = new Date();
  let dateStr = getMoscowDateStr(now);
  let totalMin = snapBookingTimeUpMinutes(getMoscowTimeParts(now).minutes);
  if (totalMin > CAFE_LAST_ORDER_MIN) {
    dateStr = addDaysToDateStr(dateStr, 1);
    totalMin = CAFE_OPEN_MIN;
  } else if (totalMin < CAFE_OPEN_MIN) {
    totalMin = CAFE_OPEN_MIN;
  }
  return { date: dateStr, time: formatMinutesHM(totalMin), minDate: getMoscowDateStr(now) };
}

function computeBookingDurationFromRange(startDate, startTime, endDate, endTime) {
  const start = new Date(`${startDate}T${startTime}:00+03:00`);
  const end = new Date(`${endDate}T${endTime}:00+03:00`);
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function getDefaultBookingEnd(startDate, startTime) {
  const startMin = parseTimeHM(startTime);
  const endMin = Math.min(startMin + 120, CAFE_CLOSE_MIN);
  let endDate = startDate;
  if (endMin <= startMin) {
    endDate = addDaysToDateStr(startDate, 1);
    return { date: endDate, time: formatMinutesHM(CAFE_CLOSE_MIN) };
  }
  return { date: endDate, time: formatMinutesHM(endMin) };
}

function validateBookingSlot(dateStr, timeStr, durationMin) {
  if (!dateStr || !timeStr) return 'Укажите дату и время';
  const moscowToday = getMoscowDateStr();
  if (dateStr < moscowToday) return 'Нельзя выбрать прошедшую дату';
  const startMin = parseTimeHM(timeStr);
  if (startMin < CAFE_OPEN_MIN || startMin > CAFE_LAST_ORDER_MIN) {
    return 'Время брони: с 10:00 до 21:30 (МСК)';
  }
  const duration = normalizeBookingDuration(durationMin);
  const endMin = startMin + duration;
  if (endMin > CAFE_CLOSE_MIN) {
    return 'Бронь должна закончиться до закрытия кофейни (22:00)';
  }
  if (dateStr === moscowToday) {
    const minAllowed = snapBookingTimeUpMinutes(getMoscowTimeParts().minutes);
    if (startMin < minAllowed) {
      return 'Нельзя выбрать прошедшее время (МСК)';
    }
  }
  return null;
}

function validateBookingEndRange(startDate, startTime, endDate, endTime) {
  if (!startDate || !startTime || !endDate || !endTime) return 'Укажите начало и окончание брони';
  const startErr = validateBookingSlot(startDate, startTime, MIN_BOOKING_MINUTES);
  if (startErr) return startErr;
  const endMin = parseTimeHM(endTime);
  if (endMin < CAFE_OPEN_MIN || endMin > CAFE_CLOSE_MIN) {
    return 'Окончание: с 10:00 до 22:00 (МСК)';
  }
  const duration = computeBookingDurationFromRange(startDate, startTime, endDate, endTime);
  if (duration < MIN_BOOKING_MINUTES) return 'Бронь не короче 1 часа';
  if (duration > MAX_BOOKING_MINUTES) return 'Бронь не дольше 3 часов';
  const norm = normalizeBookingDuration(duration);
  if (norm !== duration) return 'Окончание — с шагом 30 мин';
  const slotErr = validateBookingSlot(startDate, startTime, norm);
  if (slotErr) return slotErr;
  const start = new Date(`${startDate}T${startTime}:00+03:00`);
  const end = new Date(`${endDate}T${endTime}:00+03:00`);
  if (end <= start) return 'Окончание должно быть позже начала';
  return null;
}

const BOOKING_LATE_GRACE_MINUTES = 30;
const TABLE_OUTLET_NOTE = 'У всех столов есть розетки';

function formatBookingPeriodDisplay(b) {
  const startDate = b.booking_date;
  const startTime = String(b.booking_time || '').slice(0, 5);
  const endDate = b.booking_end_date || startDate;
  const endTime = b.booking_end_time || formatMinutesHM(
    parseTimeHM(startTime) + normalizeBookingDuration(b.duration_minutes || 120)
  );
  const startLabel = startDate === getMoscowDateStr() ? 'сегодня' : startDate.split('-').reverse().join('.');
  const endLabel = endDate === getMoscowDateStr() ? 'сегодня' : endDate.split('-').reverse().join('.');
  if (startDate === endDate) {
    return `${startLabel} ${startTime} — ${endTime}`;
  }
  return `начало ${startLabel} ${startTime}, окончание ${endLabel} ${endTime}`;
}

function isBookingActiveStatus(status) {
  return status === 'ожидает' || status === 'подтверждено';
}

function isBookingHistoryStatus(status) {
  return status === 'завершено' || status === 'отменено';
}

function getBookingStatusMeta(status) {
  const map = {
    'ожидает': { label: 'Ожидает подтверждения', bg: '#ffc107', color: '#333' },
    'подтверждено': { label: 'Подтверждено — ждём вас (опоздание 30 мин)', bg: '#28a745', color: '#fff' },
    'завершено': { label: 'Визит состоялся', bg: '#6c757d', color: '#fff' },
    'отменено': { label: 'Отменено', bg: '#dc3545', color: '#fff' }
  };
  return map[status] || { label: status || '—', bg: '#6c757d', color: '#fff' };
}

function renderUserBookingsHtml(bookings, options) {
  const opts = options || {};
  const list = Array.isArray(bookings) ? bookings : [];
  if (!list.length) {
    return '<p style="color:var(--text-muted);">Нет бронирований</p>';
  }
  return list.map((b) => {
    const meta = getBookingStatusMeta(b.status);
    const cancelBtn = opts.showCancel && b.status === 'ожидает'
      ? `<button type="button" class="btn-outline my-booking-cancel" data-booking-cancel="${b.id}">Отменить</button>`
      : '';
    return `
      <div class="my-booking-item" data-booking-id="${b.id}">
        <div><strong>Стол ${b.table_number}</strong> · ${b.guests} ${b.guests === 1 ? 'гость' : 'гостей'}</div>
        <div>${b.booking_date} в ${String(b.booking_time).slice(0, 5)} · ${formatBookingDuration(b.duration_minutes || 120)}</div>
        <div>Статус: <span class="my-booking-status" style="background:${meta.bg};color:${meta.color}">${meta.label}</span></div>
        ${cancelBtn}
      </div>`;
  }).join('');
}

function bindBookingCancelButtons(container, onCancel) {
  if (!container || typeof onCancel !== 'function') return;
  container.querySelectorAll('[data-booking-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.bookingCancel, 10);
      if (!id) return;
      await onCancel(id);
    });
  });
}

/** Требования к паролю — как на клиентском сайте */
function validatePassword(pass) {
  const hasUpper = /[A-Z]/.test(pass);
  const hasNumber = /[0-9]/.test(pass);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
  return pass.length >= 7 && hasUpper && hasNumber && hasSpecial;
}

function checkPasswordStrength(fieldId, hintId) {
  const input = document.getElementById(fieldId);
  const hint = document.getElementById(hintId);
  if (!input || !hint) return;
  const pass = input.value;
  const hasUpper = /[A-Z]/.test(pass);
  const hasNumber = /[0-9]/.test(pass);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
  const isLongEnough = pass.length >= 7;

  if (pass.length === 0) {
    hint.className = 'password-hint';
    hint.textContent = 'Минимум 7 символов, заглавная буква, цифра и спецсимвол';
    return;
  }
  if (isLongEnough && hasUpper && hasNumber && hasSpecial) {
    hint.className = 'password-hint valid';
    hint.textContent = '✓ Отличный пароль!';
  } else {
    hint.className = 'password-hint invalid';
    const issues = [];
    if (!isLongEnough) issues.push('мин. 7 символов');
    if (!hasUpper) issues.push('заглавная буква');
    if (!hasNumber) issues.push('цифра');
    if (!hasSpecial) issues.push('спецсимвол');
    hint.textContent = 'Требуется: ' + issues.join(', ');
  }
}

function togglePassword(fieldId, btn) {
  const input = document.getElementById(fieldId);
  if (!input || !btn) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Скрыть';
  } else {
    input.type = 'password';
    btn.textContent = 'Показать';
  }
}
