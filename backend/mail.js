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

function buildOrderEmailHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px;background:#fff9f5;font-family:Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr><td style="background:#2d2418;color:#f5e6d3;padding:24px 28px;border-radius:16px 16px 0 0;">
      <div style="font-size:26px;font-weight:bold;letter-spacing:2px;">Zerno Coffee</div>
      <div style="font-size:14px;opacity:0.85;margin-top:6px;">${title}</div>
    </td></tr>
    <tr><td style="background:#ffffff;padding:28px;border:1px solid #e8dcc8;border-top:none;border-radius:0 0 16px 16px;">
      ${bodyHtml}
    </td></tr>
    <tr><td style="padding:16px 8px;text-align:center;color:#999;font-size:12px;">
      © Zerno Coffee · zerno.coffee.by@gmail.com
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendMailMessage(to, subject, text, html) {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[Zerno Mail] ${subject} → ${to}`);
    console.log(text);
    return { ok: true, dev: true };
  }
  await transport.sendMail({
    from: process.env.MAIL_FROM || `"Zerno Coffee" <${process.env.SMTP_USER}>`,
    replyTo: process.env.SMTP_USER,
    to,
    subject,
    text,
    html
  });
  console.log(`[Zerno Mail] ✓ ${subject} → ${to}`);
  return { ok: true };
}

async function sendPickupCodeEmail(to, order, code) {
  const name = order.user_name || order.fullname || 'гость';
  const subject = `Zerno Coffee — заказ #${order.id} готов к выдаче`;
  const text = [
    `Здравствуйте, ${name}!`,
    '',
    `Ваш заказ #${order.id} готов к выдаче.`,
    `Самовывоз: ${order.order_date} в ${order.order_time}.`,
    '',
    `Код для получения: ${code}`,
    '',
    'Назовите этот код сотруднику на кассе.'
  ].join('\n');
  const html = buildOrderEmailHtml('Заказ готов к выдаче', `
    <p style="margin:0 0 12px;color:#2d2418;font-size:16px;">Здравствуйте, ${name}!</p>
    <p style="margin:0 0 16px;color:#4a3a2a;font-size:15px;line-height:1.5;">Ваш заказ <strong>#${order.id}</strong> готов к выдаче.<br>
    Самовывоз: <strong>${order.order_date}</strong> в <strong>${order.order_time}</strong>.</p>
    <p style="margin:0 0 12px;color:#4a3a2a;font-size:15px;">Код для получения заказа:</p>
    <div style="text-align:center;background:#fef8f0;border:2px dashed #c4a882;border-radius:12px;padding:20px;margin:0 0 20px;">
      <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#5a3725;">${code}</span>
    </div>
    <p style="margin:0;color:#7a5a4a;font-size:13px;line-height:1.5;">Назовите этот код сотруднику на кассе.</p>
  `);
  return sendMailMessage(to, subject, text, html);
}

