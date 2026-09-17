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
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly paymentService: PaymentService,
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
  async login(user: any) {
    if (user.id) {
      await this.userService.updateLastLogin(user.id);
    }

    const { roleId: effectiveRoleId, expiresAt } = user.id
      ? await this.paymentService.getEffectiveRoleId(user.id, user.role_id)
      : { roleId: user.role_id, expiresAt: null };

    const payload = {
      sub: user.id,
      email: user.email,
      role_id: effectiveRoleId,
      // วันหมดอายุสิทธิ์ (epoch ms) — JwtStrategy ใช้ตัดสิทธิ์ทันทีที่เลยกำหนด
      // แม้ token จะยังไม่หมดอายุ ไม่ต้องรอผู้ใช้ล็อกอินใหม่
      sub_exp: expiresAt ? expiresAt.getTime() : null,
      first_name: user.first_name,
      last_name: user.last_name,
      university: user.university?.name,
    };

    const accessToken = this.jwtService.sign(payload);
    return { accessToken, role_id: effectiveRoleId };
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
      user.last_login_at = new Date();
      await this.userService.save(user);
    } else {
      user.last_login_at = new Date();
      // อัปเดตเฉพาะกรณีที่ยังใช้รูปจาก Google อยู่ (URL ภายนอก) — ถ้าผู้ใช้อัปโหลดรูปเอง
      // หรือลบรูปทิ้งไปแล้ว ต้องไม่เอารูป Google กลับมาทับทุกครั้งที่ล็อกอิน
      const usingExternalPicture = user.profile_picture?.startsWith('http') ?? false;
      if (
        usingExternalPicture &&
        profile.profile_picture &&
        user.profile_picture !== profile.profile_picture
      ) {
        user.profile_picture = profile.profile_picture;
      }
      await this.userService.save(user);
    }

    const { roleId: effectiveRoleId, expiresAt } =
      await this.paymentService.getEffectiveRoleId(user.user_id, user.role_id);

    return this.jwtService.sign({
      sub: user.user_id,
      email: user.email,
      role_id: effectiveRoleId,
      sub_exp: expiresAt ? expiresAt.getTime() : null,
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
    await this.userService.save(user);

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
    const cleanToken = token?.trim();
    const user = await this.userService.findOneByResetToken(cleanToken);

    if (!user) {
      throw new BadRequestException('ลิงก์นี้ไม่ถูกต้องหรือถูกแทนที่ด้วยลิงก์ใหม่แล้ว กรุณากดขอลิงก์ใหม่อีกครั้ง');
    }
    const now = new Date();
    if (!user.reset_password_expires || new Date(user.reset_password_expires) < now) {
      throw new BadRequestException('ลิงก์นี้หมดอายุแล้ว (มีอายุ 15 นาที) กรุณากดขอลิงก์ใหม่อีกครั้ง');
    }
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      user.reset_password_token = null;
      user.reset_password_expires = null;
      await this.userService.save(user);
      return { message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
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

    // ตรวจสอบว่ามี OTP ที่ยังไม่หมดอายุหรือไม่ (cooldown 1 นาที)
    const existingOTP = await this.otpRepo.findOne({
      where: { email },
      order: { created_at: 'DESC' },
    });

    if (existingOTP && existingOTP.expires_at > new Date()) {
      const remainingSeconds = Math.ceil((existingOTP.expires_at.getTime() - Date.now()) / 1000);
      // ถ้าเพิ่งขอไปไม่ถึง 1 นาที
      if (remainingSeconds > 4 * 60) {
        throw new BadRequestException(
          'กรุณารอ 1 นาทีก่อนขอรหัส OTP ใหม่อีกครั้ง',
        );
      }
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
      return { message: 'ส่งรหัส OTP ไปยังอีเมลของคุณเรียบร้อยแล้ว' };
    } catch (err) {
      await this.otpRepo.delete({ email });
      throw err;
    }
  }

  /**
   * ตรวจสอบ OTP แบบละเอียด
   */
  async verifyOTP(email: string, otp: string): Promise<boolean> {
    const cleanOtp = otp?.trim();
    const cleanEmail = email?.trim().toLowerCase();

    // ค้นหา OTP ล่าสุดของ email นี้
    const latestOtp = await this.otpRepo.findOne({
      where: { email: cleanEmail },
      order: { created_at: 'DESC' },
    });

    if (!latestOtp) {
      throw new BadRequestException('ไม่พบข้อมูลรหัส OTP กรุณากดขอรหัส OTP ใหม่อีกครั้ง');
    }

    if (latestOtp.expires_at < new Date()) {
      await this.otpRepo.delete({ id: latestOtp.id });
      throw new BadRequestException('รหัส OTP หมดอายุแล้ว (อายุใช้งาน 5 นาที) กรุณากดขอรหัสใหม่อีกครั้ง');
    }

    if (latestOtp.otp !== cleanOtp) {
      throw new BadRequestException('รหัส OTP ไม่ถูกต้อง กรุณาตรวจสอบรหัส 6 หลักในอีเมลอีกครั้ง');
    }

    // ลบ OTP หลังใช้งาน
    await this.otpRepo.delete({ id: latestOtp.id });
    return true;
  }
}
