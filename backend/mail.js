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

function buildEmailHtml(code, label) {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px;background:#fff9f5;font-family:Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr><td style="background:#2d2418;color:#f5e6d3;padding:24px 28px;border-radius:16px 16px 0 0;">
      <div style="font-size:26px;font-weight:bold;letter-spacing:2px;">Zerno Coffee</div>
      <div style="font-size:14px;opacity:0.85;margin-top:6px;">Кофейня</div>
    </td></tr>
    <tr><td style="background:#ffffff;padding:28px;border:1px solid #e8dcc8;border-top:none;border-radius:0 0 16px 16px;">
      <p style="margin:0 0 12px;color:#2d2418;font-size:16px;">Здравствуйте!</p>
      <p style="margin:0 0 20px;color:#4a3a2a;font-size:15px;line-height:1.5;">Ваш код для <strong>${label}</strong>:</p>
      <div style="text-align:center;background:#fef8f0;border:2px dashed #c4a882;border-radius:12px;padding:20px;margin:0 0 20px;">
        <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#5a3725;">${code}</span>
      </div>
      <p style="margin:0;color:#7a5a4a;font-size:13px;line-height:1.5;">Код действует <strong>15 минут</strong>.<br>Если вы не запрашивали это письмо — просто проигнорируйте его.</p>
    </td></tr>
    <tr><td style="padding:16px 8px;text-align:center;color:#999;font-size:12px;">
      © Zerno Coffee · zerno.coffee.by@gmail.com
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendVerificationCode(to, code, purpose) {
  const label = PURPOSE_LABELS[purpose] || 'подтверждение';
  const subject = `Zerno Coffee — код: ${code}`;
  const text = [
    'Zerno Coffee',
    '',
    `Код для ${label}: ${code}`,
    '',
    'Код действует 15 минут.',
    'Если вы не запрашивали письмо — проигнорируйте его.'
  ].join('\n');

  const html = buildEmailHtml(code, label);

  const transport = getTransporter();
  if (!transport) {
    console.log(`[Zerno Mail] ${purpose} → ${to}: код ${code}`);
    console.log('[Zerno Mail] SMTP не настроен — создайте .env (npm run setup:env)');
    return { ok: true, dev: true };
  }

  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || `"Zerno Coffee" <${process.env.SMTP_USER}>`,
      replyTo: process.env.SMTP_USER,
      to,
      subject,
      text,
      html
    });
    console.log(`[Zerno Mail] ✓ ${purpose} → ${to}`);
    return { ok: true };
  } catch (err) {
    console.error('[Zerno Mail] Ошибка SMTP:', err.message);
    const hint = err.message.includes('535') || err.message.includes('BadCredentials')
      ? 'Неверный пароль приложения Gmail. Создайте новый: https://myaccount.google.com/apppasswords'
      : err.message;
    throw new Error(hint);
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
