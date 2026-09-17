import {
  Controller,
  Post,
  Request,
  UseGuards,
  Res,
  Get,
  NotFoundException,
  Req,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import {
  AUTH_THROTTLE_LIMIT,
  THROTTLE_TTL,
} from '../common/throttle.constants';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  /** Login — จำกัด 60 ครั้ง/นาที ป้องกัน brute force */
  @Throttle({ auth: { limit: AUTH_THROTTLE_LIMIT, ttl: THROTTLE_TTL } })
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req, @Res({ passthrough: true }) res) {
    const { accessToken, role_id } = await this.authService.login(req.user);
    return {
      message: 'Login successful',
      accessToken,
      user: { ...req.user, role_id },
    };
  }

  /** Forgot password — จำกัด 60 ครั้ง/นาที ป้องกัน spam email */
  @Throttle({ auth: { limit: AUTH_THROTTLE_LIMIT, ttl: THROTTLE_TTL } })
  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req) {
    const user = await this.usersService.findOneById(req.user.userId);
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้งาน');

    const { password, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      // ไม่ส่งรหัสผ่านออกไป แต่บอกหน้าเว็บว่าตั้งไว้หรือยัง (บัญชี Google จะยังไม่มี)
      has_password: !!password,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req, @Res({ passthrough: true }) res) {
    return {
      message: 'Logout successful',
    };
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req, @Res({ passthrough: true }) res) {
    if (!req.user) {
      throw new Error('Google authentication failed');
    }
    const accessToken = await this.authService.socialLogin(req.user);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/auth/callback?token=${accessToken}`);
  }

  /** ตรวจสอบว่าอีเมลมีในระบบหรือยัง */
  @Public()
  @Get('check-email')
  async checkEmail(@Body('email') email: string) {
    const exists = await this.authService.checkEmailExists(email);
    return { exists };
  }

  /** ส่ง OTP ไปยังอีเมล */
  @Throttle({ auth: { limit: AUTH_THROTTLE_LIMIT, ttl: THROTTLE_TTL } })
  @Public()
  @Post('send-otp')
  async sendOTP(@Body() sendOtpDto: SendOtpDto) {
    const cleanEmail = sendOtpDto.email?.trim().toLowerCase();
    const exists = await this.usersService.findByEmail(cleanEmail);
    if (exists) {
      throw new BadRequestException(
        'อีเมลนี้ถูกใช้งานในระบบแล้ว กรุณาใช้อีเมลอื่น หรือเข้าสู่ระบบ',
      );
    }
    return this.authService.sendOTP(cleanEmail);
  }

  /** ตรวจสอบ OTP */
  @Public()
  @Post('verify-otp')
  async verifyOTP(@Body() verifyOtpDto: VerifyOtpDto) {
    const isValid = await this.authService.verifyOTP(
      verifyOtpDto.email,
      verifyOtpDto.otp,
    );
    if (!isValid) {
      throw new BadRequestException('รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
    }
    return { message: 'OTP ถูกต้อง', valid: true };
  }
}