function formatBookingDurationMail(mins) {
  const m = parseInt(mins, 10) || 120;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h} ч ${r} мин`;
  if (h > 0) return `${h} ч`;
  return `${r} мин`;
}

async function sendBookingConfirmedEmail(to, booking) {
  const { formatBookingPeriod, getBookingEndTime, formatDateMoscow, getBookingWindow } = require('./booking-utils');
  const name = booking.user_name || 'гость';
  const endDate = booking.booking_end_date || formatDateMoscow(getBookingWindow(booking).end);
  const endTime = booking.booking_end_time || getBookingEndTime(booking);
  const period = formatBookingPeriod(booking);
  const subject = `Zerno Coffee — бронь стола №${booking.table_number} подтверждена`;
  const text = [
    `Здравствуйте, ${name}!`,
    '',
    `Ваша бронь подтверждена.`,
    `Стол №${booking.table_number}, ${booking.guests} гостей.`,
    `Начало: ${booking.booking_date} в ${booking.booking_time}.`,
    `Окончание брони: ${endDate} в ${endTime}.`,
    'На опоздание — 30 минут с начала брони, затем бронь снимается, если вы не пришли.',
    '',
    'У всех столов есть розетки.',
    '',
    'Ждём вас в Zerno Coffee!'
  ].join('\n');
  const html = buildOrderEmailHtml('Бронь подтверждена', `
    <p style="margin:0 0 12px;color:#2d2418;font-size:16px;">Здравствуйте, ${name}!</p>
    <p style="margin:0 0 16px;color:#4a3a2a;font-size:15px;line-height:1.5;">Ваша бронь <strong>подтверждена</strong>.</p>
    <p style="margin:0 0 8px;color:#4a3a2a;font-size:15px;"><strong>Стол №${booking.table_number}</strong> · ${booking.guests} гостей</p>
    <p style="margin:0 0 8px;color:#4a3a2a;font-size:15px;">${period}</p>
    <p style="margin:0 0 8px;color:#7a5a4a;font-size:14px;">Опоздание: 30 мин с начала, иначе бронь отменяется. У столов есть розетки.</p>
    <p style="margin:16px 0 0;color:#7a5a4a;font-size:14px;">Ждём вас в Zerno Coffee ☕</p>
  `);
  return sendMailMessage(to, subject, text, html);
}

async function sendBookingVisitCompletedEmail(to, booking) {
  const name = booking.user_name || 'гость';
  const subject = `Zerno Coffee — спасибо за визит!`;
  const text = [
    `Здравствуйте, ${name}!`,
    '',
    `Мы отметили ваш визит по брони стола №${booking.table_number} (${booking.booking_date} в ${booking.booking_time}).`,
    '',
    'Спасибо, что были с нами!',
    'Ждём вас снова в Zerno Coffee.'
  ].join('\n');
  const html = buildOrderEmailHtml('Визит по брони', `
    <p style="margin:0 0 12px;color:#2d2418;font-size:16px;">Здравствуйте, ${name}!</p>
    <p style="margin:0 0 16px;color:#4a3a2a;font-size:15px;line-height:1.5;">Мы отметили ваш визит по брони <strong>стола №${booking.table_number}</strong><br>
    ${booking.booking_date} в ${booking.booking_time}.</p>
    <p style="margin:0 0 8px;color:#4a3a2a;font-size:16px;line-height:1.6;">Спасибо, что были с нами!</p>
    <p style="margin:16px 0 0;color:#7a5a4a;font-size:14px;">Ждём вас снова в Zerno Coffee ☕</p>
  `);
  return sendMailMessage(to, subject, text, html);
}

async function sendOrderCompletedEmail(to, order) {
  const name = order.user_name || order.fullname || 'гость';
  const subject = `Zerno Coffee — приятного аппетита!`;
  const text = [
    `Здравствуйте, ${name}!`,
    '',
    `Ваш заказ #${order.id} выдан.`,
    '',
    'Желаем вам хорошего дня и приятного аппетита!',
    '',
    'Спасибо, что выбрали Zerno Coffee.'
  ].join('\n');
  const html = buildOrderEmailHtml('Заказ выдан', `
    <p style="margin:0 0 12px;color:#2d2418;font-size:16px;">Здравствуйте, ${name}!</p>
    <p style="margin:0 0 16px;color:#4a3a2a;font-size:15px;line-height:1.5;">Ваш заказ <strong>#${order.id}</strong> выдан.</p>
    <p style="margin:0 0 8px;color:#4a3a2a;font-size:16px;line-height:1.6;">Желаем вам <strong>хорошего дня</strong> и <strong>приятного аппетита</strong>!</p>
    <p style="margin:16px 0 0;color:#7a5a4a;font-size:14px;">Спасибо, что выбрали Zerno Coffee ☕</p>
  `);
  return sendMailMessage(to, subject, text, html);
}

module.exports = {
  sendVerificationCode,
  sendPickupCodeEmail,
  sendOrderCompletedEmail,
  sendBookingConfirmedEmail,
  sendBookingVisitCompletedEmail,
  isConfigured,
  verifySmtpConnection
};
