/**
 * FRONTEND_URL ใส่ได้หลายโดเมนคั่นด้วยคอมมา (ใช้กับ CORS)
 * แต่เวลาสร้างลิงก์ส่งให้ผู้ใช้ เช่น ลิงก์รีเซ็ตรหัสผ่านหรือ redirect หลังล็อกอิน
 * ต้องได้โดเมนเดียว จึงหยิบตัวแรกในรายการมาใช้เสมอ
 */
export function getFrontendUrl(): string {
  const raw = process.env.FRONTEND_URL || 'http://localhost:3000';
  const first = raw.split(',')[0].trim().replace(/\/+$/, '');
  return first || 'http://localhost:3000';
}
