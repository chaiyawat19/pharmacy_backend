import {
  Controller,
  Post,
  Request,
  UseGuards,
  Res,
  Get,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service'; // <-- เพิ่ม import UsersService
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from '../common/guard/jwt-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService, // <-- inject UsersService
  ) {}

  // --- Public login ---
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('/login')
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

  // --- Logout ---
  @UseGuards(JwtAuthGuard)
  @Post('/logout')
  async logout(@Res({ passthrough: true }) res) {
    res.clearCookie('access_token');
    return { message: 'Logout successful' };
  }

  // --- Get current user info ---
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req) {
    // ดึงจาก DB จริง
    const user = await this.usersService.findOneById(req.user.id);
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้งาน');

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }


}
