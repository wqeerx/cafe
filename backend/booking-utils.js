const DEFAULT_BOOKING_MINUTES = 120;
const MIN_BOOKING_MINUTES = 60;
const MAX_BOOKING_MINUTES = 180;
const BOOKING_DURATION_STEP = 30;
const BOOKING_LATE_GRACE_MINUTES = 30;
const MOSCOW_OFFSET = '+03:00';
const MOSCOW_TZ = 'Europe/Moscow';

/** Статусы, блокирующие слот на схеме (только после подтверждения сотрудником) */
const BOOKING_STATUSES_OCCUPYING = ['подтверждено', 'завершено'];
const BOOKING_STATUSES_OCCUPYING_SQL = "'подтверждено', 'завершено'";

function parseBookingStart(booking) {
  const dateStr = String(booking.booking_date);
  const parts = String(booking.booking_time).split(':');
  const hh = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
  const mm = String(parseInt(parts[1] || 0, 10) || 0).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00${MOSCOW_OFFSET}`);
}

function isBookingOccupyingStatus(status) {
  return BOOKING_STATUSES_OCCUPYING.includes(status);
}

function getBookingWindow(booking) {
  const start = parseBookingStart(booking);
  const durationMin = parseInt(booking.duration_minutes, 10) || DEFAULT_BOOKING_MINUTES;
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  return { start, end, durationMin };
}

function formatDateMoscow(date) {
  return date.toLocaleDateString('en-CA', { timeZone: MOSCOW_TZ });
}

function formatTimeHMMoscow(date) {
  return date.toLocaleTimeString('ru-RU', {
    timeZone: MOSCOW_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function getNoShowDeadline(booking) {
  const { start } = getBookingWindow(booking);
  return new Date(start.getTime() + BOOKING_LATE_GRACE_MINUTES * 60 * 1000);
}

function shouldExpireNoShowBooking(booking, now = new Date()) {
  return booking.status === 'подтверждено' && now >= getNoShowDeadline(booking);
}

/** Гость за столом — только после отметки сотрудником («завершено») */
function isGuestAtTableNow(booking, now = new Date()) {
  if (booking.status !== 'завершено') return false;
  const { start, end } = getBookingWindow(booking);
  return now >= start && now < end;
}

function enrichBookingTiming(booking, now = new Date()) {
  const { start, end, durationMin } = getBookingWindow(booking);
  const atTable = isGuestAtTableNow(booking, now);
  const minutesLeft = atTable ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 60000)) : 0;
  const noShowDeadline = getNoShowDeadline(booking);
  let graceMinutesLeft = 0;
  if (booking.status === 'подтверждено' && now >= start && now < noShowDeadline) {
    graceMinutesLeft = Math.max(0, Math.ceil((noShowDeadline.getTime() - now.getTime()) / 60000));
  }
  return {
    ...booking,
    duration_minutes: durationMin,
    is_active: atTable,
    minutes_left: minutesLeft,
    grace_minutes_left: graceMinutesLeft,
    booking_end_date: formatDateMoscow(end),
    booking_end_time: formatTimeHMMoscow(end),
    ends_at: end.toISOString()
  };
}

/** Сотрудник ждёт гостя: подтверждено, начало прошло, 30 мин опоздания ещё не вышли */
function isAwaitingGuestNow(booking, now = new Date()) {
  if (booking.status !== 'подтверждено') return false;
  const { start } = getBookingWindow(booking);
  const deadline = getNoShowDeadline(booking);
  return now >= start && now < deadline;
}

/** Стол на схеме сотрудника «сейчас»: гость за столом или ждём подтверждённого гостя */
function isBookingShownOnFloorNow(booking, now = new Date()) {
  return isGuestAtTableNow(booking, now) || isAwaitingGuestNow(booking, now);
}

function isBookingActiveNow(booking, now = new Date()) {
  return isGuestAtTableNow(booking, now);
}

/** Бронь занимает выбранный слот клиента (с учётом автоотмены по опозданию) */
function bookingBlocksSlot(booking, dateStr, timeStr, durationMin, now = new Date()) {
  if (!isBookingOccupyingStatus(booking.status)) return false;
  if (!bookingOverlapsSlot(booking, dateStr, timeStr, durationMin)) return false;
  if (booking.status === 'подтверждено' && shouldExpireNoShowBooking(booking, now)) return false;
  return true;
}

function expireNoShowBookings(db, now, callback) {
  db.all(`SELECT * FROM bookings WHERE status = 'подтверждено'`, [], (err, rows) => {
    if (err) return callback(err);
    const toCancel = (rows || []).filter((b) => shouldExpireNoShowBooking(b, now));
    if (!toCancel.length) return callback(null, 0);
    let pending = toCancel.length;
    let cancelled = 0;
    toCancel.forEach((b) => {
      db.run(`UPDATE bookings SET status = 'отменено' WHERE id = ? AND status = 'подтверждено'`, [b.id], function (runErr) {
        if (!runErr && this.changes) cancelled += 1;
        pending -= 1;
        if (pending === 0) callback(null, cancelled);
      });
    });
  });
}

function normalizeBookingDurationMinutes(value) {
  let d = parseInt(value, 10) || DEFAULT_BOOKING_MINUTES;
  d = Math.round(d / BOOKING_DURATION_STEP) * BOOKING_DURATION_STEP;
  d = Math.max(MIN_BOOKING_MINUTES, Math.min(MAX_BOOKING_MINUTES, d));
  return d;
}

function getSlotWindow(dateStr, timeStr, durationMin) {
  const start = parseBookingStart({ booking_date: dateStr, booking_time: timeStr });
  const duration = normalizeBookingDurationMinutes(durationMin);
  const end = new Date(start.getTime() + duration * 60 * 1000);
  return { start, end, durationMin: duration };
}

function windowsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function bookingOverlapsSlot(booking, dateStr, timeStr, durationMin) {
  const slot = getSlotWindow(dateStr, timeStr, durationMin);
  const { start, end } = getBookingWindow(booking);
  return windowsOverlap(slot.start, slot.end, start, end);
}

function isTableBookedForSlot(tableId, bookings, dateStr, timeStr, durationMin, now = new Date()) {
  const tid = Number(tableId);
  return (bookings || []).some(
    (b) => Number(b.table_id) === tid && bookingBlocksSlot(b, dateStr, timeStr, durationMin, now)
  );
}

function formatTimeHM(date) {
  return formatTimeHMMoscow(date);
}

function getBookingEndTime(booking) {
  return formatTimeHMMoscow(getBookingWindow(booking).end);
}

function formatBookingPeriod(booking) {
  const endDate = formatDateMoscow(getBookingWindow(booking).end);
  const endTime = getBookingEndTime(booking);
  const startDate = booking.booking_date;
  const startTime = String(booking.booking_time).slice(0, 5);
  if (endDate === startDate) {
    return `${startDate} · ${startTime} — ${endTime}`;
  }
  return `${startDate} ${startTime} — ${endDate} ${endTime}`;
}

function getBlockingBookingForSlot(tableId, bookings, dateStr, timeStr, durationMin, now = new Date()) {
  const tid = Number(tableId);
  return (bookings || []).find(
    (b) => Number(b.table_id) === tid && bookingBlocksSlot(b, dateStr, timeStr, durationMin, now)
  );
}

function getSlotConflict(tableId, bookings, dateStr, timeStr, durationMin, now = new Date()) {
  const blocking = getBlockingBookingForSlot(tableId, bookings, dateStr, timeStr, durationMin, now);
  if (!blocking) return null;
  return {
    start: blocking.booking_time,
    end: getBookingEndTime(blocking),
    status: blocking.status
  };
}

module.exports = {
  DEFAULT_BOOKING_MINUTES,
  MIN_BOOKING_MINUTES,
  MAX_BOOKING_MINUTES,
  BOOKING_DURATION_STEP,
  BOOKING_LATE_GRACE_MINUTES,
  BOOKING_STATUSES_OCCUPYING,
  BOOKING_STATUSES_OCCUPYING_SQL,
  isBookingOccupyingStatus,
  enrichBookingTiming,
  isBookingActiveNow,
  isGuestAtTableNow,
  isAwaitingGuestNow,
  isBookingShownOnFloorNow,
  bookingBlocksSlot,
  shouldExpireNoShowBooking,
  expireNoShowBookings,
  getBookingWindow,
  normalizeBookingDurationMinutes,
  getSlotWindow,
  bookingOverlapsSlot,
  isTableBookedForSlot,
  getBookingEndTime,
  formatBookingPeriod,
  getBlockingBookingForSlot,
  getSlotConflict,
  formatTimeHM,
  formatDateMoscow,
  formatTimeHMMoscow,
  parseBookingStart,
  formatBookingPeriod
};
