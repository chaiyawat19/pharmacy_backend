import { IsInt, IsOptional, IsIn } from 'class-validator';

export class SetUserRoleDto {
  /**
   * สิทธิ์ที่ต้องการตั้งให้: 1 = ผู้ใช้ทั่วไป, 2 = ผู้ดูแลระบบ
   * ไม่ส่งมา (undefined/null) = ล้าง override แล้วให้ระบบคำนวณเองตาม subscription
   * ตั้งเป็น 3 (Super Admin) ผ่าน API ไม่ได้ ต้องแก้ที่ DB
   */
  @IsOptional()
  @IsInt()
  @IsIn([1, 2])
  role_id?: number | null;
}
