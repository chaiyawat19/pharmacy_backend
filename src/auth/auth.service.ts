import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
  ) { }

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



}
