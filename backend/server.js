require('./load-env').loadEnv();

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const {
  enrichBookingTiming,
  expireNoShowBookings,
  isBookingShownOnFloorNow,
  BOOKING_LATE_GRACE_MINUTES
} = require('./booking-utils');

const app = express();
const PORT = 3000;
const SECRET = 'zerno_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'frontend', 'uploads')));

// ============ ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ ============
const dbPath = path.join(__dirname, 'sqlite.db');
const db = new sqlite3.Database(dbPath);

// Создание таблиц
db.serialize(() => {
  // Пользователи
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname TEXT,
    phone TEXT UNIQUE,
    email TEXT,
    password TEXT NOT NULL,
    password_plain TEXT,
    role TEXT DEFAULT 'client',
    is_blocked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`ALTER TABLE users ADD COLUMN password_plain TEXT`, (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.warn('users.password_plain:', err.message);
    }
  });

  // Категории
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  )`);

  // Позиции меню (с новыми полями)
  db.run(`CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT,
    description TEXT,
    composition TEXT,
    price REAL,
    popularity INTEGER DEFAULT 0,
    weight TEXT,
    protein REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    calories INTEGER DEFAULT 0,
    image_url TEXT,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  )`);

  db.run(`ALTER TABLE categories ADD COLUMN is_hidden INTEGER DEFAULT 0`, (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.warn('categories.is_hidden:', err.message);
    }
  });

  db.run(`ALTER TABLE menu_items ADD COLUMN is_hidden INTEGER DEFAULT 0`, (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.warn('menu_items.is_hidden:', err.message);
    }
  });

  // Столы
  db.run(`CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER UNIQUE,
    capacity INTEGER,
    x REAL DEFAULT 0,
    y REAL DEFAULT 0,
    placed INTEGER DEFAULT 0
  )`);

  db.run(`ALTER TABLE tables ADD COLUMN placed INTEGER DEFAULT 0`, (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.warn('tables.placed:', err.message);
    }
  });

  db.run(`ALTER TABLE tables ADD COLUMN rotation REAL DEFAULT 0`, (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.warn('tables.rotation:', err.message);
    }
  });

  db.run(`UPDATE tables SET placed = 1 WHERE (x != 0 OR y != 0) AND COALESCE(placed, 0) = 0`);
  db.run(`UPDATE tables SET x = MIN(95, x / 3.0) WHERE x > 100`);
  db.run(`UPDATE tables SET y = MIN(95, y / 4.0) WHERE y > 100`);

  db.run(`CREATE TABLE IF NOT EXISTS floor_markers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    x REAL DEFAULT 50,
    y REAL DEFAULT 50,
    rotation REAL DEFAULT 0
  )`);

  // Заказы
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    order_date DATE,
    order_time TIME,
    comment TEXT,
    payment_method TEXT,
    status TEXT DEFAULT 'принят',
    total REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`ALTER TABLE orders ADD COLUMN pickup_code TEXT`, (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.warn('orders.pickup_code:', err.message);
    }
  });

  // Позиции в заказе
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    menu_item_id INTEGER,
    quantity INTEGER,
    price_at_time REAL,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(menu_item_id) REFERENCES menu_items(id)
  )`);

  // Бронирования
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  table_id INTEGER,
  booking_date DATE,
  booking_time TIME,
  guests INTEGER,
  duration_minutes INTEGER DEFAULT 120,
  status TEXT DEFAULT 'ожидает',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(table_id) REFERENCES tables(id)
);`);

  db.run(`ALTER TABLE bookings ADD COLUMN duration_minutes INTEGER DEFAULT 120`, (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.warn('bookings.duration_minutes:', err.message);
    }
  });

  // Журнал действий
  db.run(`CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Коды подтверждения email
  db.run(`CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    payload TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_email_verifications_lookup
    ON email_verifications(email, purpose)`);

  db.run(`UPDATE menu_items SET popularity = COALESCE((
    SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.menu_item_id = menu_items.id
  ), 0)`);

  // Администратор: admin@gmail.com / Admin123! (синхронизация при каждом запуске)
  bcrypt.hash('Admin123!', 10, (err, adminHash) => {
    if (err) return;
    db.get(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`, (e, adminRow) => {
      if (adminRow) {
        db.run(
          `UPDATE users SET email = ?, password = ?, fullname = COALESCE(fullname, 'Администратор') WHERE id = ?`,
          ['admin@gmail.com', adminHash, adminRow.id]
        );
      } else {
        db.run(
          `INSERT INTO users (fullname, phone, email, password, role) VALUES (?, ?, ?, ?, 'admin')`,
          ['Администратор', '+375290000001', 'admin@gmail.com', adminHash]
        );
      }
    });
  });

  // Добавляем тестовые данные (только при первом запуске)
  db.get(`SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'`, (err, row) => {
  if (err) return;
  if (row.cnt === 0) {
    console.log('📦 Добавляем тестовые данные...');
    
    // Добавляем категории
    db.get(`SELECT COUNT(*) as cnt FROM categories`, (err2, row2) => {
      if (row2.cnt === 0) {
        db.run(`INSERT INTO categories (name) VALUES ('Выпечка'), ('Десерты'), ('Торты')`);
      }
    });
       // Добавляем тестовые товары
    db.get(`SELECT COUNT(*) as cnt FROM menu_items`, (err3, row3) => {
      if (row3.cnt < 3) {
        db.run(`INSERT OR IGNORE INTO menu_items (category_id, name, description, price, weight, calories) VALUES 
          (1, 'Эспрессо', 'Классический итальянский эспрессо', 3.50, '30 мл', 5),
          (1, 'Латте', 'Нежный кофе с молоком', 4.50, '250 мл', 120),
          (2, 'Чизкейк', 'Нежный творожный десерт', 5.50, '150 г', 350)
        `);
      }
    });
      
      // Создаём тестового сотрудника
      const seedEmpPassword = 'Employee123!';
      bcrypt.hash(seedEmpPassword, 10, (err, hash) => {
        if (!err) {
          db.run(
            `INSERT INTO users (fullname, phone, email, password, password_plain, role) VALUES 
            ('Сотрудник', '+375291112233', 'employee@zerno.by', ?, ?, 'employee')`,
            [hash, seedEmpPassword]
          );
        }
      });
      
      // Добавляем столы (x, y — проценты зала)
      db.run(`INSERT INTO tables (number, capacity, x, y, placed) VALUES 
        (1, 2, 18, 28, 1),
        (2, 2, 38, 28, 1),
        (3, 4, 58, 28, 1),
        (4, 4, 78, 28, 1),
        (5, 6, 48, 62, 1)
      `);
    }
  });
});

// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
function logAction(userId, action) {
  db.run(`INSERT INTO action_logs (user_id, action) VALUES (?, ?)`, [userId, action]);
}

function validatePassword(pass) {
  if (!pass || pass.length < 7) return false;
  return /[A-Z]/.test(pass) && /[0-9]/.test(pass) && /[!@#$%^&*(),.?":{}|<>]/.test(pass);
}

function validatePhone(phone) {
  return /^\+375\d{9}$/.test(phone.replace(/\s/g, ''));
}

function validateNutrition(val) {
  const n = parseFloat(val);
  return !isNaN(n) && n > 0;
}

// ============ АВТОРИЗАЦИЯ ============
// (бронирование отложено — клиентский код удалён из server.js)
// ============ ДЛЯ СОТРУДНИКОВ ============
// Получить все бронирования (для подтверждения)
app.get('/api/employee/bookings', authenticateEmployee, (req, res) => {
  const now = new Date();
  expireNoShowBookings(db, now, (expErr) => {
    if (expErr) return res.status(500).json({ error: expErr.message });
    db.all(`
    SELECT b.*, t.number as table_number, t.capacity, u.phone as user_phone, u.fullname as user_name
    FROM bookings b
    JOIN tables t ON b.table_id = t.id
    JOIN users u ON b.user_id = u.id
    ORDER BY b.booking_date DESC, b.booking_time DESC
  `, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map((b) => enrichBookingTiming(b, now)));
    });
  });
});

