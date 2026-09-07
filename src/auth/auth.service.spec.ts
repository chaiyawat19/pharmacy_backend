import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { PaymentService } from '../payment/payment.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OTP } from './entities/otp.entity';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';

// Mock bcrypt เพื่อไม่ต้อง hash จริง (เร็วกว่า 100x)
jest.mock('bcrypt');
const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

/** สร้าง User entity จำลองสำหรับ test */
function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: 1,
    first_name: 'สมชาย',
    last_name: 'ใจดี',
    email: 'test@example.com',
    password: 'hashed_password_123',
    role_id: 1,
    tel: null,
    bod: null,
    university_id: null,
    university: null,
    role: null,
    provider: 'local',
    reset_password_token: null,
    reset_password_expires: null,
    notes: [],
    bookmarks: [],
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as User;
}

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let mailService: jest.Mocked<MailService>;
  let paymentService: jest.Mocked<PaymentService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findOneByResetToken: jest.fn(),
            save: jest.fn(),
            createSocialUser: jest.fn(),
            updateLastLogin: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(() => 'mock.jwt.token'),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendResetPassword: jest.fn(),
            sendOtpEmail: jest.fn(),
          },
        },
        {
          // AuthService เรียก getEffectiveRoleId ก่อนออก JWT ทุกครั้ง เพื่อปรับสิทธิ์
          // ตามสถานะ subscription — ค่าเริ่มต้นให้ผ่านสิทธิ์เดิมไป (ไม่มีประวัติจ่ายเงิน)
          provide: PaymentService,
          useValue: {
            getEffectiveRoleId: jest
              .fn()
              .mockImplementation((_userId: number, currentRoleId: number) =>
                Promise.resolve({ roleId: currentRoleId, expiresAt: null }),
              ),
          },
        },
        {
          provide: getRepositoryToken(OTP),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn().mockImplementation((dto) => dto),
            save: jest.fn().mockImplementation((otp) => Promise.resolve(otp)),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    mailService = module.get(MailService);
    paymentService = module.get(PaymentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // validateUser
  // ============================================================
  describe('validateUser()', () => {
    it('ควร throw UnauthorizedException ถ้าไม่พบ user', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.validateUser('x@x.com', 'pass'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('ควร throw UnauthorizedException ถ้า user ไม่มี password (Google user)', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser({ password: null }));

      await expect(service.validateUser('x@x.com', 'pass'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('ควร throw UnauthorizedException ถ้า password ผิด', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      (bcryptMock.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateUser('test@example.com', 'wrong_pass'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('ควร return user data ถ้า credentials ถูกต้อง', async () => {
      const mockUser = makeUser();
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcryptMock.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'correct_pass');

      expect(result).toEqual({
        id: mockUser.user_id,
        email: mockUser.email,
        first_name: mockUser.first_name,
        last_name: mockUser.last_name,
        role_id: mockUser.role_id,
      });
    });

    it('ควร call findByEmail ด้วย email ที่รับมา', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await service.validateUser('test@example.com', 'pass').catch(() => {});

      expect(usersService.findByEmail).toHaveBeenCalledWith('test@example.com');
    });
  });

  // ============================================================
  // login
  // ============================================================
  describe('login()', () => {
    it('ควร return accessToken และ role_id', async () => {
      const user = { id: 1, email: 'x@x.com', role_id: 1, first_name: 'A', last_name: 'B' };
      const result = await service.login(user);

      expect(result).toHaveProperty('accessToken', 'mock.jwt.token');
      expect(result).toHaveProperty('role_id', 1);
    });

    it('ควร call jwtService.sign ด้วย payload ที่ถูกต้อง', async () => {
      const user = { id: 42, email: 'admin@x.com', role_id: 2, first_name: 'Admin', last_name: 'User' };
      await service.login(user);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 42,
          email: 'admin@x.com',
          role_id: 2,
        }),
      );
    });

    it('ควร ฝังวันหมดอายุสิทธิ์ (sub_exp) ลง JWT เพื่อให้ตัดสิทธิ์ได้ก่อน token หมดอายุ', async () => {
      const expiresAt = new Date('2027-01-01T00:00:00Z');
      paymentService.getEffectiveRoleId.mockResolvedValueOnce({
        roleId: 2,
        expiresAt,
      });
      const user = { id: 7, email: 'paid@x.com', role_id: 1, first_name: 'A', last_name: 'B' };

      const result = await service.login(user);

      expect(result.role_id).toBe(2);
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role_id: 2, sub_exp: expiresAt.getTime() }),
      );
    });

    it('ควร ใส่ sub_exp เป็น null ถ้าไม่มีสิทธิ์รายปีที่ยังไม่หมดอายุ', async () => {
      const user = { id: 8, email: 'free@x.com', role_id: 1, first_name: 'A', last_name: 'B' };
      await service.login(user);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub_exp: null }),
      );
    });
  });

  // ============================================================
  // socialLogin
  // ============================================================
  describe('socialLogin()', () => {
    it('ควร return token สำหรับ user ที่มีอยู่แล้ว', async () => {
      const mockUser = makeUser({ provider: 'google' });
      usersService.findByEmail.mockResolvedValue(mockUser);

      const token = await service.socialLogin({
        email: 'google@gmail.com',
        first_name: 'Google',
        last_name: 'User',
        provider: 'google',
      });

      expect(token).toBe('mock.jwt.token');
      expect(usersService.createSocialUser).not.toHaveBeenCalled();
    });

    it('ควร สร้าง user ใหม่และ return token ถ้าเป็น Google user ใหม่', async () => {
      const newUser = makeUser({ provider: 'google', user_id: 99 });
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createSocialUser.mockResolvedValue(newUser);

      const token = await service.socialLogin({
        email: 'newgoogle@gmail.com',
        first_name: 'New',
        last_name: 'Google',
        provider: 'google',
      });

      expect(usersService.createSocialUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'newgoogle@gmail.com', provider: 'google' }),
      );
      expect(token).toBe('mock.jwt.token');
    });
  });

  // ============================================================
  // forgotPassword
  // ============================================================
  describe('forgotPassword()', () => {
    it('ควร return success message เงียบๆ ถ้าไม่พบ email (ไม่ leak ว่า email มีในระบบหรือไม่)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('noone@x.com');

      expect(result.message).toBeDefined();
      expect(mailService.sendResetPassword).not.toHaveBeenCalled();
    });

    it('ควร ส่ง email และ save token ถ้าพบ user', async () => {
      const mockUser = makeUser();
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.save.mockResolvedValue(mockUser);
      mailService.sendResetPassword.mockResolvedValue(undefined);

      const result = await service.forgotPassword('test@example.com');

      expect(usersService.save).toHaveBeenCalled();
      expect(mailService.sendResetPassword).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('reset-password'),
      );
      expect(result.message).toBeDefined();
    });

    it('ควร clear token ถ้า sendMail ล้มเหลว', async () => {
      const mockUser = makeUser();
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.save.mockResolvedValue(mockUser);
      mailService.sendResetPassword.mockRejectedValue(new Error('SMTP error'));

      await expect(service.forgotPassword('test@example.com')).rejects.toThrow('SMTP error');

      // ควร save สองครั้ง: ครั้งแรก set token, ครั้งที่สอง clear token
      expect(usersService.save).toHaveBeenCalledTimes(2);
      expect(mockUser.reset_password_token).toBeNull();
    });
  });

  // ============================================================
  // resetPassword
  // ============================================================
  describe('resetPassword()', () => {
    it('ควร throw BadRequestException ถ้า token ไม่พบ', async () => {
      usersService.findOneByResetToken.mockResolvedValue(null);

      await expect(service.resetPassword('invalid-token', 'newpass'))
        .rejects.toThrow(BadRequestException);
    });

    it('ควร throw BadRequestException ถ้า token หมดอายุ', async () => {
      const expiredUser = makeUser({
        reset_password_token: 'expired-token',
        reset_password_expires: new Date(Date.now() - 1000), // expired 1 วินาทีที่แล้ว
      });
      usersService.findOneByResetToken.mockResolvedValue(expiredUser);

      await expect(service.resetPassword('expired-token', 'newpass'))
        .rejects.toThrow(BadRequestException);
    });

    it('ควร hash password ใหม่และ clear token เมื่อ reset สำเร็จ', async () => {
      const validUser = makeUser({
        reset_password_token: 'valid-token',
        reset_password_expires: new Date(Date.now() + 60000), // ยังไม่หมดอายุ
      });
      usersService.findOneByResetToken.mockResolvedValue(validUser);
      (bcryptMock.hash as jest.Mock).mockResolvedValue('new_hashed_password');
      usersService.save.mockResolvedValue({ ...validUser, password: 'new_hashed_password' } as User);

      await service.resetPassword('valid-token', 'myNewPass123');

      expect(bcryptMock.hash).toHaveBeenCalledWith('myNewPass123', 10);
      expect(validUser.reset_password_token).toBeNull();
      expect(validUser.reset_password_expires).toBeNull();
      expect(usersService.save).toHaveBeenCalled();
    });
  });
});
