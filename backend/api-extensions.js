/**
 * Дополнительные API-маршруты для Zerno Cafe
 */

const EMPLOYEE_PASSWORD_GUESSES = [
  'Employee123!',
  'employee123',
  'Admin123!',
  'Zerno123!',
  'Password1!',
  '1234567'
];

function recoverEmployeePasswordPlain(db, bcrypt, userId) {
  return new Promise((resolve) => {
    db.get(
      `SELECT password, password_plain FROM users WHERE id = ? AND role = 'employee'`,
      [userId],
      async (err, row) => {
        if (err || !row) return resolve(null);
        const existing = row.password_plain && String(row.password_plain).trim();
        if (existing) return resolve(existing);

        for (const plain of EMPLOYEE_PASSWORD_GUESSES) {
          try {
            const match = await bcrypt.compare(plain, row.password);
            if (match) {
              await new Promise((res, rej) => {
                db.run(
                  `UPDATE users SET password_plain = ? WHERE id = ?`,
                  [plain, userId],
                  (e) => (e ? rej(e) : res())
                );
              });
              return resolve(plain);
            }
          } catch (_) {
            /* skip */
          }
        }
        resolve(null);
      }
    );
  });
}

function backfillEmployeePasswordPlain(db, bcrypt) {
  db.all(
    `SELECT id FROM users WHERE role = 'employee' AND (password_plain IS NULL OR TRIM(password_plain) = '')`,
    async (err, rows) => {
      if (err || !rows?.length) return;
      let filled = 0;
      for (const row of rows) {
        const plain = await recoverEmployeePasswordPlain(db, bcrypt, row.id);
        if (plain) filled++;
      }
      if (filled > 0) {
        console.log(`[password_plain] Восстановлен пароль для просмотра у ${filled} сотрудник(ов)`);
      }
    }
  );
}

