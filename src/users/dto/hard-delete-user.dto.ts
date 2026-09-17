import { IsNotEmpty, IsString } from 'class-validator';

export class HardDeleteUserDto {
  /**
   * อีเมลปัจจุบันของผู้ใช้ที่จะลบ — ต้องพิมพ์ให้ตรงถึงจะลบได้
   * กันกดพลาดใส่ id ผิดคน เพราะคำสั่งนี้ย้อนกลับไม่ได้และไม่มีสำเนาเหลือ
   * (บัญชีที่ถูก anonymize แล้วให้ใช้อีเมล deleted-user-<id>@anonymized.invalid)
   */
  @IsString()
  @IsNotEmpty({ message: 'กรุณายืนยันด้วยอีเมลของผู้ใช้ที่ต้องการลบถาวร' })
  confirm_email: string;
}
