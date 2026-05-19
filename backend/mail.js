require('./load-env').loadEnv();
const nodemailer = require('nodemailer');

let transporter = null;

function getSmtpPass() {
  return String(process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
}

function isConfigured() {
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = getSmtpPass();
  return !!(user && pass && pass !== 'ваш_пароль_приложения_gmail');
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: String(process.env.SMTP_USER).trim(),
        pass: getSmtpPass()
      }
    });
  }
  return transporter;
}

const PURPOSE_LABELS = {
  register: 'подтверждение регистрации',
  reset_password: 'восстановление пароля',
  change_password: 'смена пароля'
};

async function sendVerificationCode(to, code, purpose) {
  const label = PURPOSE_LABELS[purpose] || 'подтверждение';
  const subject = `Zerno Coffee — код для ${label}`;
  const text = [
    'Здравствуйте!',
    '',
    `Ваш код для ${label}: ${code}`,
    '',
    'Код действует 15 минут. Если вы не запрашивали это письмо, просто проигнорируйте его.',
    '',
    'С уважением,',
    'Zerno Coffee'
  ].join('\n');

  const html = `<div style="font-family:Segoe UI,sans-serif;max-width:480px;color:#2d2418">
<h2>Zerno Coffee</h2>
<p>Код для ${label}:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#5a3725">${code}</p>
<p style="color:#7a5a4a;font-size:14px">Код действует 15 минут.</p>
</div>`;

  const transport = getTransporter();
  if (!transport) {
    console.log(`[Zerno Mail] ${purpose} → ${to}: код ${code}`);
    console.log('[Zerno Mail] SMTP не настроен. Создайте файл .env в корне проекта (см. .env.example)');
    return { ok: true, dev: true };
  }

  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || `"Zerno Coffee" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html
    });
    console.log(`[Zerno Mail] Письмо отправлено → ${to}`);
    return { ok: true };
  } catch (err) {
    console.error('[Zerno Mail] Ошибка SMTP:', err.message);
    const hint = err.message.includes('535') || err.message.includes('BadCredentials')
      ? 'Неверный пароль приложения Gmail. Создайте новый: https://myaccount.google.com/apppasswords'
      : err.message;
    const error = new Error(hint);
    error.cause = err;
    throw error;
  }
}

async function verifySmtpConnection() {
  if (!isConfigured()) return { ok: false, reason: 'no_env' };
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { sendVerificationCode, isConfigured, verifySmtpConnection };