module.exports = function registerExtensions(app, db, bcrypt, helpers) {
  const { authenticateToken, authenticateEmployee, authenticateAdmin, logAction, validatePassword, validatePhone } = helpers;
  const { sendPickupCodeEmail, sendOrderCompletedEmail } = require('./mail');
  const {
    normalizeBookingDurationMinutes,
    MAX_BOOKING_MINUTES,
    isTableBookedForSlot,
    getSlotConflict,
    enrichBookingTiming,
    isGuestAtTableNow,
    isBookingOccupyingStatus,
    getBookingEndTime,
    expireNoShowBookings,
    getBookingWindow,
    parseBookingStart,
    BOOKING_STATUSES_OCCUPYING_SQL
  } = require('./booking-utils');

  function parseOrderCreatedAt(createdAt) {
    if (!createdAt) return null;
    const s = String(createdAt).trim();
    if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    if (s.includes('T')) {
      const d = new Date(s.endsWith('Z') ? s : s + 'Z');
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s.replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? null : d;
  }

  function getOrderElapsedMinutes(createdAt) {
    const d = parseOrderCreatedAt(createdAt);
    if (!d) return Infinity;
    return (Date.now() - d.getTime()) / 60000;
  }

  // ——— Отмена заказа клиентом (10 минут) ———
  app.put('/api/orders/:id/cancel', authenticateToken, (req, res) => {
    const orderId = req.params.id;
    db.get(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, [orderId, req.user.id], (err, order) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!order) return res.status(404).json({ error: 'Заказ не найден' });
      if (order.status === 'отменён') return res.status(400).json({ error: 'Заказ уже отменён' });
      if (order.status === 'выдан') return res.status(400).json({ error: 'Нельзя отменить выданный заказ' });

      const diffMin = getOrderElapsedMinutes(order.created_at);
      if (diffMin >= 10) {
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
            const elapsedMin = getOrderElapsedMinutes(o.created_at);
            const minutesLeft = Math.max(0, Math.ceil(10 - elapsedMin));
            const can_cancel = o.status !== 'отменён' && o.status !== 'выдан' && elapsedMin < 10;
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

  function generatePickupCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // ——— Сотрудник: блокировка смены статуса после «выдан» ———
  app.put('/api/employee/orders/:id/status', authenticateEmployee, (req, res) => {
    const { status } = req.body;
    const allowed = ['принят', 'готовится', 'готов к выдаче', 'выдан'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус' });
    }

    db.get(
      `SELECT o.*, u.email as user_email, u.fullname as user_name
       FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`,
      [req.params.id],
      (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Заказ не найден' });
        if (order.status === 'выдан') {
          return res.status(400).json({ error: 'Статус «выдан» нельзя изменить' });
        }
        if (order.status === status) {
          return res.json({ message: 'Статус без изменений' });
        }

        const prevStatus = order.status;
        const pickupCode = status === 'готов к выдаче'
          ? (order.pickup_code || generatePickupCode())
          : order.pickup_code;

        const setPickup = status === 'готов к выдаче' && !order.pickup_code;
        const sql = setPickup
          ? `UPDATE orders SET status = ?, pickup_code = ? WHERE id = ?`
          : `UPDATE orders SET status = ? WHERE id = ?`;
        const params = setPickup
          ? [status, pickupCode, req.params.id]
          : [status, req.params.id];

        db.run(sql, params, (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          logAction(req.user.id, `Изменил статус заказа #${req.params.id} с «${prevStatus}» на «${status}»`);

          const email = order.user_email;
          if (email) {
            const mailOrder = { ...order, status };
            (async () => {
              try {
                if (status === 'готов к выдаче') {
                  await sendPickupCodeEmail(email, mailOrder, pickupCode);
                } else if (status === 'выдан') {
                  await sendOrderCompletedEmail(email, mailOrder);
                }
              } catch (mailErr) {
                console.error('[Order mail]', mailErr.message);
              }
            })();
          }

          res.json({
            message: 'Статус обновлён',
            pickup_code: status === 'готов к выдаче' ? pickupCode : undefined
          });
        });
      }
    );
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
               INNER JOIN users u ON l.user_id = u.id
               WHERE u.role IN ('employee', 'admin')`;
    const params = [];

    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      sql += ` AND (l.action LIKE ? OR u.fullname LIKE ? OR u.phone LIKE ?)`;
      params.push(q, q, q);
    }
    if (role && role !== 'all' && (role === 'employee' || role === 'admin')) {
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

  app.get('/api/admin/employees/:id', authenticateAdmin, (req, res) => {
    db.get(
      `SELECT id, phone, email, fullname, role, is_blocked, created_at, password_plain
       FROM users WHERE id = ? AND role = 'employee'`,
      [req.params.id],
      async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Сотрудник не найден' });
        if (!row.password_plain || !String(row.password_plain).trim()) {
          const recovered = await recoverEmployeePasswordPlain(db, bcrypt, row.id);
          if (recovered) row.password_plain = recovered;
        }
        res.json(row);
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
        sql += `, password = ?, password_plain = ?`;
        params.push(hash, password);
      }
      sql += ` WHERE id = ?`;
      params.push(userId);

      db.run(sql, params, (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        logAction(req.user.id, `Обновил данные сотрудника #${userId}`);
        res.json({
          message: 'Сотрудник обновлён',
          password_plain: password || undefined
        });
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
      `INSERT INTO users (phone, email, fullname, password, password_plain, role) VALUES (?,?,?,?,?,'employee')`,
      [phone, email || null, fullname || null, hash, password],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Телефон уже занят' });
          }
          return res.status(500).json({ error: err.message });
        }
        logAction(req.user.id, `Добавил сотрудника ${fullname || phone}`);
        res.json({ id: this.lastID, password_plain: password });
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
    let sql = `SELECT u.*, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as orders_count
       FROM users u WHERE u.role IN ('client', 'employee')`;
    const params = [];
    if (type === 'employee') {
      sql += ` AND u.role = ?`;
      params.push('employee');
    } else if (type === 'client') {
      sql += ` AND u.role = ?`;
      params.push('client');
    } else if (type && type !== 'all') {
      return res.status(400).json({ error: 'Неверный тип: client, employee или all' });
    }
    sql += ` ORDER BY u.created_at DESC`;
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // ——— Клиент: бронирование столов (просмотр схемы — без входа) ———
  app.get('/api/tables/availability', (req, res) => {
    const { date, time, duration_minutes, guests } = req.query;
    if (!date || !time) return res.status(400).json({ error: 'Укажите дату и время' });
    const durationMin = normalizeBookingDurationMinutes(duration_minutes);
    const guestCount = guests ? parseInt(guests, 10) : 0;
    const now = new Date();

    const moscowToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });

    expireNoShowBookings(db, now, (expErr) => {
      if (expErr) return res.status(500).json({ error: expErr.message });

    function mapTablesResponse(tables, slotBookings, liveBookings) {
      const placed = tables.filter(
        (t) => t.placed === 1 || t.placed === '1' || (parseFloat(t.x) > 0 || parseFloat(t.y) > 0)
      );
      res.json(
        placed.map((t) => {
          const capacity = parseInt(t.capacity, 10) || 1;
          const is_booked = isTableBookedForSlot(t.id, slotBookings, date, time, durationMin, now);
          const too_small = guestCount > 0 && guestCount > capacity;
          const conflict = is_booked
            ? getSlotConflict(t.id, slotBookings, date, time, durationMin, now)
            : null;
          const activeNow = (liveBookings || []).find(
            (b) => Number(b.table_id) === Number(t.id) && isGuestAtTableNow(b, now)
          );
          let is_active_now = false;
          let active_minutes_left = 0;
          let active_end = null;
          if (activeNow) {
            const timing = enrichBookingTiming(activeNow, now);
            is_active_now = true;
            active_minutes_left = timing.minutes_left;
            active_end = getBookingEndTime(activeNow);
          }
          return {
            id: t.id,
            number: t.number,
            capacity,
            x: t.x,
            y: t.y,
            placed: t.placed,
            rotation: t.rotation || 0,
            is_booked,
            too_small,
            conflict,
            is_active_now,
            active_minutes_left,
            active_end
          };
        })
      );
    }

    db.all(`SELECT * FROM tables ORDER BY number`, [], (err, tables) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all(
        `SELECT * FROM bookings WHERE booking_date = ? AND status IN (${BOOKING_STATUSES_OCCUPYING_SQL})`,
        [date],
        (err2, slotBookings) => {
          if (err2) return res.status(500).json({ error: err2.message });
          if (date === moscowToday) {
            return mapTablesResponse(tables, slotBookings, slotBookings);
          }
          db.all(
            `SELECT * FROM bookings WHERE booking_date = ? AND status IN (${BOOKING_STATUSES_OCCUPYING_SQL})`,
            [moscowToday],
            (err3, liveBookings) => {
              if (err3) return res.status(500).json({ error: err3.message });
              mapTablesResponse(tables, slotBookings, liveBookings);
            }
          );
        }
      );
    });
    });
  });

  app.post('/api/bookings', authenticateToken, (req, res) => {
    const {
      table_id,
      booking_date,
      booking_time,
      guests,
      duration_minutes,
      booking_end_date,
      booking_end_time
    } = req.body;
    if (!table_id || !booking_date || !booking_time || !guests) {
      return res.status(400).json({ error: 'Заполните все поля бронирования' });
    }
    let durationMin = normalizeBookingDurationMinutes(duration_minutes);
    if (booking_end_date && booking_end_time) {
      const start = parseBookingStart({ booking_date, booking_time });
      const end = parseBookingStart({ booking_date: booking_end_date, booking_time: booking_end_time });
      const diff = Math.round((end.getTime() - start.getTime()) / 60000);
      if (diff < 60) {
        return res.status(400).json({ error: 'Бронь не короче 1 часа' });
      }
      if (diff > MAX_BOOKING_MINUTES) {
        return res.status(400).json({ error: 'Бронь не дольше 3 часов' });
      }
      durationMin = normalizeBookingDurationMinutes(diff);
    }
    const guestNum = parseInt(guests, 10);
    if (!guestNum || guestNum < 1) {
      return res.status(400).json({ error: 'Укажите количество гостей' });
    }

    db.get(`SELECT capacity FROM tables WHERE id = ?`, [table_id], (err, table) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!table) return res.status(404).json({ error: 'Стол не найден' });
      if (guestNum > parseInt(table.capacity, 10)) {
        return res.status(400).json({ error: 'Слишком много гостей для этого стола' });
      }

      expireNoShowBookings(db, new Date(), (expErr) => {
        if (expErr) return res.status(500).json({ error: expErr.message });
      db.all(
        `SELECT * FROM bookings WHERE booking_date = ? AND status IN (${BOOKING_STATUSES_OCCUPYING_SQL})`,
        [booking_date],
        (err2, bookings) => {
          if (err2) return res.status(500).json({ error: err2.message });
          if (isTableBookedForSlot(table_id, bookings, booking_date, booking_time, durationMin, new Date())) {
            return res.status(400).json({ error: 'Стол уже занят на выбранное время' });
          }

          db.run(
            `INSERT INTO bookings (user_id, table_id, booking_date, booking_time, guests, duration_minutes, status)
             VALUES (?, ?, ?, ?, ?, ?, 'ожидает')`,
            [req.user.id, table_id, booking_date, booking_time, guestNum, durationMin],
            function (err3) {
              if (err3) return res.status(500).json({ error: err3.message });
              res.json({ id: this.lastID, message: 'Бронирование создано', duration_minutes: durationMin });
            }
          );
        }
      );
      });
    });
  });

  app.get('/api/my-bookings', authenticateToken, (req, res) => {
    const now = new Date();
    expireNoShowBookings(db, now, (expErr) => {
      if (expErr) return res.status(500).json({ error: expErr.message });
      db.all(
        `SELECT b.*, t.number as table_number, t.capacity
         FROM bookings b JOIN tables t ON b.table_id = t.id
         WHERE b.user_id = ? ORDER BY b.booking_date DESC, b.booking_time DESC`,
        [req.user.id],
        (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json((rows || []).map((b) => enrichBookingTiming(b, now)));
        }
      );
    });
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
    const CAFE_OPEN = 10 * 60;
    const CAFE_CLOSE = 22 * 60;
    const CAFE_LAST_ORDER = 21 * 60 + 30;

    if (minutes < CAFE_OPEN || minutes > CAFE_CLOSE) {
      return res.status(400).json({ error: 'Время работы кофейни: 10:00–22:00 (МСК)' });
    }
    if (minutes >= CAFE_CLOSE) {
      return res.status(400).json({ error: 'Нельзя выбрать время закрытия кофейни' });
    }
    if (minutes > CAFE_LAST_ORDER) {
      return res.status(400).json({ error: 'Заказ принимается не позже чем за 20 минут до закрытия (последний слот 21:30)' });
    }

    const moscowParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23'
    }).formatToParts(new Date());
    const moscowHour = parseInt(moscowParts.find((p) => p.type === 'hour').value, 10);
    const moscowMinute = parseInt(moscowParts.find((p) => p.type === 'minute').value, 10);
    const minTotal = moscowHour * 60 + moscowMinute + 30;
    const orderTotal = minutes;
    const isToday = date === moscowToday;
    if (isToday && orderTotal < minTotal) {
      return res.status(400).json({ error: 'Минимум +30 минут от текущего времени (МСК) на сбор заказа' });
    }

    const pay = paymentMethod === 'card' ? 'банковская карта' : 'наличные';
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
          db.run(
            `UPDATE menu_items SET popularity = COALESCE(popularity, 0) + ? WHERE id = ?`,
            [item.quantity, item.id]
          );
        });
        res.json({ id: orderId, message: 'Заказ создан' });
      }
    );
  });

  backfillEmployeePasswordPlain(db, bcrypt);
};
