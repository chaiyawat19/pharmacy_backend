import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService, // inject UsersService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => request?.cookies?.access_token,
      ]),
      secretOrKey: configService.get('JWT_SECRET')!,
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    // ดึงข้อมูลผู้ใช้จากฐานข้อมูลตาม user id
    const user = await this.usersService.findOneById(payload.sub);

    // คืนค่า user เต็มชุด (first_name, last_name, email, role_id ...)
    return user;
  }
}
