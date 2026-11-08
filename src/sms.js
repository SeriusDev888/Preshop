// การส่ง SMS รหัส OTP
//
// ค่าเริ่มต้นเป็น "โหมดทดสอบ": ไม่ส่ง SMS จริง แต่พิมพ์รหัสลง console ของเซิร์ฟเวอร์
// และส่งรหัสกลับไปให้หน้าเว็บแสดง เพื่อให้ลองระบบได้ทันที
//
// ใช้งานจริง: ตั้งค่า environment variable
//   SMS_PROVIDER=thaibulksms
//   SMS_API_KEY=...  SMS_API_SECRET=...  SMS_SENDER=...
// หรือเพิ่ม provider อื่นในฟังก์ชัน sendSms ด้านล่าง

const PROVIDER = (process.env.SMS_PROVIDER || '').toLowerCase();
export const SMS_DEV = !PROVIDER;

export async function sendSms(phone, message) {
  if (SMS_DEV) {
    console.log(`[SMS ทดสอบ] ถึง ${phone}: ${message}`);
    return;
  }

  if (PROVIDER === 'thaibulksms') {
    const key = process.env.SMS_API_KEY;
    const secret = process.env.SMS_API_SECRET;
    const body = new URLSearchParams({
      msisdn: phone,
      message,
      sender: process.env.SMS_SENDER || 'Preshop',
    });
    const res = await fetch('https://api-v2.thaibulksms.com/sms', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`SMS provider error ${res.status}: ${text.slice(0, 200)}`);
    }
    return;
  }

  throw new Error(`ไม่รู้จัก SMS_PROVIDER: ${PROVIDER}`);
}