// Схема зала для сотрудника — активные брони «сейчас» (только просмотр)
app.get('/api/employee/bookings/floor', authenticateEmployee, (req, res) => {
  const now = new Date();

  expireNoShowBookings(db, now, (expErr) => {
    if (expErr) return res.status(500).json({ error: expErr.message });

  db.all(`SELECT * FROM tables ORDER BY number`, [], (err, tables) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(`SELECT * FROM floor_markers ORDER BY id`, [], (err2, markers) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.all(
        `SELECT b.*, t.number as table_number, t.capacity, u.phone as user_phone, u.fullname as user_name
         FROM bookings b
         JOIN tables t ON b.table_id = t.id
         JOIN users u ON b.user_id = u.id
         WHERE b.status IN ('ожидает', 'подтверждено', 'завершено')`,
        [],
        (err3, rows) => {
          if (err3) return res.status(500).json({ error: err3.message });

          const activeBookings = (rows || [])
            .map((b) => enrichBookingTiming(b, now))
            .filter((b) => isBookingShownOnFloorNow(b, now));

          const bookingByTable = {};
          activeBookings.forEach((b) => {
            bookingByTable[b.table_id] = b;
          });

          const floorTables = (tables || [])
            .filter((t) => t.placed === 1 || t.placed === '1' || parseFloat(t.x) > 0 || parseFloat(t.y) > 0)
            .map((t) => ({
              id: t.id,
              number: t.number,
              capacity: t.capacity,
              x: t.x,
              y: t.y,
              placed: t.placed,
              booking: bookingByTable[t.id] || null
            }));

          res.json({
            now: now.toISOString(),
            late_grace_minutes: BOOKING_LATE_GRACE_MINUTES,
            default_duration_minutes: 120,
            tables: floorTables,
            markers: markers || [],
            active_bookings: activeBookings
          });
        }
      );
    });
  });
  });
});

function fetchBookingForMail(bookingId, callback) {
  db.get(
    `SELECT b.*, t.number as table_number, u.email as user_email, u.fullname as user_name
     FROM bookings b
     JOIN tables t ON b.table_id = t.id
     JOIN users u ON b.user_id = u.id
     WHERE b.id = ?`,
    [bookingId],
    callback
  );
}

// Подтвердить бронирование (заявка → ожидаем гостя)
app.put('/api/employee/bookings/:id/confirm', authenticateEmployee, (req, res) => {
  const bookingId = req.params.id;
  db.run(
    `UPDATE bookings SET status = 'подтверждено' WHERE id = ? AND status = 'ожидает'`,
    [bookingId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (!this.changes) {
        return res.status(400).json({ error: 'Нельзя подтвердить эту бронь' });
      }
      logAction(req.user.id, `Подтвердил бронирование #${bookingId}`);
      fetchBookingForMail(bookingId, (err2, booking) => {
        if (err2) return res.json({ message: 'Бронирование подтверждено' });
        const email = booking?.user_email;
        if (email) {
          const { sendBookingConfirmedEmail } = require('./mail');
          sendBookingConfirmedEmail(email, booking).catch((mailErr) => {
            console.error('[Booking mail confirm]', mailErr.message);
          });
        }
        res.json({ message: 'Бронирование подтверждено' });
      });
    }
  );
});

