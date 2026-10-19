import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * ลำดับชั้นสิทธิ์ — role ที่สูงกว่าทำทุกอย่างที่ role ต่ำกว่าทำได้
 * Super Admin (3) จึงผ่านทุก endpoint ที่กำกับ @Roles(2) ไว้โดยไม่ต้องไล่แก้ทีละจุด
 * แต่ @Roles(3) ยังสงวนไว้ให้ Super Admin เท่านั้น — Admin ธรรมดาเข้าไม่ได้
 */
const ROLE_INHERITANCE: Record<number, number[]> = {
  3: [3, 2],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // อ่านทั้งระดับเมธอดและระดับคลาส (ค่าที่เมธอดชนะ) — เดิมอ่านแค่เมธอด
    // ทำให้ @Roles(2) ที่ติดไว้บนคลาส (items-bank, topics, categories, admin/irt) ไม่มีผลเลย
    // ผู้เรียนจึงเรียก API ของแอดมินเหล่านั้นได้
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', targets);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<number[]>('roles', targets);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const effectiveRoles = ROLE_INHERITANCE[user.role_id] ?? [user.role_id];
    const hasRole = requiredRoles.some((role) => effectiveRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException('You do not have permission');
    }

    return true;
  }
}
