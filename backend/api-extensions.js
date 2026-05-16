/**
 * Дополнительные API-маршруты для Zerno Cafe
 */
module.exports = function registerExtensions(app, db, bcrypt, helpers) {
  const { authenticateToken, authenticateEmployee, authenticateAdmin, logAction, validatePassword, validatePhone } = helpers;

  // ——— Отмена заказа клиентом (10 минут) ———
  app.put('/api/orders/:id/cancel', authenticateToken, (req, res) => {
    const orderId = req.params.id;
    db.get(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, [orderId, req.user.id], (err, order) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!order) return res.status(404).json({ error: 'Заказ не найден' });
      if (order.status === 'отменён') return res.status(400).json({ error: 'Заказ уже отменён' });
      if (order.status === 'выдан') return res.status(400).json({ error: 'Нельзя отменить выданный заказ' });

      const created = new Date(order.created_at);
      const now = new Date();
      const diffMin = (now - created) / 60000;
      if (diffMin > 10) {
        return res.status(400).json({ error: 'Отмена возможна только в течение 10 минут после оформления' });
      }

      db.run(`UPDATE orders SET status = 'отменён' WHERE id = ?`, [orderId], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ message: 'Заказ отменён' });
      });
    });
  });

  // ——— Заказы с позициями ———
  app.get('/api/my-orders/detailed', authenticateToken, (req, res) => {
    db.all(`SELECT o.* FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`, [req.user.id], (err, orders) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!orders.length) return res.json([]);

      const orderIds = orders.map(o => o.id);
      const placeholders = orderIds.map(() => '?').join(',');
      db.all(
        `SELECT oi.*, m.name, m.image_url FROM order_items oi
         JOIN menu_items m ON oi.menu_item_id = m.id
         WHERE oi.order_id IN (${placeholders})`,
        orderIds,
        (err2, items) => {
          if (err2) return res.status(500).json({ error: err2.message });
          const result = orders.map(o => {
            const elapsedMin = (Date.now() - new Date(o.created_at)) / 60000;
            const minutesLeft = Math.max(0, Math.ceil(10 - elapsedMin));
            const can_cancel = o.status !== 'отменён' && o.status !== 'выдан' && elapsedMin <= 10;
            return {
              ...o,
              can_cancel,
              cancel_minutes_left: can_cancel ? minutesLeft : 0,
              items: items.filter(i => i.order_id === o.id)
            };
          });
          res.json(result);
        }
      );
    });
  });

  // ——— Сотрудник: блокировка смены статуса после «выдан» ———
  app.put('/api/employee/orders/:id/status', authenticateEmployee, (req, res) => {
    const { status } = req.body;
    const allowed = ['принят', 'готовится', 'готов к выдаче', 'выдан'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус' });
    }

    db.get(`SELECT status FROM orders WHERE id = ?`, [req.params.id], (err, order) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!order) return res.status(404).json({ error: 'Заказ не найден' });
      if (order.status === 'выдан') {
        return res.status(400).json({ error: 'Статус «выдан» нельзя изменить' });
      }

      db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, req.params.id], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        logAction(req.user.id, `Изменил статус заказа #${req.params.id} на «${status}»`);
        res.json({ message: 'Статус обновлён' });
      });
    });
  });

  // ——— Админ: заказы ———
  app.get('/api/admin/orders', authenticateAdmin, (req, res) => {
    const { status } = req.query;
    let sql = `SELECT o.*, u.phone as user_phone, u.fullname as user_name,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
      FROM orders o JOIN users u ON o.user_id = u.id`;
    const params = [];
    if (status && status !== 'all') {
      sql += ` WHERE o.status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY o.created_at DESC`;

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.put('/api/admin/orders/:id/status', authenticateAdmin, (req, res) => {
    res.status(403).json({
      error: 'Администратор не может менять статус заказа. Статус меняет сотрудник в панели заказов.'
    });
  });

  app.get('/api/admin/orders/:id', authenticateAdmin, (req, res) => {
    db.get(
      `SELECT o.*, u.phone as user_phone, u.fullname as user_name, u.email as user_email
       FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`,
      [req.params.id],
      (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Заказ не найден' });
        db.all(
          `SELECT oi.*, m.name FROM order_items oi
           JOIN menu_items m ON oi.menu_item_id = m.id WHERE oi.order_id = ?`,
          [req.params.id],
          (err2, items) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ ...order, items });
          }
        );
      }
    );
  });

  // ——— Журнал действий ———
  app.get('/api/admin/action-logs', authenticateAdmin, (req, res) => {
    const { search, role, from, to } = req.query;
    let sql = `SELECT l.*, u.fullname, u.role, u.phone FROM action_logs l
               LEFT JOIN users u ON l.user_id = u.id WHERE 1=1`;
    const params = [];

    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      sql += ` AND (l.action LIKE ? OR u.fullname LIKE ? OR u.phone LIKE ?)`;
      params.push(q, q, q);
    }
    if (role && role !== 'all') {
      sql += ` AND u.role = ?`;
      params.push(role);
    }
    if (from) {
      sql += ` AND date(l.created_at) >= date(?)`;
      params.push(from);
    }
    if (to) {
      sql += ` AND date(l.created_at) <= date(?)`;
      params.push(to);
    }
    sql += ` ORDER BY l.created_at DESC LIMIT 500`;

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // ——— Сотрудники: только role=employee ———
  app.get('/api/admin/employees', authenticateAdmin, (req, res) => {
    db.all(
      `SELECT id, phone, email, fullname, role, is_blocked, created_at FROM users WHERE role = 'employee'`,
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  });

  app.put('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
    const { fullname, email, phone, password } = req.body;
    const userId = req.params.id;

    db.get(`SELECT role FROM users WHERE id = ?`, [userId], async (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
      if (user.role === 'admin') return res.status(403).json({ error: 'Нельзя редактировать администратора' });

      if (phone && !validatePhone(phone)) {
        return res.status(400).json({ error: 'Неверный формат телефона (+375...)' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Неверный формат email' });
      }

      let sql = `UPDATE users SET fullname = COALESCE(?, fullname), email = COALESCE(?, email), phone = COALESCE(?, phone)`;
      const params = [fullname || null, email || null, phone || null];

      if (password) {
        if (!validatePassword(password)) {
          return res.status(400).json({
            error: 'Пароль: мин. 7 символов, заглавная буква, цифра и спецсимвол'
          });
        }
        const hash = await bcrypt.hash(password, 10);
        sql += `, password = ?`;
        params.push(hash);
      }
      sql += ` WHERE id = ?`;
      params.push(userId);

      db.run(sql, params, (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        logAction(req.user.id, `Обновил данные сотрудника #${userId}`);
        res.json({ message: 'Сотрудник обновлён' });
      });
    });
  });

  // ——— Создание сотрудника (без роли admin) ———
  app.post('/api/admin/employees', authenticateAdmin, async (req, res) => {
    const { phone, email, fullname, password } = req.body;

    if (!phone) return res.status(400).json({ error: 'Телефон обязателен' });
    if (!validatePhone(phone)) return res.status(400).json({ error: 'Формат: +375XXXXXXXXX' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Неверный email' });
    }
    if (!password || !validatePassword(password)) {
      return res.status(400).json({
        error: 'Пароль: мин. 7 символов, заглавная буква, цифра и спецсимвол'
      });
    }

    const hash = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (phone, email, fullname, password, role) VALUES (?,?,?,?,'employee')`,
      [phone, email || null, fullname || null, hash],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Телефон уже занят' });
          }
          return res.status(500).json({ error: err.message });
        }
        logAction(req.user.id, `Добавил сотрудника ${fullname || phone}`);
        res.json({ id: this.lastID });
      }
    );
  });

  // ——— Категория: редактирование ———
  app.put('/api/admin/categories/:id', authenticateAdmin, (req, res) => {
    const { name, image_url } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Название обязательно' });
    db.run(
      `UPDATE categories SET name = ?, image_url = ? WHERE id = ?`,
      [name.trim(), image_url || null, req.params.id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user.id, `Обновил категорию #${req.params.id}`);
        res.json({ message: 'Категория обновлена' });
      }
    );
  });

  // ——— Блокировка: сотрудники и клиенты отдельно ———
  app.get('/api/admin/blocked-users', authenticateAdmin, (req, res) => {
    const { type } = req.query;
    const role = type === 'employee' ? 'employee' : 'client';
    db.all(
      `SELECT id, fullname, phone, email, role, is_blocked, created_at FROM users WHERE role = ? AND is_blocked = 1`,
      [role],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  });

  app.get('/api/admin/users-list', authenticateAdmin, (req, res) => {
    const { type } = req.query;
    const role = type === 'employee' ? 'employee' : 'client';
    db.all(
      `SELECT u.*, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as orders_count
       FROM users u WHERE u.role = ? ORDER BY u.created_at DESC`,
      [role],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  });

  // ——— Клиент: бронирование столов ———
  app.get('/api/tables/availability', authenticateToken, (req, res) => {
    const { date, time } = req.query;
    if (!date || !time) return res.status(400).json({ error: 'Укажите дату и время' });

    db.all(`SELECT * FROM tables ORDER BY number`, [], (err, tables) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all(
        `SELECT table_id FROM bookings WHERE booking_date = ? AND booking_time = ?
         AND status IN ('ожидает', 'подтверждено')`,
        [date, time],
        (err2, booked) => {
          if (err2) return res.status(500).json({ error: err2.message });
          const bookedIds = new Set(booked.map((b) => b.table_id));
          res.json(
            tables.map((t) => ({
              id: t.id,
              number: t.number,
              capacity: t.capacity,
              is_booked: bookedIds.has(t.id)
            }))
          );
        }
      );
    });
  });

  app.post('/api/bookings', authenticateToken, (req, res) => {
    const { table_id, booking_date, booking_time, guests } = req.body;
    if (!table_id || !booking_date || !booking_time || !guests) {
      return res.status(400).json({ error: 'Заполните все поля бронирования' });
    }

    db.get(
      `SELECT id FROM bookings WHERE table_id = ? AND booking_date = ? AND booking_time = ?
       AND status IN ('ожидает', 'подтверждено')`,
      [table_id, booking_date, booking_time],
      (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existing) return res.status(400).json({ error: 'Стол уже занят на это время' });

        db.run(
          `INSERT INTO bookings (user_id, table_id, booking_date, booking_time, guests, status)
           VALUES (?, ?, ?, ?, ?, 'ожидает')`,
          [req.user.id, table_id, booking_date, booking_time, guests],
          function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ id: this.lastID, message: 'Бронирование создано' });
          }
        );
      }
    );
  });

  app.get('/api/my-bookings', authenticateToken, (req, res) => {
    db.all(
      `SELECT b.*, t.number as table_number, t.capacity
       FROM bookings b JOIN tables t ON b.table_id = t.id
       WHERE b.user_id = ? ORDER BY b.booking_date DESC, b.booking_time DESC`,
      [req.user.id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  });

  app.put('/api/bookings/:id/cancel', authenticateToken, (req, res) => {
    db.run(
      `UPDATE bookings SET status = 'отменено' WHERE id = ? AND user_id = ? AND status = 'ожидает'`,
      [req.params.id, req.user.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(400).json({ error: 'Нельзя отменить это бронирование' });
        res.json({ message: 'Бронирование отменено' });
      }
    );
  });

  // ——— Отмена брони сотрудником ———
  app.put('/api/employee/bookings/:id/cancel', authenticateEmployee, (req, res) => {
    db.run(`UPDATE bookings SET status = 'отменено' WHERE id = ?`, [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user.id, `Отменил бронирование #${req.params.id}`);
      res.json({ message: 'Бронирование отменено' });
    });
  });

  // Валидация заказа при создании
  app.post('/api/orders', authenticateToken, (req, res) => {
    const { items, total, date, time, comment, paymentMethod } = req.body;
    const userId = req.user.id;

    if (!items || !items.length) return res.status(400).json({ error: 'Корзина пуста' });
    if (!date || !time) return res.status(400).json({ error: 'Укажите дату и время' });
    if (comment && comment.length > 200) {
      return res.status(400).json({ error: 'Комментарий не более 200 символов' });
    }

    const moscowToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
    if (date < moscowToday) return res.status(400).json({ error: 'Нельзя выбрать прошедшую дату' });

    const [h, m] = time.split(':').map(Number);
    const minutes = h * 60 + m;
    if (minutes < 10 * 60 || minutes > 22 * 60) {
      return res.status(400).json({ error: 'Время работы кофейни: 10:00–22:00 (МСК)' });
    }

    const moscowParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const moscowHour = parseInt(moscowParts.find((p) => p.type === 'hour').value, 10);
    const moscowMinute = parseInt(moscowParts.find((p) => p.type === 'minute').value, 10);
    let minTotal = moscowHour * 60 + moscowMinute + 30;
    minTotal = Math.ceil(minTotal / 30) * 30;
    const orderTotal = h * 60 + m;
    const isToday = date === moscowToday;
    if (isToday && orderTotal < minTotal) {
      return res.status(400).json({ error: 'Минимум +30 минут от текущего времени (МСК) на сбор заказа' });
    }

    const pay = paymentMethod === 'card' ? 'карта' : 'наличные';
    for (const item of items) {
      if (item.quantity > 5) {
        return res.status(400).json({ error: 'Максимум 5 позиций одного товара' });
      }
    }

    db.run(
      `INSERT INTO orders (user_id, order_date, order_time, comment, payment_method, total, status)
       VALUES (?, ?, ?, ?, ?, ?, 'принят')`,
      [userId, date, time, comment || null, pay, total],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const orderId = this.lastID;
        items.forEach(item => {
          db.run(
            `INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_time) VALUES (?, ?, ?, ?)`,
            [orderId, item.id, item.quantity, item.price]
          );
        });
        res.json({ id: orderId, message: 'Заказ создан' });
      }
    );
  });
};
