/**
 * Удалить все бронирования из sqlite.db
 * node scripts/clear-bookings.js
 */
const sqlite3 = require('sqlite3');
const path = require('path');

const DB = path.join(__dirname, '../backend/sqlite.db');

const db = new sqlite3.Database(DB);

db.serialize(() => {
  db.run('DELETE FROM bookings', function (err) {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    console.log('Удалено бронирований:', this.changes);
    db.run("DELETE FROM sqlite_sequence WHERE name = 'bookings'", (err2) => {
      db.close();
      if (err2) console.warn('sqlite_sequence:', err2.message);
      else console.log('Счётчик id броней сброшен.');
    });
  });
});
