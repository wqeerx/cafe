const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'sqlite.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Начинаем миграцию базы данных...\n');

// Добавляем новые колонки для БЖУ
db.serialize(() => {
  // Проверяем и добавляем колонку weight (вес/объём)
  db.run(`ALTER TABLE menu_items ADD COLUMN weight TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('⚠️ Колонка weight уже существует или ошибка:', err.message);
    } else if (!err) {
      console.log('✅ Добавлена колонка weight');
    }
  });

  // Добавляем колонку protein (белки)
  db.run(`ALTER TABLE menu_items ADD COLUMN protein REAL DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('⚠️ Ошибка:', err.message);
    } else if (!err) {
      console.log('✅ Добавлена колонка protein');
    }
  });

  // Добавляем колонку fat (жиры)
  db.run(`ALTER TABLE menu_items ADD COLUMN fat REAL DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('⚠️ Ошибка:', err.message);
    } else if (!err) {
      console.log('✅ Добавлена колонка fat');
    }
  });

  // Добавляем колонку carbs (углеводы)
  db.run(`ALTER TABLE menu_items ADD COLUMN carbs REAL DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('⚠️ Ошибка:', err.message);
    } else if (!err) {
      console.log('✅ Добавлена колонка carbs');
    }
  });

  // Добавляем колонку calories (калории)
  db.run(`ALTER TABLE menu_items ADD COLUMN calories INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('⚠️ Ошибка:', err.message);
    } else if (!err) {
      console.log('✅ Добавлена колонка calories');
    }
  });

  // Проверяем, что всё добавилось
  setTimeout(() => {
    db.all(`PRAGMA table_info(menu_items)`, (err, columns) => {
      console.log('\n📋 Текущая структура таблицы menu_items:');
      columns.forEach(col => {
        console.log(`   - ${col.name} (${col.type})`);
      });
      console.log('\n✅ Миграция завершена!');
      db.close();
    });
  }, 500);
});