// Гость пришёл — бронь в историю (без письма клиенту)
app.put('/api/employee/bookings/:id/complete', authenticateEmployee, (req, res) => {
  const bookingId = req.params.id;
  db.run(
    `UPDATE bookings SET status = 'завершено' WHERE id = ? AND status = 'подтверждено'`,
    [bookingId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (!this.changes) {
        return res.status(400).json({ error: 'Можно отметить только подтверждённую бронь' });
      }
      logAction(req.user.id, `Отметил прибытие гостя по брони #${bookingId}`);
      res.json({ message: 'Визит отмечен, бронь перенесена в историю' });
    }
  );
});

// ============ АВТОРИЗАЦИЯ (сотрудники — телефон, админ — email) ============
app.post('/api/login', (req, res) => {
  const { phone, email, password } = req.body;
  const loginEmail = email ? String(email).trim().toLowerCase() : null;
  const loginPhone = phone ? String(phone).trim() : null;

  if (!password || (!loginEmail && !loginPhone)) {
    return res.status(400).json({ error: 'Укажите email или телефон и пароль' });
  }

  const sql = loginEmail
    ? 'SELECT * FROM users WHERE LOWER(email) = ?'
    : 'SELECT * FROM users WHERE phone = ?';
  const param = loginEmail || loginPhone;

  db.get(sql, [param], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    if (loginEmail && user.role !== 'admin') {
      return res.status(403).json({ error: 'Вход по email доступен только администратору' });
    }
    if (loginPhone && user.role === 'client') {
      return res.status(403).json({ error: 'Клиенты входят через сайт по email' });
    }

    if (user.is_blocked === 1) {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован. Обратитесь к администратору.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, email: user.email, role: user.role },
      SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        fullname: user.fullname,
        role: user.role
      }
    });
  });
});
// Получить профиль пользователя
app.get('/api/user/profile', authenticateToken, (req, res) => {
  db.get(`SELECT id, fullname, phone, email, role, created_at FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  });
});

// Обновить профиль (без пароля — пароль меняется через /api/auth/change-password)
app.put('/api/user/profile', authenticateToken, (req, res) => {
  const { fullname, email, phone } = req.body;
  const normEmail = email ? String(email).trim().toLowerCase() : null;

  if (phone && !validatePhone(phone)) {
    return res.status(400).json({ error: 'Телефон: формат +375 и 9 цифр' });
  }

  db.get(`SELECT role FROM users WHERE id = ?`, [req.user.id], (err, self) => {
    if (err || !self) return res.status(500).json({ error: 'Ошибка' });

    db.run(
      `UPDATE users SET fullname = ?, email = ?, phone = ? WHERE id = ?`,
      [fullname, normEmail, phone, req.user.id],
      function (runErr) {
        if (runErr) {
          if (runErr.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Email или телефон уже заняты' });
          }
          return res.status(500).json({ error: runErr.message });
        }
        logAction(req.user.id, 'Обновление профиля');
        db.get(
          `SELECT id, fullname, phone, email, role, created_at FROM users WHERE id = ?`,
          [req.user.id],
          (selErr, user) => {
            if (selErr || !user) {
              return res.json({ message: 'Профиль обновлён' });
            }
            res.json(user);
          }
        );
      }
    );
  });
});
// ============ МЕНЮ ============
app.get('/api/menu', (req, res) => {
  db.all(`
    SELECT m.*, c.name as category_name 
    FROM menu_items m 
    JOIN categories c ON m.category_id = c.id
    WHERE COALESCE(m.is_hidden, 0) = 0 AND COALESCE(c.is_hidden, 0) = 0
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/categories', (req, res) => {
  db.all(`SELECT * FROM categories WHERE COALESCE(is_hidden, 0) = 0 ORDER BY name`, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// ============ ЗАКАЗЫ (создание — в api-extensions.js) ============
app.get('/api/my-orders', authenticateToken, (req, res) => {
  db.all(`SELECT o.*, 
          (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
          FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`,
    [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
});

// ============ СОТРУДНИКИ ============
app.get('/api/employee/orders', authenticateEmployee, (req, res) => {
  db.all(`SELECT o.*, u.phone as user_phone 
          FROM orders o 
          JOIN users u ON o.user_id = u.id 
          ORDER BY o.created_at DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Статус заказа сотрудником — в api-extensions.js

// ============ АДМИН: УПРАВЛЕНИЕ МЕНЮ ============
app.get('/api/admin/menu', authenticateAdmin, (req, res) => {
  db.all(`
    SELECT m.*, c.name as category_name, COALESCE(c.is_hidden, 0) as category_hidden
    FROM menu_items m
    LEFT JOIN categories c ON m.category_id = c.id
    ORDER BY c.name, m.name
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/admin/categories', authenticateAdmin, (req, res) => {
  db.all(`SELECT * FROM categories ORDER BY name`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

function checkMenuNutrition(body) {
  const fields = ['protein', 'fat', 'carbs', 'calories'];
  for (const f of fields) {
    if (body[f] !== undefined && body[f] !== null && body[f] !== '') {
      const n = parseFloat(body[f]);
      if (isNaN(n) || n <= 0) return `Поле «${f}» должно быть больше 0`;
    }
  }
  return null;
}

app.post('/api/admin/menu', authenticateAdmin, (req, res) => {
  const { name, description, price, category_id, weight, protein, fat, carbs, calories, composition, image_url } = req.body;
  const nutritionErr = checkMenuNutrition(req.body);
  if (nutritionErr) return res.status(400).json({ error: nutritionErr });
  db.run(`INSERT INTO menu_items 
    (name, description, price, category_id, weight, protein, fat, carbs, calories, composition, image_url) 
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [name, description, price, category_id, weight, protein, fat, carbs, calories, composition, image_url], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/admin/menu/:id', authenticateAdmin, (req, res) => {
  const { name, description, price, category_id, weight, protein, fat, carbs, calories, composition, image_url } = req.body;
  const nutritionErr = checkMenuNutrition(req.body);
  if (nutritionErr) return res.status(400).json({ error: nutritionErr });
  db.run(`UPDATE menu_items SET 
    name=?, description=?, price=?, category_id=?, 
    weight=?, protein=?, fat=?, carbs=?, calories=?, 
    composition=?, image_url=? 
    WHERE id=?`,
    [name, description, price, category_id, weight, protein, fat, carbs, calories, composition, image_url, req.params.id], 
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Обновлено' });
    });
});

app.put('/api/admin/menu/:id/hidden', authenticateAdmin, (req, res) => {
  const hidden = req.body.hidden ? 1 : 0;
  db.run(`UPDATE menu_items SET is_hidden = ? WHERE id = ?`, [hidden, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user.id, `${hidden ? 'Скрыл' : 'Показал'} позицию меню #${req.params.id}`);
    res.json({ message: hidden ? 'Позиция скрыта' : 'Позиция показана' });
  });
});

app.put('/api/admin/categories/:id/hidden', authenticateAdmin, (req, res) => {
  const hidden = req.body.hidden ? 1 : 0;
  const catId = req.params.id;
  db.run(`UPDATE categories SET is_hidden = ? WHERE id = ?`, [hidden, catId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`UPDATE menu_items SET is_hidden = ? WHERE category_id = ?`, [hidden, catId], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      logAction(req.user.id, `${hidden ? 'Скрыл' : 'Показал'} категорию #${catId}`);
      res.json({ message: hidden ? 'Категория и товары скрыты' : 'Категория и товары показаны' });
    });
  });
});

app.delete('/api/admin/menu/:id', authenticateAdmin, (req, res) => {
  db.run(`DELETE FROM menu_items WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'deleted' });
  });
});

// ============ УПРАВЛЕНИЕ КАТЕГОРИЯМИ (АДМИН) ============

// Получить все категории (публичные — без скрытых)
app.get('/api/categories/public', (req, res) => {
  db.all(`SELECT * FROM categories WHERE COALESCE(is_hidden, 0) = 0 ORDER BY name`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Дублирующий маршрут удалён — см. выше /api/categories
app.post('/api/admin/categories', authenticateAdmin, (req, res) => {
  const { name, image_url } = req.body;
  db.run(`INSERT INTO categories (name, image_url) VALUES (?, ?)`, 
    [name, image_url || null], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// Удаление категории (вместе со всеми товарами)
app.delete('/api/admin/categories/:id', authenticateAdmin, (req, res) => {
  const catId = req.params.id;
  db.run(`DELETE FROM menu_items WHERE category_id = ?`, [catId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`DELETE FROM categories WHERE id = ?`, [catId], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      logAction(req.user.id, `Удалил категорию #${catId} и её товары`);
      res.json({ message: 'deleted' });
    });
  });
});

// ============ АДМИН: УПРАВЛЕНИЕ СОТРУДНИКАМИ ============
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
  db.all(`SELECT id, phone, email, fullname, role, is_blocked, created_at FROM users`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Создание сотрудника — POST /api/admin/employees в api-extensions.js

app.delete('/api/admin/users/:id', authenticateAdmin, (req, res) => {
  db.run(`DELETE FROM users WHERE id = ? AND role != 'admin'`, [req.params.id], (err) => {
    res.json({ message: 'deleted' });
  });
});

// ============ АДМИН: ЧЁРНЫЙ СПИСОК ============
app.get('/api/admin/clients', authenticateAdmin, (req, res) => {
  db.all(`SELECT u.*, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as orders_count 
          FROM users u WHERE u.role = 'client' ORDER BY u.created_at DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/admin/users/:userId/block', authenticateAdmin, (req, res) => {
  db.run(`UPDATE users SET is_blocked = 1 WHERE id = ?`, [req.params.userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Пользователь заблокирован' });
  });
});

app.put('/api/admin/users/:userId/unblock', authenticateAdmin, (req, res) => {
  db.run(`UPDATE users SET is_blocked = 0 WHERE id = ?`, [req.params.userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Пользователь разблокирован' });
  });
});

// ============ АДМИН: УПРАВЛЕНИЕ СТОЛАМИ ============
app.get('/api/tables', (req, res) => {
  db.all(`SELECT * FROM tables ORDER BY number`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/tables', authenticateAdmin, (req, res) => {
  const number = parseInt(req.body.number, 10);
  const capacity = parseInt(req.body.capacity, 10);
  if (!number || !capacity || capacity < 1 || capacity > 6) {
    return res.status(400).json({ error: 'Укажите номер и вместимость от 1 до 6 стульев' });
  }
  db.run(
    `INSERT INTO tables (number, capacity, x, y, placed) VALUES (?, ?, 50, 50, 1)`,
    [number, capacity],
    function(err) {
      if (err) {
        if (String(err.message).includes('UNIQUE')) {
          return res.status(400).json({ error: 'Стол с таким номером уже есть' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({
        id: this.lastID,
        number,
        capacity,
        x: 50,
        y: 50,
        placed: 1
      });
    }
  );
});

app.put('/api/admin/tables/:id/position', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const x = parseFloat(req.body.x);
  const y = parseFloat(req.body.y);
  const placed = req.body.placed === false || req.body.placed === 0 ? 0 : 1;
  if (isNaN(x) || isNaN(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    return res.status(400).json({ error: 'Некорректные координаты (0–100%)' });
  }
  db.run(`UPDATE tables SET x = ?, y = ?, placed = ? WHERE id = ?`, [x, y, placed, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Стол не найден' });
    res.json({ message: 'ok' });
  });
});

app.put('/api/admin/tables/layout', authenticateAdmin, (req, res) => {
  const items = req.body.tables;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Передайте массив tables' });
  }
  const stmt = db.prepare(`UPDATE tables SET x = ?, y = ?, placed = ? WHERE id = ?`);
  try {
    items.forEach((t) => {
      const x = parseFloat(t.x);
      const y = parseFloat(t.y);
      const placed = t.placed === false || t.placed === 0 ? 0 : 1;
      if (isNaN(x) || isNaN(y)) throw new Error('invalid coords');
      stmt.run(x, y, placed, t.id);
    });
    stmt.finalize();
    res.json({ message: 'ok' });
  } catch (e) {
    stmt.finalize();
    res.status(400).json({ error: 'Некорректные данные схемы' });
  }
});

app.delete('/api/admin/tables/:id', authenticateAdmin, (req, res) => {
  db.run(`DELETE FROM tables WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'deleted' });
  });
});

const FLOOR_MARKER_KINDS = ['entrance', 'wall', 'cashier'];

app.get('/api/floor-markers', (req, res) => {
  db.all(`SELECT * FROM floor_markers ORDER BY id`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/admin/floor-markers', authenticateAdmin, (req, res) => {
  const { kind, x, y, rotation } = req.body;
  if (!FLOOR_MARKER_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'Тип: entrance, wall или cashier' });
  }
  const px = parseFloat(x);
  const py = parseFloat(y);
  const rot = parseFloat(rotation) || 0;
  if (isNaN(px) || isNaN(py)) {
    return res.status(400).json({ error: 'Укажите позицию на схеме' });
  }
  db.run(
    `INSERT INTO floor_markers (kind, x, y, rotation) VALUES (?, ?, ?, ?)`,
    [kind, px, py, rot],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, kind, x: px, y: py, rotation: rot });
    }
  );
});

