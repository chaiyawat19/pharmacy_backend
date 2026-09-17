import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Match } from '../../common/decorators/match.decorator';

/** ตั้งรหัสผ่านครั้งแรกสำหรับบัญชีที่สมัครผ่าน Google (ยังไม่มีรหัสผ่าน) */
export class SetPasswordDto {
  @IsNotEmpty({ message: 'กรุณากรอกรหัสผ่าน' })
  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' })
  password: string;

  @IsNotEmpty({ message: 'กรุณายืนยันรหัสผ่าน' })
  @Match('password', { message: 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน' })
  confirm_password: string;
}
