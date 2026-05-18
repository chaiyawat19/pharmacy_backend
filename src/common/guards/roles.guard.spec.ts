import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';

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
    reflector.get
      .mockReturnValueOnce(true)  // isPublic = true
      .mockReturnValueOnce(undefined); // roles

    const ctx = createMockContext({ isPublic: true, user: undefined });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('ควร allow access ถ้าไม่มี @Roles() กำหนด (endpoint ทั่วไปที่ต้อง login แต่ไม่ต้อง role เฉพาะ)', () => {
    reflector.get
      .mockReturnValueOnce(false)    // isPublic = false
      .mockReturnValueOnce(undefined); // ไม่มี roles

    const ctx = createMockContext({ user: { role_id: 1 } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('ควร allow access ถ้า user มี role ตรง', () => {
    reflector.get
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce([2]);  // ต้องการ role_id 2

    const ctx = createMockContext({ user: { role_id: 2 } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('ควร throw ForbiddenException ถ้า user ไม่มี role ตรง', () => {
    reflector.get
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce([2]);  // ต้องการ admin (role_id: 2)

    // user ธรรมดา role_id: 1
    const ctx = createMockContext({ user: { role_id: 1 } });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ควร throw ForbiddenException ถ้าไม่มี user ใน request (ยังไม่ authenticate)', () => {
    reflector.get
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce([2]);  // ต้องการ role

    const ctx = createMockContext({ user: undefined });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ควร allow access ถ้า user role อยู่ใน allowed roles array', () => {
    reflector.get
      .mockReturnValueOnce(false)    // isPublic
      .mockReturnValueOnce([1, 2]);  // ทั้ง user และ admin เข้าได้

    const ctx = createMockContext({ user: { role_id: 1 } });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
