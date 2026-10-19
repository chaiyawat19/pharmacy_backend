import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';

/** สร้าง mock ExecutionContext */
function createMockContext(overrides: {
  isPublic?: boolean;
  roles?: number[];
  user?: any;
}): ExecutionContext {
  const { isPublic = false, roles = undefined, user = undefined } = overrides;

  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      get: jest.fn(),
      getAllAndOverride: jest.fn(),
      getAll: jest.fn(),
      getAllAndMerge: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new RolesGuard(reflector);
  });

  afterEach(() => jest.clearAllMocks());

  it('ควร allow access ถ้า endpoint เป็น @Public()', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(true)  // isPublic = true
      .mockReturnValueOnce(undefined); // roles

    const ctx = createMockContext({ isPublic: true, user: undefined });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('ควร allow access ถ้าไม่มี @Roles() กำหนด (endpoint ทั่วไปที่ต้อง login แต่ไม่ต้อง role เฉพาะ)', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)    // isPublic = false
      .mockReturnValueOnce(undefined); // ไม่มี roles

    const ctx = createMockContext({ user: { role_id: 1 } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('ควร allow access ถ้า user มี role ตรง', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce([2]);  // ต้องการ role_id 2

    const ctx = createMockContext({ user: { role_id: 2 } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('ควร throw ForbiddenException ถ้า user ไม่มี role ตรง', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce([2]);  // ต้องการ admin (role_id: 2)

    // user ธรรมดา role_id: 1
    const ctx = createMockContext({ user: { role_id: 1 } });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ควร throw ForbiddenException ถ้าไม่มี user ใน request (ยังไม่ authenticate)', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce([2]);  // ต้องการ role

    const ctx = createMockContext({ user: undefined });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ควร allow access ถ้า user role อยู่ใน allowed roles array', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)    // isPublic
      .mockReturnValueOnce([1, 2]);  // ทั้ง user และ admin เข้าได้

    const ctx = createMockContext({ user: { role_id: 1 } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  // ── ลำดับชั้นสิทธิ์: Super Admin (3) สืบทอดสิทธิ์ของ Admin (2) ──

  it('ควร allow Super Admin (3) เข้า endpoint ที่กำกับ @Roles(2)', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce([2]);  // ต้องการ admin

    const ctx = createMockContext({ user: { role_id: 3 } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('ควร allow Super Admin (3) เข้า endpoint ที่กำกับ @Roles(3)', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([3]);

    const ctx = createMockContext({ user: { role_id: 3 } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('ควร block Admin ธรรมดา (2) ไม่ให้เข้า endpoint ที่กำกับ @Roles(3)', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([3]); // เฉพาะ Super Admin

    const ctx = createMockContext({ user: { role_id: 2 } });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ควร block user ธรรมดา (1) ไม่ให้เข้า endpoint ที่กำกับ @Roles(3)', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([3]);

    const ctx = createMockContext({ user: { role_id: 1 } });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  describe('อ่าน @Roles ระดับคลาสด้วย Reflector จริง', () => {
    @Roles(2)
    class AdminOnlyController {
      list() {}
      @Roles(1, 2)
      forStudents() {}
      @Public()
      open() {}
    }

    const realGuard = new RolesGuard(new Reflector());
    const ctxFor = (handler: () => void, roleId: number) =>
      ({
        getHandler: () => handler,
        getClass: () => AdminOnlyController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role_id: roleId } }) }),
      }) as unknown as ExecutionContext;
    const proto = AdminOnlyController.prototype;

    it('ผู้เรียนเรียกเมธอดที่ไม่มี @Roles ของตัวเองในคลาส @Roles(2) ไม่ได้', () => {
      expect(() => realGuard.canActivate(ctxFor(proto.list, 1))).toThrow(ForbiddenException);
    });

    it('แอดมินและ Super Admin เรียกได้', () => {
      expect(realGuard.canActivate(ctxFor(proto.list, 2))).toBe(true);
      expect(realGuard.canActivate(ctxFor(proto.list, 3))).toBe(true);
    });

    it('@Roles ที่เมธอดทับค่าของคลาส (เปิดให้ผู้เรียน)', () => {
      expect(realGuard.canActivate(ctxFor(proto.forStudents, 1))).toBe(true);
    });

    it('@Public ที่เมธอดยังผ่านได้', () => {
      expect(realGuard.canActivate(ctxFor(proto.open, 1))).toBe(true);
    });
  });
});
