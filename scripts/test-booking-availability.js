/**
 * Проверка API доступности столов и логики слотов.
 * Запуск: node scripts/test-booking-availability.js
 */
const http = require('http');
const sqlite3 = require('sqlite3');
const path = require('path');
const {
  isBookingActiveNow,
  isTableBookedForSlot,
  parseBookingStart
} = require('../backend/booking-utils');

const DB = path.join(__dirname, '../backend/sqlite.db');
const API = 'http://localhost:3000';

function getAvailability(params) {
  const q = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    http.get(`${API}/api/tables/availability?${q}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(data));
        }
      });
    }).on('error', reject);
  });
}

function runDb(sql, args = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB);
    db.all(sql, args, (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function runDbExec(sql, args = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB);
    db.run(sql, args, function (err) {
      db.close();
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function tableByNumber(avail, num) {
  return avail.find((t) => Number(t.number) === Number(num));
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK:', msg);
}

async function ensureTestData(today) {
  const existing = await runDb(
    `SELECT id FROM bookings WHERE booking_date = ? AND table_id IN (10, 11) AND status IN ('подтверждено', 'завершено')`,
    [today]
  );
  if (existing.length >= 2) return;

  await runDbExec(
    `INSERT INTO bookings (user_id, table_id, booking_date, booking_time, guests, duration_minutes, status)
     VALUES (9, 11, ?, '15:30', 3, 120, 'завершено')`,
    [today]
  );
  await runDbExec(
    `INSERT INTO bookings (user_id, table_id, booking_date, booking_time, guests, duration_minutes, status)
     VALUES (9, 10, ?, '18:00', 2, 120, 'подтверждено')`,
    [today]
  );
  console.log('Created test bookings for', today);
}

async function main() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  const now = new Date();

  await ensureTestData(today);

  const bookings = await runDb(
    `SELECT * FROM bookings WHERE booking_date = ? AND status IN ('подтверждено', 'завершено')`,
    [today]
  );

  const t3 = bookings.find((b) => Number(b.table_id) === 11);
  const t2 = bookings.find((b) => Number(b.table_id) === 10);

  if (t3) {
    assert(isBookingActiveNow(t3, now), 'стол 3: гость «завершено» но слот ещё идёт — active now');
  }

  // Слот «сейчас» 16:00 — стол 3 занят
  const slotNow = await getAvailability({ date: today, time: '16:00', duration_minutes: '120' });
  const s3now = tableByNumber(slotNow, 3);
  assert(s3now, 'стол 3 в ответе API');
  assert(s3now.is_booked, 'стол 3 занят на 16:00');
  assert(s3now.is_active_now, 'стол 3 занят сейчас');
  assert(s3now.active_minutes_left > 0, 'стол 3: minutes left > 0');

  // Слот 19:00 — стол 3 свободен, стол 2 занят (бронь 18:00–20:00)
  const slotEvening = await getAvailability({ date: today, time: '19:00', duration_minutes: '120' });
  const s3eve = tableByNumber(slotEvening, 3);
  const s2eve = tableByNumber(slotEvening, 2);
  assert(s3eve && !s3eve.is_booked, 'стол 3 свободен на 19:00');
  assert(s3eve.is_active_now, 'стол 3 всё ещё занят сейчас (гость за столом), но слот 19:00 свободен');
  assert(s2eve && s2eve.is_booked, 'стол 2 занят на 19:00');

  // Слот 14:00 — стол 3 частично пересекается? 14:00+120=16:00, бронь 15:30-17:30 → overlap
  const slotAfternoon = await getAvailability({ date: today, time: '14:00', duration_minutes: '120' });
  const s3aft = tableByNumber(slotAfternoon, 3);
  assert(s3aft && s3aft.is_booked, 'стол 3 занят на 14:00 (пересечение с 15:30)');

  // Утилита совпадает с API
  if (t3) {
    const bookedUtil = isTableBookedForSlot(11, bookings, today, '16:00', 120);
    assert(bookedUtil, 'isTableBookedForSlot согласован с API для 16:00');
  }

  console.log('\nВсе проверки API пройдены.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
