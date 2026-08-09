import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.GOOGLE_SMTP_HOST,
  port: parseInt(process.env.GOOGLE_SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.GOOGLE_SMTP_USER,
    pass: process.env.GOOGLE_SMTP_PASSWORD,
  },
});

export async function notifyApiFailure(source: string, error: Error) {
  try {
    await transporter.sendMail({
      from: process.env.GOOGLE_SMTP_USER,
      to: 'elf.serin91@gmail.com',
      subject: `[SkillPilot] ${source} API 실패`,
      text: `에러: ${error.message}\n시간: ${new Date().toISOString()}`,
    });
  } catch (e) {
    console.error('알림 이메일 발송 실패:', e);
  }
}
