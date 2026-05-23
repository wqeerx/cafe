const crypto = require('crypto');
const { sendVerificationCode } = require('./mail');

const CODE_EXPIRY_MIN = 15;
const RATE_LIMIT_SEC = 60;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function clientToken(user, jwt, SECRET) {
  return jwt.sign(
    { id: user.id, phone: user.phone, email: user.email, role: user.role },
    SECRET,
    { expiresIn: '7d' }
  );
}

function clientUserResponse(user) {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    fullname: user.fullname,
    role: user.role
  };
}

module.exports = function registerAuthEmailRoutes(app, db, deps) {
  const { bcrypt, jwt, SECRET, validatePassword, validatePhone, logAction, authenticateToken } = deps;

  function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  }

  function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  async function checkRateLimit(email, purpose) {
    const row = await dbGet(
      `SELECT created_at FROM email_verifications
       WHERE email = ? AND purpose = ?
       ORDER BY id DESC LIMIT 1`,
      [email, purpose]
    );
    if (!row) return;
    const last = new Date(row.created_at).getTime();
    if (Date.now() - last < RATE_LIMIT_SEC * 1000) {
      const err = new Error('RATE_LIMIT');
      err.waitSec = Math.ceil((RATE_LIMIT_SEC * 1000 - (Date.now() - last)) / 1000);
      throw err;
    }
  }

  async function saveAndSendCode(email, purpose, payload) {
    await checkRateLimit(email, purpose);
    const code = generateCode();

    const mailResult = await sendVerificationCode(email, code, purpose);

    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MIN * 60 * 1000).toISOString();
    await dbRun(`DELETE FROM email_verifications WHERE email = ? AND purpose = ?`, [email, purpose]);
    await dbRun(
      `INSERT INTO email_verifications (email, code_hash, purpose, payload, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [email, codeHash, purpose, payload ? JSON.stringify(payload) : null, expiresAt]
    );

    const out = {
      message: `Код отправлен на ${email}.`,
      email,
      mailSent: !mailResult.dev
    };
    if (mailResult.dev) {
      out.devMode = true;
      out.devCode = code;
      out.message = 'Почта не настроена. Код в консоли сервера.';
    }
    return out;
  }

  async function findValidVerification(email, code, purpose) {
    const row = await dbGet(
      `SELECT * FROM email_verifications
       WHERE email = ? AND purpose = ?
       ORDER BY id DESC LIMIT 1`,
      [email, purpose]
    );
    if (!row) return null;
    if (new Date(row.expires_at) < new Date()) return null;
    const ok = await bcrypt.compare(String(code).trim(), row.code_hash);
    return ok ? row : null;
  }

  // ——— Регистрация ———
  app.post('/api/auth/register/send-code', async (req, res) => {
    try {
      const { fullname, phone, email } = req.body;
      const normEmail = normalizeEmail(email);

      if (!fullname || !phone || !normEmail) {
        return res.status(400).json({ error: 'Заполните ФИО, телефон и email' });
      }
      if (!isValidEmail(normEmail)) {
        return res.status(400).json({ error: 'Некорректный email' });
      }
      if (!validatePhone(phone)) {
        return res.status(400).json({ error: 'Телефон: формат +375 и 9 цифр' });
      }

      const existingEmail = await dbGet(`SELECT id FROM users WHERE LOWER(email) = ?`, [normEmail]);
      if (existingEmail) {
        return res.status(400).json({ error: 'Этот email уже зарегистрирован' });
      }
      const existingPhone = await dbGet(`SELECT id FROM users WHERE phone = ?`, [phone]);
      if (existingPhone) {
        return res.status(400).json({ error: 'Этот телефон уже зарегистрирован' });
      }

      const result = await saveAndSendCode(normEmail, 'register', { fullname, phone });
      res.json(result);
    } catch (e) {
      if (e.message === 'RATE_LIMIT') {
        return res.status(429).json({ error: `Подождите ${e.waitSec} сек. перед повторной отправкой` });
      }
      console.error(e);
      res.status(500).json({ error: e.message || 'Не удалось отправить код' });
    }
  });

  app.post('/api/auth/register/verify-code', async (req, res) => {
    const normEmail = normalizeEmail(req.body.email);
    const { code } = req.body;
    if (!normEmail || !code) {
      return res.status(400).json({ error: 'Укажите email и код' });
    }
    const row = await findValidVerification(normEmail, code, 'register');
    if (!row) return res.status(400).json({ error: 'Неверный или просроченный код' });
    res.json({ valid: true });
  });

  app.post('/api/auth/register/complete', async (req, res) => {
    try {
      const normEmail = normalizeEmail(req.body.email);
      const { code, password } = req.body;

      if (!normEmail || !code || !password) {
        return res.status(400).json({ error: 'Укажите email, код и пароль' });
      }
      if (!validatePassword(password)) {
        return res.status(400).json({
          error: 'Пароль: мин. 7 символов, заглавная буква, цифра и спецсимвол'
        });
      }

      const row = await findValidVerification(normEmail, code, 'register');
      if (!row) return res.status(400).json({ error: 'Неверный или просроченный код' });

      let payload = {};
      try {
        payload = row.payload ? JSON.parse(row.payload) : {};
      } catch (_) {}

      const { fullname, phone } = payload;
      if (!fullname || !phone) {
        return res.status(400).json({ error: 'Сессия регистрации истекла. Начните сначала.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const insert = await dbRun(
        `INSERT INTO users (fullname, phone, email, password, role) VALUES (?, ?, ?, ?, 'client')`,
        [fullname, phone, normEmail, hashedPassword]
      );

      await dbRun(`DELETE FROM email_verifications WHERE email = ? AND purpose = 'register'`, [normEmail]);

      const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [insert.lastID]);
      logAction(user.id, 'Регистрация клиента');

      res.json({
        token: clientToken(user, jwt, SECRET),
        user: clientUserResponse(user),
        message: 'Регистрация завершена'
      });
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Email или телефон уже заняты' });
      }
      console.error(e);
      res.status(500).json({ error: 'Ошибка регистрации' });
    }
  });

  // ——— Вход клиента ———
  app.post('/api/auth/login', (req, res) => {
    const normEmail = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!normEmail || !password) {
      return res.status(400).json({ error: 'Укажите email и пароль' });
    }

    db.get(`SELECT * FROM users WHERE LOWER(email) = ?`, [normEmail], async (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Неверный email или пароль' });
      }
      if (user.role !== 'client') {
        return res.status(403).json({ error: 'Для сотрудников используйте вход по телефону' });
      }
      if (user.is_blocked === 1) {
        return res.status(403).json({ error: 'Ваш аккаунт заблокирован. Обратитесь к администратору.' });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: 'Неверный email или пароль' });

      logAction(user.id, 'Вход клиента');
      res.json({
        token: clientToken(user, jwt, SECRET),
        user: clientUserResponse(user)
      });
    });
  });

  // ——— Забыли пароль ———
  app.post('/api/auth/forgot-password/send-code', async (req, res) => {
    try {
      const normEmail = normalizeEmail(req.body.email);
      if (!normEmail || !isValidEmail(normEmail)) {
        return res.status(400).json({ error: 'Введите корректный email' });
      }

      const user = await dbGet(
        `SELECT id, role FROM users WHERE LOWER(email) = ?`,
        [normEmail]
      );
      if (!user || user.role !== 'client') {
        return res.status(404).json({
          error: 'Аккаунт с таким email не найден.',
          suggestRegister: true
        });
      }

      const result = await saveAndSendCode(normEmail, 'reset_password', null);
      res.json({
        message: `Код отправлен на ${normEmail}.`,
        mailSent: true,
        ...(result.devMode ? { devMode: true, devCode: result.devCode } : {})
      });
    } catch (e) {
      if (e.message === 'RATE_LIMIT') {
        return res.status(429).json({ error: `Подождите ${e.waitSec} сек.` });
      }
      console.error(e);
      res.status(500).json({ error: e.message || 'Не удалось отправить код' });
    }
  });

  app.post('/api/auth/forgot-password/reset', async (req, res) => {
    try {
      const normEmail = normalizeEmail(req.body.email);
      const { code, password } = req.body;

      if (!normEmail || !code || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
      }
      if (!validatePassword(password)) {
        return res.status(400).json({
          error: 'Пароль: мин. 7 символов, заглавная буква, цифра и спецсимвол'
        });
      }

      const row = await findValidVerification(normEmail, code, 'reset_password');
      if (!row) return res.status(400).json({ error: 'Неверный или просроченный код' });

      const user = await dbGet(`SELECT id FROM users WHERE LOWER(email) = ? AND role = 'client'`, [normEmail]);
      if (!user) return res.status(400).json({ error: 'Аккаунт не найден' });

      const hash = await bcrypt.hash(password, 10);
      await dbRun(`UPDATE users SET password = ? WHERE id = ?`, [hash, user.id]);
      await dbRun(`DELETE FROM email_verifications WHERE email = ? AND purpose = 'reset_password'`, [normEmail]);
      logAction(user.id, 'Сброс пароля');

      res.json({ message: 'Пароль обновлён. Теперь можно войти.' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Ошибка сброса пароля' });
    }
  });

  // ——— Смена пароля в профиле ———
  app.post('/api/auth/change-password/send-code', authenticateToken, async (req, res) => {
    try {
      const user = await dbGet(`SELECT id, email, role FROM users WHERE id = ?`, [req.user.id]);
      if (!user || user.role !== 'client') {
        return res.status(403).json({ error: 'Доступно только клиентам' });
      }
      if (!user.email) {
        return res.status(400).json({ error: 'У аккаунта нет email' });
      }

      const normEmail = normalizeEmail(user.email);
      const result = await saveAndSendCode(normEmail, 'change_password', null);
      res.json({
        message: result.devMode
          ? 'Почта не настроена — код в консоли сервера'
          : `Код отправлен на ${normEmail}.`,
        mailSent: !result.devMode,
        email: normEmail,
        ...(result.devMode ? { devMode: true, devCode: result.devCode } : {})
      });
    } catch (e) {
      if (e.message === 'RATE_LIMIT') {
        return res.status(429).json({ error: `Подождите ${e.waitSec} сек.` });
      }
      console.error(e);
      res.status(500).json({ error: e.message || 'Не удалось отправить код' });
    }
  });

  app.post('/api/auth/change-password/confirm', authenticateToken, async (req, res) => {
    try {
      const { code, password } = req.body;
      const user = await dbGet(`SELECT id, email, role FROM users WHERE id = ?`, [req.user.id]);
      if (!user || user.role !== 'client') {
        return res.status(403).json({ error: 'Доступно только клиентам' });
      }
      if (!validatePassword(password)) {
        return res.status(400).json({
          error: 'Пароль: мин. 7 символов, заглавная буква, цифра и спецсимвол'
        });
      }

      const normEmail = normalizeEmail(user.email);
      const row = await findValidVerification(normEmail, code, 'change_password');
      if (!row) return res.status(400).json({ error: 'Неверный или просроченный код' });

      const hash = await bcrypt.hash(password, 10);
      await dbRun(`UPDATE users SET password = ? WHERE id = ?`, [hash, user.id]);
      await dbRun(`DELETE FROM email_verifications WHERE email = ? AND purpose = 'change_password'`, [normEmail]);
      logAction(user.id, 'Смена пароля');

      res.json({ message: 'Пароль изменён' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Ошибка смены пароля' });
    }
  });
};
