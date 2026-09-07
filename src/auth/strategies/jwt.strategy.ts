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

    // สิทธิ์ Admin ที่ซื้อรายปีอาจหมดอายุระหว่างที่ token ยังไม่หมด (token อายุ 1 วัน)
    // ตัดสิทธิ์ลงเป็นผู้ใช้ทั่วไปทันทีจาก sub_exp ที่ฝังมาตอน login โดยไม่ต้อง query DB ทุก request
    // Super Admin (3) ไม่ได้มาจากการจ่ายเงิน จึงไม่ถูกตัด
    let roleId: number | null = payload.role_id ?? null;
    if (
      roleId === 2 &&
      typeof payload.sub_exp === 'number' &&
      payload.sub_exp <= Date.now()
    ) {
      roleId = 1;
    }

    const roleName = (roleId !== null && rolesMap[roleId]) || 'guest';

    return {
      userId: payload.sub,
      email: payload.email,
      role_id: roleId,
      role: roleName,
    };
  }
}
