const nodemailer = require('nodemailer');

let transporter = null;

function isConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
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
    console.log(`[Zerno Mail] ${purpose} → ${to}: код ${code} (SMTP не настроен, см. .env)`);
    return { ok: true, dev: true };
  }

  await transport.sendMail({
    from: process.env.MAIL_FROM || `"Zerno Coffee" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });
  return { ok: true };
}

module.exports = { sendVerificationCode, isConfigured };
