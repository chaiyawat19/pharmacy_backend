import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private userService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      return null; 
    }

    if (user && (await bcrypt.compare(pass, user.password))) {
      const result = user;
      return {
        email: result.email,
        first_name: result.first_name,
        last_name: result.last_name,
        user_id: result.user_id,
      };
    }
    return null;
  }

  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.user_id,
      role_id: user.role_id,
    };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
