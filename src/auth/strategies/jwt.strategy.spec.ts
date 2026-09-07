import { JwtStrategy } from './jwt.strategy';

/**
 * ครอบส่วนตัดสิทธิ์จาก sub_exp — สิทธิ์ Admin รายปีอาจหมดอายุระหว่างที่ token
 * (อายุ 1 วัน) ยังไม่หมด ถ้าไม่ตัดตรงนี้ ผู้ใช้จะใช้สิทธิ์ต่อได้อีกไม่เกิน 24 ชม.
 */
describe('JwtStrategy.validate()', () => {
  let strategy: JwtStrategy;
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
    strategy = new JwtStrategy();
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  const HOUR = 60 * 60 * 1000;

  it('ควร คงสิทธิ์ admin ไว้ถ้า subscription ยังไม่หมดอายุ', async () => {
    const result = await strategy.validate({
      sub: 1,
      email: 'a@x.com',
      role_id: 2,
      sub_exp: Date.now() + HOUR,
    });

    expect(result.role_id).toBe(2);
    expect(result.role).toBe('admin');
  });

  it('ควร ตัดสิทธิ์ admin ลงเป็น user ทันทีที่ subscription หมดอายุ', async () => {
    const result = await strategy.validate({
      sub: 1,
      email: 'a@x.com',
      role_id: 2,
      sub_exp: Date.now() - HOUR,
    });

    expect(result.role_id).toBe(1);
    expect(result.role).toBe('user');
  });

  it('ควร ไม่ตัดสิทธิ์ Super Admin แม้ sub_exp จะเลยกำหนด (สิทธิ์ไม่ได้มาจากการจ่ายเงิน)', async () => {
    const result = await strategy.validate({
      sub: 1,
      email: 'a@x.com',
      role_id: 3,
      sub_exp: Date.now() - HOUR,
    });

    expect(result.role_id).toBe(3);
    expect(result.role).toBe('super_admin');
  });

  it('ควร ปล่อยผ่านถ้าไม่มี sub_exp (token เก่าที่ออกก่อนมีฟีเจอร์นี้)', async () => {
    const result = await strategy.validate({ sub: 1, email: 'a@x.com', role_id: 2 });

    expect(result.role_id).toBe(2);
    expect(result.role).toBe('admin');
  });

  it('ควร คืน role เป็น guest ถ้า role_id ไม่รู้จัก', async () => {
    const result = await strategy.validate({ sub: 1, email: 'a@x.com', role_id: 99 });

    expect(result.role).toBe('guest');
  });
});
