import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  // ===== LOGIN ปกติ =====
  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.userService.findByEmail(email);

    if (!user || !user.password) {
      // 🔥 ถ้าเป็น Google user → ห้าม login แบบ local
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    return {
      id: user.user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role_id: user.role_id,
    };
  }


  async login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role_id: user.role_id,
      first_name: user.first_name,
      last_name: user.last_name,
      university: user.university?.name,
    };

    const accessToken = this.jwtService.sign(payload);
    return { accessToken, role_id: user.role_id };
  }

  async socialLogin(profile: any): Promise<string> {
    let user = await this.userService.findByEmail(profile.email);

    if (!user) {
      user = await this.userService.createSocialUser({
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        provider: 'google',
      });
    }

    return this.jwtService.sign({
      sub: user.user_id,
      email: user.email,
      role_id: user.role_id,
    });
  }

  // ใน auth.service.ts หรือจุดที่คุณวาง forgotPassword
  async forgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      return { message: 'ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว (หากมีอีเมลในระบบ)' };
    }

    const token = crypto.randomBytes(32).toString('hex');

    // บันทึก Token ลง DB ก่อนส่งเมล
    user.reset_password_token = token;
    user.reset_password_expires = new Date(Date.now() + 15 * 60 * 1000);
    await this.userService.save(user);

    const resetLink = `http://localhost:3000/reset-password?token=${token}`;

    try {
      await this.mailService.sendResetPassword(email, resetLink);
      return { message: 'ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว' };
    } catch (err) {
      // ถ้าส่งเมลไม่สำเร็จ ควรลบ token ทิ้งหรือแจ้ง error
      user.reset_password_token = null;
      user.reset_password_expires = null;
      await this.userService.save(user);
      throw err;
    }
  }

  async resetPassword(token: string, newPassword: string) {
    // 1. ค้นหา User
    const user = await this.userService.findOneByResetToken(token);

    if (!user) {
      // ถ้าเจอ Error นี้ แปลว่า Token ใน DB กับที่ส่งมาไม่ตรงกันเป๊ะๆ (เช็คเรื่องช่องว่าง/ตัวอักษร)
      throw new BadRequestException('Invalid Token: Not found in database');
    }

    // 2. เช็คเวลา (ลอง Log ออกมาดูเปรียบเทียบ)
    const now = new Date();
    console.log('User Expire Time (DB):', user.reset_password_expires);
    console.log('Current Time (Now):', now);

    if (!user.reset_password_expires || user.reset_password_expires < now) {
      // ถ้าเจอ Error นี้ แปลว่าติดเรื่องเวลาหมดอายุแน่นอน
      throw new BadRequestException(`Link Expired. DB: ${user.reset_password_expires} vs Now: ${now}`);
    }

    // 3. ถ้าผ่านสองจุดบนมาได้ แปลว่า Error อาจจะเกิดที่การ Save
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      user.reset_password_token = null;
      user.reset_password_expires = null;

      return await this.userService.save(user);
    } catch (error) {
      throw new BadRequestException('Error while saving new password: ' + error.message);
    }
  }
}
