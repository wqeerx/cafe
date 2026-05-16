const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'sqlite.db');
const db = new sqlite3.Database(dbPath);

db.run(`ALTER TABLE categories ADD COLUMN image_url TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
        console.log('Ошибка:', err.message);
    } else if (!err) {
        console.log('✅ Добавлена колонка image_url в таблицу categories');
    } else {
        console.log('ℹ️ Колонка image_url уже существует');
    }
    db.close();
});