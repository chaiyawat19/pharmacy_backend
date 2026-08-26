import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not set. Application cannot start securely.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    // role_id: 1 = user ทั่วไป, 2 = admin (ซื้อสิทธิ์รายปี), 3 = super admin (ตรงกับตาราง roles ใน DB)
    const rolesMap: Record<number, string> = {
      1: 'user',
      2: 'admin',
      3: 'super_admin',
    };
    const roleName = rolesMap[payload.role_id] || 'guest';

    return {
      userId: payload.sub,
      email: payload.email,
      role_id: payload.role_id ?? null,
      role: roleName,
    };
  }
}
