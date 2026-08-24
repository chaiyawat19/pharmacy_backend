import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsNotEmpty({ message: 'กรุณาระบุโทเค็น' })
  @IsString()
  token: string;

  @IsNotEmpty({ message: 'กรุณาระบุรหัสผ่านใหม่' })
  @IsString()
  @MinLength(8, { message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร' })
  newPassword: string;
}
