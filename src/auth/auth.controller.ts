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
import { JwtAuthGuard } from '../common/guard/jwt-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  // ---------- LOCAL LOGIN ----------
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req, @Res({ passthrough: true }) res) {
    const { accessToken } = await this.authService.login(req.user);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });

    return {
      message: 'Login successful',
      accessToken,
      user: req.user,
    };
  }

  // ---------- FORGOT / RESET PASSWORD ----------
  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(
    @Body() body: { token: string; newPassword: string },
  ) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  // ---------- LOGOUT ----------
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Res({ passthrough: true }) res) {
    res.clearCookie('access_token');
    return { message: 'Logout successful' };
  }

  // ---------- GET CURRENT USER ----------
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req) {
    const user = await this.usersService.findOneById(req.user.id);
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้งาน');

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // ---------- GOOGLE LOGIN ----------
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // passport จะ redirect ไป Google อัตโนมัติ
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req,
    @Res({ passthrough: true }) res,
  ) {
    console.log('GOOGLE CALLBACK USER:', req.user);

    if (!req.user) {
      throw new Error('Google authentication failed');
    }

    const accessToken = await this.authService.socialLogin(req.user);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });

    return res.redirect('http://localhost:3000/user');
  }
}
