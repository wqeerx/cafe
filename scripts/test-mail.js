const path = require('path');
const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });
if (!process.env.SMTP_USER) {
  require('dotenv').config({ path: path.join(root, '.env.example') });
}
const { sendVerificationCode, isConfigured } = require('../backend/mail');

const to = process.env.TEST_EMAIL || process.env.SMTP_USER;

(async () => {
  if (!isConfigured()) {
    console.error('SMTP не настроен: нужны SMTP_USER и SMTP_PASS в .env');
    process.exit(1);
  }
  console.log('Отправка тестового кода на', to, 'через', process.env.SMTP_USER);
  try {
    await sendVerificationCode(to, '123456', 'register');
    console.log('OK: письмо отправлено');
  } catch (e) {
    console.error('Ошибка:', e.message);
    process.exit(1);
  }
})();
