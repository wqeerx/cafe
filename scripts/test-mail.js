const loaded = require('../backend/load-env').loadEnv();
if (!loaded) {
  console.error('Файл .env не найден. Запустите: npm run setup:env');
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
