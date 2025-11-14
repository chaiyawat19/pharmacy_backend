import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private userService: UsersService,
    private jwtService: JwtService,
  ) { }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    return {
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      user_id: user.user_id,
      role_id: user.role_id,
    };
  }

  async login(user: any) {
    const payload = { sub: user.user_id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      role_id: user.role_id, 

    };
  }
}
