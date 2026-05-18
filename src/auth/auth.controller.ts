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
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  /** Login — จำกัด 10 ครั้ง/นาที ป้องกัน brute force */
  @Throttle({ auth: {} })
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req, @Res({ passthrough: true }) res) {
    const { accessToken } = await this.authService.login(req.user);
    return {
      message: 'Login successful',
      accessToken,
      user: req.user,
    };
  }

  /** Forgot password — จำกัด 10 ครั้ง/นาที ป้องกัน spam email */
  @Throttle({ auth: {} })
  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req) {
    const user = await this.usersService.findOneById(req.user.userId);
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้งาน');

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req, @Res({ passthrough: true }) res) {
    // Clear any server-side session data if needed
    // For JWT-based auth, the token invalidation happens on client-side
    // But we can log the logout event or clear any refresh tokens here

    return {
      message: 'Logout successful'
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
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/user`);
  }
}