app.put('/api/admin/floor-markers/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const x = parseFloat(req.body.x);
  const y = parseFloat(req.body.y);
  const rotation = parseFloat(req.body.rotation) || 0;
  if (isNaN(x) || isNaN(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    return res.status(400).json({ error: 'Координаты 0–100%' });
  }
  db.run(
    `UPDATE floor_markers SET x = ?, y = ?, rotation = ? WHERE id = ?`,
    [x, y, rotation, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Не найдено' });
      res.json({ message: 'ok' });
    }
  );
});

app.delete('/api/admin/floor-markers/:id', authenticateAdmin, (req, res) => {
  db.run(`DELETE FROM floor_markers WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'deleted' });
  });
});

// ============ АДМИН: ОТЧЁТЫ ============
app.get('/api/admin/reports', authenticateAdmin, (req, res) => {
  const { from, to } = req.query;
  let dateFilter = '';
  let params = [];
  
  if (from && to) {
    dateFilter = 'AND o.created_at BETWEEN ? AND ?';
    params = [from, to + ' 23:59:59'];
  }
  
  db.get(`SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as revenue, COALESCE(AVG(total),0) as avg_check 
          FROM orders o WHERE status != 'отменён' ${dateFilter}`, params, (err, stats) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all(`SELECT m.name, SUM(oi.quantity) as total_quantity 
            FROM order_items oi 
            JOIN menu_items m ON oi.menu_item_id = m.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status != 'отменён' ${dateFilter}
            GROUP BY m.id ORDER BY total_quantity DESC LIMIT 5`, params, (err2, popular) => {
      
      db.get(`SELECT COUNT(*) as canceled_count FROM orders o WHERE status = 'отменён' ${dateFilter}`, params, (err3, canceled) => {
        
        db.get(`SELECT COUNT(*) as new_users FROM users u WHERE u.role = 'client' AND u.created_at BETWEEN ? AND ?`, 
          [from || '2000-01-01', to || '3000-01-01'], (err4, newUsers) => {
          
          db.all(`SELECT DATE(o.created_at) as date, COUNT(*) as orders_count, SUM(o.total) as revenue 
                  FROM orders o WHERE o.status != 'отменён' ${dateFilter ? 'AND o.created_at BETWEEN ? AND ?' : ''}
                  GROUP BY DATE(o.created_at) ORDER BY date ASC`, params, (err5, dynamics) => {
            
            db.all(`SELECT t.id, t.number, t.capacity, COUNT(b.id) as bookings_count,
                    ROUND(COUNT(b.id) * 100.0 / 30, 1) as load_percent
                    FROM tables t LEFT JOIN bookings b ON t.id = b.table_id 
                    AND b.booking_date BETWEEN ? AND ? GROUP BY t.id`,
              [from || '2000-01-01', to || '3000-01-01'], (err6, tablesLoad) => {
                
                res.json({
                  orders_count: stats.orders_count || 0,
                  revenue: stats.revenue || 0,
                  avg_check: stats.avg_check || 0,
                  popular_items: popular || [],
                  canceled_count: canceled?.canceled_count || 0,
                  new_users_count: newUsers?.new_users || 0,
                  sales_dynamics: dynamics || [],
                  tables_load: tablesLoad || []
                });
              });
          });
        });
      });
    });
  });
});

// ============ ПРОВЕРКА ЗДОРОВЬЯ ============
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Zerno API работает',
    timestamp: new Date().toISOString()
  });
});

// ============ MIDDLEWARES ============
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Недействительный токен' });
    req.user = user;
    next();
  });
}

function authenticateEmployee(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Недействительный токен' });
    if (user.role !== 'employee' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    req.user = user;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Сессия истекла. Войдите снова как администратор.' });
    }
    const userId = decoded.id || decoded.userId;
    if (!userId) {
      return res.status(403).json({ error: 'Недействительный токен. Войдите снова.' });
    }
    db.get(`SELECT id, role, is_blocked FROM users WHERE id = ?`, [userId], (e, user) => {
      if (e || !user) {
        return res.status(403).json({ error: 'Пользователь не найден' });
      }
      if (user.is_blocked === 1) {
        return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
      }
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещён. Требуются права администратора.' });
      }
      req.user = { ...decoded, id: user.id, role: user.role };
      next();
    });
  });
}

// Email-авторизация для клиентов
require('./auth-email')(app, db, {
  bcrypt,
  jwt,
  SECRET,
  validatePassword,
  validatePhone,
  logAction,
  authenticateToken
});

const { registerUploadRoutes, ensureUploadDir } = require('./upload');
ensureUploadDir();
registerUploadRoutes(app, authenticateAdmin);

// Дополнительные маршруты
require('./api-extensions')(app, db, bcrypt, {
  authenticateToken,
  authenticateEmployee,
  authenticateAdmin,
  logAction,
  validatePassword,
  validatePhone
});

// Запуск сервера
const { isConfigured: mailConfigured, verifySmtpConnection } = require('./mail');

setInterval(() => {
  expireNoShowBookings(db, new Date(), (err, n) => {
    if (err) console.error('[No-show bookings]', err.message);
    else if (n > 0) console.log(`[No-show] Отменено броней без прибытия: ${n}`);
  });
}, 60000);

app.listen(PORT, async () => {
  expireNoShowBookings(db, new Date(), () => {});
  console.log(`\n✅ Сервер Zerno запущен!`);
  console.log(`📍 Адрес: http://localhost:${PORT}`);
  if (mailConfigured()) {
    const check = await verifySmtpConnection();
    console.log(check.ok
      ? `📧 Почта: ${process.env.SMTP_USER} (подключение OK)`
      : `📧 Почта: ошибка — ${check.reason}`);
  } else {
    console.log('📧 Почта: не настроена — создайте файл .env в корне (скопируйте .env.example)');
    console.log('   Коды подтверждения выводятся в эту консоль до настройки SMTP');
  }
  console.log(`👑 Админ: admin@gmail.com / Admin123!`);
  console.log(`👨‍🍳 Сотрудник: +375291112233 / Employee123!`);
  console.log(`📱 Клиент: http://localhost:${PORT}/client/index.html\n`);
});