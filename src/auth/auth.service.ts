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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { OTP } from './entities/otp.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    @InjectRepository(OTP)
    private readonly otpRepo: Repository<OTP>,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.userService.findByEmail(email);

    if (!user || !user.password) {
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
  login(user: any) {
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
        profile_picture: profile.profile_picture,
      });
    } else if (profile.profile_picture && user.profile_picture !== profile.profile_picture) {
      // อัปเดตรูปโปรไฟล์ถ้ามีการเปลี่ยนแปลงจาก Google
      user.profile_picture = profile.profile_picture;
      await this.userService.save(user);
    }

    return this.jwtService.sign({
      sub: user.user_id,
      email: user.email,
      role_id: user.role_id,
    });
  }
  async forgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      return { message: 'ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว (หากมีอีเมลในระบบ)' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.reset_password_token = token;
    user.reset_password_expires = new Date(Date.now() + 15 * 60 * 1000);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    try {
      await this.mailService.sendResetPassword(email, resetLink);
      return { message: 'ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว' };
    } catch (err) {
      user.reset_password_token = null;
      user.reset_password_expires = null;
      await this.userService.save(user);
      throw err;
    }
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.userService.findOneByResetToken(token);

    if (!user) {
      throw new BadRequestException('Invalid Token: Not found in database');
    }
    const now = new Date();
    if (!user.reset_password_expires || user.reset_password_expires < now) {
      throw new BadRequestException(
        `Link Expired. DB: ${user.reset_password_expires} vs Now: ${now}`,
      );
    }
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      user.reset_password_token = null;
      user.reset_password_expires = null;
      return await this.userService.save(user);
    } catch (error) {
      throw new BadRequestException(
        'Error while saving new password: ' + error.message,
      );
    }
  }

  /**
   * ตรวจสอบว่าอีเมลมีในระบบหรือยัง
   */
  async checkEmailExists(email: string): Promise<boolean> {
    const user = await this.userService.findByEmail(email);
    return !!user;
  }

  /**
   * ส่ง OTP ไปยังอีเมล
   */
  async sendOTP(email: string) {
    // ลบ OTP เก่าที่หมดอายุแล้ว
    await this.otpRepo.delete({
      email,
      expires_at: LessThan(new Date()),
    });

    // ตรวจสอบว่ามี OTP ที่ยังไม่หมดอายุหรือไม่
    const existingOTP = await this.otpRepo.findOne({
      where: { email },
      order: { created_at: 'DESC' },
    });

    if (existingOTP && existingOTP.expires_at > new Date()) {
      throw new BadRequestException(
        'กรุณารอ 5 นาทีก่อนขอ OTP ใหม่',
      );
    }

    // สุ่ม OTP 6 หลัก
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // เก็บ OTP ในฐานข้อมูล (expire 5 นาที)
    const otpEntity = this.otpRepo.create({
      email,
      otp,
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });
    await this.otpRepo.save(otpEntity);

    // ส่งอีเมล
    try {
      await this.mailService.sendOTP(email, otp);
      return { message: 'ส่ง OTP ไปยังอีเมลแล้ว' };
    } catch (err) {
      await this.otpRepo.delete({ email });
      throw err;
    }
  }

  /**
   * ตรวจสอบ OTP
   */
  async verifyOTP(email: string, otp: string): Promise<boolean> {
    const otpEntity = await this.otpRepo.findOne({
      where: { email, otp },
      order: { created_at: 'DESC' },
    });

    if (!otpEntity) {
      return false;
    }

    if (otpEntity.expires_at < new Date()) {
      await this.otpRepo.delete({ id: otpEntity.id });
      return false;
    }

    // ลบ OTP หลังใช้งาน
    await this.otpRepo.delete({ id: otpEntity.id });
    return true;
  }
}
