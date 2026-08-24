import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsDate,
  IsInt,
  IsOptional,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Match } from '../../common/decorators/match.decorator';

export class CreateUserDto {
  @IsNotEmpty({ message: 'กรุณากรอกชื่อ' })
  @IsString()
  first_name: string;

  @IsNotEmpty({ message: 'กรุณากรอกนามสกุล' })
  @IsString()
  last_name: string;

  @IsNotEmpty({ message: 'กรุณากรอกอีเมล' })
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  email: string;

  @IsNotEmpty({ message: 'กรุณากรอกเบอร์โทรศัพท์' })
  @Matches(/^0[0-9]{9}$/, {
    message: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (ตัวเลข 10 หลัก เช่น 0812345678)',
  })
  tel: string;

  @IsNotEmpty({ message: 'กรุณากรอกรหัสผ่าน' })
  @MinLength(8, { message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' })
  password: string;

  @IsNotEmpty({ message: 'กรุณายืนยันรหัสผ่าน' })
  @Match('password', { message: 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน' })
  confirm_password: string;

  @IsNotEmpty({ message: 'กรุณาระบุวันเดือนปีเกิด' })
  @Type(() => Date)
  bod: Date;

  @IsOptional()
  @IsInt()
  university_id?: number | null;

  @IsOptional()
  @IsString()
  profile_picture?: string;
}
