import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { Public } from '../common/decorators/public.decorator';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('/login')
  async login(@Request() req, @Res({ passthrough: true }) res) {
    const { accessToken } = await this.authService.login(req.user);
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    })
    return {
      message: 'Login successful',
      user: req.user,
      accessToken: accessToken
    };
  }
}
