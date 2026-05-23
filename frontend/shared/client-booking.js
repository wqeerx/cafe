/**

 * Бронирование столов — общий модуль для главной и профиля.

 */

(function (global) {

  'use strict';



  const API = '/api';

  let bookingTables = [];

  let bookingMarkers = [];

  let bookingSelectedTable = null;

  let bookingDurationMinutes = 120;

  let bookingGuestsCount = 0;

  let bookingSetupDone = false;

  let bookingLayoutCache = [];

  let bookingLivePollTimer = null;

  let bookingAvailabilitySeq = 0;



  function getBookingUser() {

    return global.currentUser || (typeof loadClientSession === 'function' ? loadClientSession() : null);

  }



  function bookingNotifyError(msg) {

    if (typeof global.notifyError === 'function') global.notifyError(msg);

    else if (typeof appNotify === 'function') appNotify(msg, 'error');

    else alert(msg);

  }



  function bookingNotifySuccess(msg) {

    if (typeof global.showSuccess === 'function') global.showSuccess(msg);

    else if (typeof appNotify === 'function') appNotify(msg, 'success');

  }



  function guestCountLabel(n) {

    const num = parseInt(n, 10);

    if (num === 1) return '1 гость';

    if (num >= 2 && num <= 4) return `${num} гостя`;

    return `${num} гостей`;

  }



  function tableIdNum(id) {

    return Number(id);

  }



  function findBookingTable(id) {

    const tid = tableIdNum(id);

    return bookingTables.find((t) => tableIdNum(t.id) === tid);

  }



  function getSlotEndTimeLabel(timeStr, durationMin) {

    const endMin = parseTimeHM(timeStr) + normalizeBookingDuration(durationMin);

    return formatMinutesHM(Math.min(endMin, CAFE_CLOSE_MIN));

  }



  function updateBookingDurationLabel() {

    const el = document.getElementById('bookingDurationLabel');

    if (el) el.textContent = formatBookingDuration(bookingDurationMinutes);

  }



  function changeBookingDuration(delta) {

    bookingDurationMinutes = normalizeBookingDuration(bookingDurationMinutes + delta);

    updateBookingDurationLabel();

    refreshBookingAvailability();

  }



  function updateBookingAuthUi() {

    const submitBtn = document.getElementById('bookingSubmitBtn');

    const authCta = document.getElementById('bookingAuthCta');

    const guestNote = document.getElementById('bookingGuestNote');

    if (!submitBtn) return;

    const user = getBookingUser();

    if (user) {

      submitBtn.style.display = 'block';

      if (authCta) authCta.style.display = 'none';

      if (guestNote) {

        guestNote.textContent = 'После отправки сотрудник подтвердит бронь.';

      }

    } else {

      submitBtn.style.display = 'none';

      if (authCta) authCta.style.display = 'flex';

      if (guestNote) {

        guestNote.textContent = 'Просмотр схемы доступен без входа. Чтобы забронировать стол — войдите или зарегистрируйтесь.';

      }

    }

  }



  function updateBookingGuestsDisplay() {

    const el = document.getElementById('bookingGuests');

    if (!el) return;

    if (!bookingSelectedTable || !bookingGuestsCount) {

      el.value = '';

      el.placeholder = 'Выберите стол';

      return;

    }

    el.value = guestCountLabel(bookingGuestsCount);

    el.dataset.guests = String(bookingGuestsCount);

  }



  function updateBookingTableInfo() {

    const box = document.getElementById('bookingTableInfo');

    if (!box) return;

    if (!bookingSelectedTable) {

      box.hidden = false;

      box.innerHTML = '<p class="booking-panel-hint">Нажмите на свободный стол на схеме</p>';

      bookingGuestsCount = 0;

      updateBookingGuestsDisplay();

      return;

    }

    const cap = parseInt(bookingSelectedTable.capacity, 10) || 1;

    bookingGuestsCount = cap;

    box.hidden = true;

    box.innerHTML = '';

    updateBookingGuestsDisplay();

  }



  function updateBookingFloorEmptyState() {

    const emptyEl = document.getElementById('bookingFloorEmpty');

    const floor = document.getElementById('clientBookingFloor');

    const hasTables = bookingTables.length > 0;

    if (emptyEl) emptyEl.hidden = hasTables;

    if (floor) floor.style.visibility = hasTables ? 'visible' : 'hidden';

  }



  function jumpBookingTimeToConflict(table) {

    const endRaw = table.conflict_end || (table.conflict && table.conflict.end);

    if (!endRaw) return;

    const end = snapTimeToBookingSlot(endRaw);

    const timeEl = document.getElementById('bookingTime');

    if (!timeEl) return;

    const dateEl = document.getElementById('bookingDate');

    const dateVal = dateEl?.value;

    const minSlot = getMinBookingSlotMoscow();

    const minToday = snapBookingTimeUpMinutes(getMoscowTimeParts().minutes);

    if (dateVal === minSlot.minDate && parseTimeHM(end) < minToday) {

      bookingNotifyError('Это время уже прошло. Выберите другую дату.');

      return;

    }

    timeEl.value = end;

    bookingSelectedTable = null;

    updateBookingTableInfo();

    bookingNotifySuccess(`Время: ${end}. Проверьте доступность стола.`);

    refreshBookingAvailability();

  }



  function isTableSelectable(table) {

    return !table.is_booked && !table.too_small;

  }



  function formatBookingDateLabel(dateStr) {

    if (dateStr === getMoscowDateStr()) return 'сегодня';

    const parts = String(dateStr).split('-');

    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;

    return dateStr;

  }



  function updateBookingFloorLabel() {

    const el = document.getElementById('bookingFloorNowLabel');

    const dateEl = document.getElementById('bookingDate');

    const timeEl = document.getElementById('bookingTime');

    if (!el) return;

    const date = dateEl?.value;

    const time = timeEl?.value;

    if (!date || !time) {

      el.textContent = 'Схема зала';

      return;

    }

    const end = getSlotEndTimeLabel(time, bookingDurationMinutes);

    const dateLabel = formatBookingDateLabel(date);

    let text = `Схема · ${dateLabel} ${time}–${end} (${formatBookingDuration(bookingDurationMinutes)})`;

    if (date === getMoscowDateStr()) text += ` · сейчас ${getMoscowNowClockLabel()} МСК`;

    el.textContent = text;

  }



  function getBookingSlotLabel() {

    const dateEl = document.getElementById('bookingDate');

    const timeEl = document.getElementById('bookingTime');

    if (!dateEl?.value || !timeEl?.value) return '';

    const end = getSlotEndTimeLabel(timeEl.value, bookingDurationMinutes);

    return `${formatBookingDateLabel(dateEl.value)} ${timeEl.value}–${end}`;

  }



  function snapBookingTimeField() {

    const timeEl = document.getElementById('bookingTime');

    if (!timeEl || !timeEl.value) return;

    timeEl.value = snapTimeToBookingSlot(timeEl.value);

  }



  function handleBookingFloorClick(e) {

    const node = e.target.closest('.fp-table-node');

    if (!node) return;

    const table = findBookingTable(node.dataset.id);

    if (!table) return;



    if (table.is_booked) {

      const end = table.conflict_end || (table.conflict && table.conflict.end);

      if (end) jumpBookingTimeToConflict(table);

      return;

    }



    if (!isTableSelectable(table)) return;



    bookingSelectedTable = table;

    const cap = parseInt(table.capacity, 10) || 1;

    bookingGuestsCount = cap;

    updateBookingTableInfo();

    renderClientBookingFloor();

  }



  function renderClientBookingFloor() {

    const floor = document.getElementById('clientBookingFloor');

    if (!floor || !window.ZernoFloorPlan) return;

    updateBookingFloorEmptyState();

    if (!bookingTables.length) {

      floor.querySelectorAll('.fp-table-node, .fp-marker').forEach((n) => n.remove());

      return;

    }

    ZernoFloorPlan.renderMarkers(floor, bookingMarkers, { mode: 'select' });

    updateBookingFloorLabel();

    ZernoFloorPlan.renderFloor(floor, bookingTables, {

      mode: 'select',

      selectedId: bookingSelectedTable ? tableIdNum(bookingSelectedTable.id) : null,

      showLiveNow: false,

      slotLabel: getBookingSlotLabel()

    });

  }



  function mergeAvailabilityIntoTables(avail) {

    const layoutById = {};

    bookingLayoutCache.forEach((t) => { layoutById[tableIdNum(t.id)] = t; });

    if (Array.isArray(avail) && avail.length) {

      bookingTables = avail.map((a) => {

        const base = layoutById[tableIdNum(a.id)] || {};

        return {

          ...base,

          ...a,

          id: tableIdNum(a.id),

          number: a.number,

          capacity: a.capacity,

          x: a.x != null ? a.x : (base.x ?? 50),

          y: a.y != null ? a.y : (base.y ?? 50),

          placed: 1,

          rotation: a.rotation || base.rotation || 0,

          is_booked: !!a.is_booked,

          too_small: false,

          conflict: a.conflict || null,

          conflict_end: a.conflict?.end || null,

          conflict_start: a.conflict?.start || null

        };

      });

      return;

    }

    bookingTables = bookingLayoutCache.map((t) => ({

      ...t,

      id: tableIdNum(t.id),

      is_booked: false,

      too_small: false

    }));

  }



  async function refreshBookingAvailability() {

    const seq = ++bookingAvailabilitySeq;

    const dateEl = document.getElementById('bookingDate');

    const timeEl = document.getElementById('bookingTime');

    if (!dateEl || !timeEl || !dateEl.value || !timeEl.value) {

      bookingTables = bookingLayoutCache.map((t) => ({

        ...t,

        id: tableIdNum(t.id),

        is_booked: false,

        too_small: false

      }));

      renderClientBookingFloor();

      return;

    }



    const params = new URLSearchParams({

      date: dateEl.value,

      time: timeEl.value,

      duration_minutes: String(bookingDurationMinutes)

    });



    try {

      const res = await fetch(`${API}/tables/availability?${params}`);

      if (seq !== bookingAvailabilitySeq) return;

      const avail = await res.json();

      if (!Array.isArray(avail)) {

        mergeAvailabilityIntoTables([]);

        renderClientBookingFloor();

        return;

      }

      mergeAvailabilityIntoTables(avail);

      if (bookingSelectedTable) {

        const cur = findBookingTable(bookingSelectedTable.id);

        if (!cur || !isTableSelectable(cur)) {

          bookingSelectedTable = null;

          updateBookingTableInfo();

        } else {

          bookingSelectedTable = cur;

        }

      }

      updateBookingFloorLabel();

      renderClientBookingFloor();

    } catch (e) {

      if (seq !== bookingAvailabilitySeq) return;

      mergeAvailabilityIntoTables([]);

      renderClientBookingFloor();

    }

  }



  async function loadBookingLayout() {

    if (!window.ZernoFloorPlan) return false;

    try {

      const [tablesRes, markersRes] = await Promise.all([

        fetch(`${API}/tables`),

        fetch(`${API}/floor-markers`)

      ]);

      const allTables = await tablesRes.json();

      const markersData = await markersRes.json();

      bookingLayoutCache = (Array.isArray(allTables) ? allTables : [])

        .filter((t) => ZernoFloorPlan.isPlaced(t))

        .map((t) => ({ ...t, id: tableIdNum(t.id) }));

      bookingMarkers = Array.isArray(markersData) ? markersData : [];

      return true;

    } catch (e) {

      bookingLayoutCache = [];

      bookingMarkers = [];

      return false;

    }

  }



  function fillBookingTimeSelect() {

    const sel = document.getElementById('bookingTime');

    if (!sel) return;

    const slots = getBookingTimeSlots();

    const minSlot = getMinBookingSlotMoscow();

    const dateVal = document.getElementById('bookingDate')?.value || minSlot.minDate;

    let firstOk = null;

    const minToday = snapBookingTimeUpMinutes(getMoscowTimeParts().minutes);

    sel.innerHTML = slots.map((t) => {

      const disabled = dateVal === minSlot.minDate && parseTimeHM(t) < minToday;

      if (!disabled && !firstOk) firstOk = t;

      return `<option value="${t}"${disabled ? ' disabled' : ''}>${t}</option>`;

    }).join('');

    const curOpt = sel.selectedOptions[0];

    if (!sel.value || !curOpt || curOpt.disabled) {

      sel.value = dateVal === minSlot.date ? minSlot.time : (firstOk || slots[0]);

    }

  }



  function clampBookingDateTimeInputs() {

    const dateEl = document.getElementById('bookingDate');

    const timeEl = document.getElementById('bookingTime');

    if (!dateEl) return;

    const minSlot = getMinBookingSlotMoscow();

    dateEl.min = minSlot.minDate;

    if (!dateEl.value || dateEl.value < minSlot.minDate) dateEl.value = minSlot.date;

    fillBookingTimeSelect();

    if (timeEl && dateEl.value === minSlot.minDate) {

      const minToday = snapBookingTimeUpMinutes(getMoscowTimeParts().minutes);

      if (parseTimeHM(timeEl.value) < minToday) timeEl.value = formatMinutesHM(minToday);

    }

    snapBookingTimeField();

  }



  function setupBookingModal() {

    if (bookingSetupDone) return;

    const floor = document.getElementById('clientBookingFloor');

    if (!floor) return;

    bookingSetupDone = true;



    floor.addEventListener('click', handleBookingFloorClick);



    const minSlot = getMinBookingSlotMoscow();

    const dateEl = document.getElementById('bookingDate');

    if (dateEl) {

      dateEl.min = minSlot.minDate;

      dateEl.addEventListener('change', () => {

        clampBookingDateTimeInputs();

        refreshBookingAvailability();

      });

    }



    document.getElementById('bookingTime')?.addEventListener('change', () => {

      snapBookingTimeField();

      refreshBookingAvailability();

    });



    document.getElementById('bookingDurationMinus')?.addEventListener('click', () => {

      changeBookingDuration(-BOOKING_DURATION_STEP);

    });

    document.getElementById('bookingDurationPlus')?.addEventListener('click', () => {

      changeBookingDuration(BOOKING_DURATION_STEP);

    });

  }



  async function openBookingModal() {

    setupBookingModal();

    const modal = document.getElementById('bookingModal');

    if (!modal) return;



    if (!window.ZernoFloorPlan) {

      bookingNotifyError('Схема зала не загружена. Обновите страницу.');

      return;

    }



    bookingSelectedTable = null;

    bookingGuestsCount = 0;

    bookingDurationMinutes = normalizeBookingDuration(120);

    updateBookingDurationLabel();

    updateBookingAuthUi();



    const minSlot = getMinBookingSlotMoscow();

    const dateEl = document.getElementById('bookingDate');

    const timeEl = document.getElementById('bookingTime');

    if (dateEl) {

      dateEl.min = minSlot.minDate;

      dateEl.value = minSlot.date;

    }

    fillBookingTimeSelect();

    if (timeEl) timeEl.value = minSlot.time;

    clampBookingDateTimeInputs();

    snapBookingTimeField();



    modal.style.display = 'flex';

    document.body.style.overflow = 'hidden';



    await loadBookingLayout();

    await refreshBookingAvailability();

    updateBookingTableInfo();



    if (bookingLivePollTimer) clearInterval(bookingLivePollTimer);

    bookingLivePollTimer = setInterval(() => {

      const m = document.getElementById('bookingModal');

      if (!m || m.style.display === 'none') {

        clearInterval(bookingLivePollTimer);

        bookingLivePollTimer = null;

        return;

      }

      refreshBookingAvailability();

    }, 30000);

  }



  function closeBookingModal() {

    if (bookingLivePollTimer) {

      clearInterval(bookingLivePollTimer);

      bookingLivePollTimer = null;

    }

    if (typeof global.closeModal === 'function') global.closeModal('bookingModal');

    else {

      const modal = document.getElementById('bookingModal');

      if (modal) modal.style.display = 'none';

    }

    document.body.style.overflow = '';

  }



  function buildBookingConfirmHtml() {

    const date = document.getElementById('bookingDate')?.value;

    const time = document.getElementById('bookingTime')?.value;

    const tableNum = bookingSelectedTable?.number;

    const dur = formatBookingDuration(bookingDurationMinutes);

    const end = getSlotEndTimeLabel(time, bookingDurationMinutes);

    return (

      '<ul class="booking-confirm-list">' +

      `<li><strong>Стол:</strong> №${tableNum}</li>` +

      `<li><strong>Гостей:</strong> ${guestCountLabel(bookingGuestsCount)}</li>` +

      `<li><strong>Дата:</strong> ${date}</li>` +

      `<li><strong>Время:</strong> ${time} + ${dur} = ${end}</li>` +

      '</ul>'

    );

  }



  async function requestBookingSubmit() {

    const user = getBookingUser();

    if (!user) {

      bookingNotifyError('Войдите или зарегистрируйтесь, чтобы забронировать стол');

      if (typeof global.showLoginModal === 'function') global.showLoginModal();

      return;

    }

    const date = document.getElementById('bookingDate')?.value;

    const time = document.getElementById('bookingTime')?.value;

    if (!bookingSelectedTable?.id) { bookingNotifyError('Выберите стол на схеме'); return; }

    if (!date || !time) { bookingNotifyError('Выберите дату и время'); return; }

    if (!bookingGuestsCount) { bookingNotifyError('Выберите стол на схеме'); return; }



    const slotErr = validateBookingSlot(date, time, bookingDurationMinutes);

    if (slotErr) { bookingNotifyError(slotErr); return; }



    const cur = findBookingTable(bookingSelectedTable.id);

    if (!cur || !isTableSelectable(cur)) {

      bookingNotifyError('Стол занят на выбранное время. Выберите другой слот или стол.');

      await refreshBookingAvailability();

      return;

    }



    const ok = await (typeof global.showAppConfirm === 'function'

      ? global.showAppConfirm(buildBookingConfirmHtml(), {

        title: 'Подтвердите бронирование',

        html: true,

        confirmLabel: 'Отправить заявку',

        cancelLabel: 'Назад'

      })

      : Promise.resolve(confirm('Отправить бронирование?')));

    if (!ok) return;

    await submitBooking();

  }



  async function submitBooking() {

    const date = document.getElementById('bookingDate')?.value;

    const time = document.getElementById('bookingTime')?.value;

    const tableId = bookingSelectedTable?.id;

    const guests = bookingGuestsCount;



    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;

    if (!token) {

      bookingNotifyError('Войдите в аккаунт');

      if (typeof global.showLoginModal === 'function') global.showLoginModal();

      return;

    }



    const res = await fetch(API + '/bookings', {

      method: 'POST',

      headers: {

        'Content-Type': 'application/json',

        Authorization: 'Bearer ' + token

      },

      body: JSON.stringify({

        table_id: tableId,

        booking_date: date,

        booking_time: time,

        guests,

        duration_minutes: bookingDurationMinutes

      })

    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {

      bookingNotifySuccess('Бронирование отправлено! Ожидайте подтверждения сотрудником.');

      bookingSelectedTable = null;

      updateBookingTableInfo();

      closeBookingModal();

      if (typeof global.onBookingCreated === 'function') global.onBookingCreated();

    } else {

      bookingNotifyError(data.error || 'Ошибка бронирования');

      await refreshBookingAvailability();

    }

  }



  async function cancelBooking(bookingId) {

    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;

    if (!token) return;

    const res = await fetch(API + `/bookings/${bookingId}/cancel`, {

      method: 'PUT',

      headers: { Authorization: 'Bearer ' + token }

    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {

      bookingNotifySuccess('Бронирование отменено');

      if (typeof global.onBookingCancelled === 'function') global.onBookingCancelled();

    } else {

      bookingNotifyError(data.error || 'Не удалось отменить бронирование');

    }

  }



  global.openBookingModal = openBookingModal;

  global.closeBookingModal = closeBookingModal;

  global.requestBookingSubmit = requestBookingSubmit;

  global.submitBooking = submitBooking;

  global.cancelBooking = cancelBooking;

  global.setupBookingModal = setupBookingModal;

  global.refreshBookingAvailability = refreshBookingAvailability;

  global.updateBookingAuthUi = updateBookingAuthUi;

})(typeof window !== 'undefined' ? window : global);


