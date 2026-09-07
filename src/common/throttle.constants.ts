/**
 * ค่าคงที่ของ rate limiting — แยกไว้ไฟล์นี้เพราะทั้ง AppModule และ controller ต่าง ๆ
 * ต้องใช้ ถ้าประกาศไว้ใน app.module.ts จะเกิด circular import
 * (controller → app.module → FeatureModule → controller) ทำให้ค่าที่ decorator
 * อ่านได้ตอนโหลดโมดูลเป็น undefined และ @Throttle ไม่ทำงานแบบเงียบ ๆ
 */

/** หน้าต่างเวลาของ rate limit ทุกตัว (มิลลิวินาที) */
export const THROTTLE_TTL = 60000; // 1 นาที

/** เพดานรวมต่อ IP */
export const GLOBAL_THROTTLE_LIMIT = 300;

/** limit จริงของ auth endpoints — ระบุใน @Throttle ไม่ใช่ใน forRoot */
export const AUTH_THROTTLE_LIMIT = 60;

/** limit จริงของ payment endpoints — กันสแปมอัปโหลดสลิป/generate QR */
export const PAYMENT_THROTTLE_LIMIT = 10;
