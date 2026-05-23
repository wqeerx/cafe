/**
 * Проверка автоотмены при опоздании > 30 мин.
 * node scripts/test-booking-noshow.js
 */
const sqlite3 = require('sqlite3');
const path = require('path');
const {
  shouldExpireNoShowBooking,
  isGuestAtTableNow,
  expireNoShowBookings,
  parseBookingStart
} = require('../backend/booking-utils');

const DB = path.join(__dirname, '../backend/sqlite.db');

function runDbExec(sql, args) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB);
    db.run(sql, args, function (err) {
      db.close();
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function runDb(sql, args) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB);
    db.get(sql, args, (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function main() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  const now = new Date();
  const timeStr = '10:00';

  const id = await runDbExec(
    `INSERT INTO bookings (user_id, table_id, booking_date, booking_time, guests, duration_minutes, status)
     VALUES (9, 11, ?, ?, 2, 120, 'подтверждено')`,
    [today, timeStr]
  );

  const row = await runDb('SELECT * FROM bookings WHERE id = ?', [id]);
  if (!shouldExpireNoShowBooking(row, now)) {
    throw new Error('Ожидалась готовность к автоотмене');
  }
  if (isGuestAtTableNow(row, now)) {
    throw new Error('Подтверждено без прихода не должно быть «за столом»');
  }

  const cancelled = await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB);
    expireNoShowBookings(db, now, (err, n) => {
      db.close();
      if (err) reject(err);
      else resolve(n);
    });
  });

  const after = await runDb('SELECT status FROM bookings WHERE id = ?', [id]);
  if (after.status !== 'отменено') {
    throw new Error('Статус должен стать отменено, получено: ' + after.status);
  }

  console.log('OK: no-show отмена, снято броней:', cancelled);
  await runDbExec('DELETE FROM bookings WHERE id = ?', [id]);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
