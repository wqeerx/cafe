const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;
const SECRET = 'zerno_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

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
    role TEXT DEFAULT 'client',
    is_blocked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

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

  // Столы
  db.run(`CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER UNIQUE,
    capacity INTEGER,
    x INTEGER DEFAULT 0,
    y INTEGER DEFAULT 0
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
  status TEXT DEFAULT 'ожидает',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(table_id) REFERENCES tables(id)
);`);

  // Журнал действий
  db.run(`CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Добавляем тестовые данные
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
      // Создаём тестового админа (пароль: admin123)
      bcrypt.hash('admin123', 10, (err, hash) => {
        if (!err) {
          db.run(`INSERT INTO users (fullname, phone, email, password, role) VALUES 
            ('Администратор', '+375291234567', 'admin@zerno.by', ?, 'admin')`, [hash]);
        }
      });
      
      // Создаём тестового сотрудника
      bcrypt.hash('employee123', 10, (err, hash) => {
        if (!err) {
          db.run(`INSERT INTO users (fullname, phone, email, password, role) VALUES 
            ('Сотрудник', '+375291112233', 'employee@zerno.by', ?, 'employee')`, [hash]);
        }
      });
      
      // Добавляем столы
      db.run(`INSERT INTO tables (number, capacity, x, y) VALUES 
        (1, 2, 50, 100),
        (2, 2, 150, 100),
        (3, 4, 100, 200),
        (4, 4, 200, 200),
        (5, 6, 150, 300)
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
  db.all(`
    SELECT b.*, t.number as table_number, t.capacity, u.phone as user_phone, u.fullname as user_name
    FROM bookings b
    JOIN tables t ON b.table_id = t.id
    JOIN users u ON b.user_id = u.id
    ORDER BY b.booking_date DESC, b.booking_time DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Подтвердить бронирование
app.put('/api/employee/bookings/:id/confirm', authenticateEmployee, (req, res) => {
  db.run(`UPDATE bookings SET status = 'подтверждено' WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Бронирование подтверждено' });
  });
});

// Отметить выполнение бронирования (клиент пришёл)
app.put('/api/employee/bookings/:id/complete', authenticateEmployee, (req, res) => {
  db.run(`UPDATE bookings SET status = 'завершено' WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Бронирование завершено' });
  });
});

// ============ АВТОРИЗАЦИЯ ============
app.post('/api/register', async (req, res) => {
  const { phone, email, fullname, password } = req.body;
  
  if (!phone || !password) {
    return res.status(400).json({ error: 'Телефон и пароль обязательны' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(`INSERT INTO users (phone, email, fullname, password, role) VALUES (?, ?, ?, ?, 'client')`,
      [phone, email || null, fullname || null, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Пользователь с таким телефоном уже существует' });
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, message: 'Регистрация успешна' });
      });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Логин (поддерживает и телефон, и email)
app.post('/api/login', (req, res) => {
  const { phone, email, password } = req.body;
  
  let query = '';
  let param = '';
  
  if (phone) {
    query = 'SELECT * FROM users WHERE phone = ?';
    param = phone;
  } else if (email) {
    query = 'SELECT * FROM users WHERE email = ?';
    param = email;
  } else {
    return res.status(400).json({ error: 'Укажите телефон или email' });
  }
  
  db.get(query, [param], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    
    // Проверка чёрного списка
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
      { expiresIn: '24h' }
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
    res.json(user);
  });
});

// Обновить профиль пользователя
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  const { fullname, email, phone, password } = req.body;
  let query = `UPDATE users SET fullname = ?, email = ?, phone = ?`;
  let params = [fullname, email, phone];
  
  if (password && password.length >= 7) {
    const hash = await bcrypt.hash(password, 10);
    query += `, password = ?`;
    params.push(hash);
  }
  query += ` WHERE id = ?`;
  params.push(req.user.id);
  
  db.run(query, params, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Профиль обновлён' });
  });
});
// ============ МЕНЮ ============
app.get('/api/menu', (req, res) => {
  db.all(`
    SELECT m.*, c.name as category_name 
    FROM menu_items m 
    JOIN categories c ON m.category_id = c.id
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/categories', (req, res) => {
  db.all(`SELECT * FROM categories`, (err, rows) => {
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

app.delete('/api/admin/menu/:id', authenticateAdmin, (req, res) => {
  db.run(`DELETE FROM menu_items WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'deleted' });
  });
});

// ============ УПРАВЛЕНИЕ КАТЕГОРИЯМИ (АДМИН) ============

// Получить все категории (с фото)
app.get('/api/categories', (req, res) => {
  db.all(`SELECT * FROM categories ORDER BY name`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Добавление категории (с фото)
// Добавление категории (с фото)
app.post('/api/admin/categories', authenticateAdmin, (req, res) => {
  const { name, image_url } = req.body;
  db.run(`INSERT INTO categories (name, image_url) VALUES (?, ?)`, 
    [name, image_url || null], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// Удаление категории
app.delete('/api/admin/categories/:id', authenticateAdmin, (req, res) => {
  db.run(`DELETE FROM categories WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'deleted' });
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
  const { number, capacity } = req.body;
  db.run(`INSERT INTO tables (number, capacity) VALUES (?, ?)`, [number, capacity], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.delete('/api/admin/tables/:id', authenticateAdmin, (req, res) => {
  db.run(`DELETE FROM tables WHERE id = ?`, [req.params.id], (err) => {
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
                  GROUP BY DATE(o.created_at) ORDER BY date DESC LIMIT 30`, params, (err5, dynamics) => {
            
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
  
  jwt.verify(token, SECRET, (err, user) => {
    if (err || user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён. Требуются права администратора.' });
    }
    req.user = user;
    next();
  });
}

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
app.listen(PORT, () => {
  console.log(`\n✅ Сервер Zerno запущен!`);
  console.log(`📍 Адрес: http://localhost:${PORT}`);
  console.log(`👑 Админ: +375291234567 / admin123`);
  console.log(`👨‍🍳 Сотрудник: +375291112233 / employee123`);
  console.log(`📱 Клиент: http://localhost:${PORT}/client/index.html\n`);
});