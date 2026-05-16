const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'sqlite.db');
const db = new sqlite3.Database(dbPath);

const employeePhone = '+375291112233';
const employeePassword = 'employee123';
const employeeEmail = 'employee@zerno.by';

bcrypt.hash(employeePassword, 10, (err, hash) => {
  if (err) {
    console.error('Ошибка хеширования:', err);
    return;
  }
  
  db.run(`INSERT OR REPLACE INTO users (phone, email, fullname, password, role, is_blocked) 
          VALUES (?, ?, ?, ?, 'employee', 0)`,
    [employeePhone, employeeEmail, 'Ирина Петрова (бариста)', hash],
    function(err) {
      if (err) {
        console.error('Ошибка:', err);
      } else {
        console.log('✅ Сотрудник создан:');
        console.log(`   Телефон: ${employeePhone}`);
        console.log(`   Пароль: ${employeePassword}`);
        console.log(`   Email: ${employeeEmail}`);
      }
      db.close();
    });
});