import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'SECRETKEY',
    });
  }

  async validate(payload: any) {
    const rolesMap = {
      1: 'admin',
      2: 'user',
    };
    const roleName = rolesMap[payload.role_id] || 'guest';

    return {
      userId: payload.sub,
      email: payload.email,
      role_id: payload.role_id ?? null,
      role: roleName, // <--- เพิ่มตัวนี้ เพื่อส่งไปให้ RolesGuard ตรวจสอบ
    };
  }
}
