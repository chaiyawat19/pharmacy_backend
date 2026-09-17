import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { Subscription } from '../payment/entities/subscription.entity';
import { PaymentService } from '../payment/payment.service';
import { DataSource } from 'typeorm';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';

jest.mock('bcrypt');
const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

/** Mock สำหรับ Repository — ระบุเฉพาะ method ที่ใช้ใน test */
type MockRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  restore: jest.Mock;
};

function createMockRepo(): MockRepo {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    restore: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

/** สร้าง User entity จำลอง */
function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: 1,
    first_name: 'สมชาย',
    last_name: 'ใจดี',
    email: 'test@example.com',
    password: 'hashed_password',
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

describe('UsersService', () => {
  let service: UsersService;
  let repo: MockRepo;
  let paymentService: jest.Mocked<PaymentService>;
  /** EntityManager จำลองใน transaction — hardDeleteUser ยิง SQL ดิบผ่านตัวนี้ */
  let manager: { query: jest.Mock };

  beforeEach(async () => {
    repo = createMockRepo();
    manager = { query: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: getRepositoryToken(ExamSession), useValue: createMockRepo() },
        { provide: getRepositoryToken(Subscription), useValue: createMockRepo() },
        {
          // ใช้ตอนล้าง manual override เพื่อคำนวณสิทธิ์ใหม่ทันที
          provide: PaymentService,
          useValue: {
            getEffectiveRoleId: jest
              .fn()
              .mockResolvedValue({ roleId: 1, expiresAt: null }),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    paymentService = module.get(PaymentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // register
  // ============================================================
  describe('register()', () => {
    const dto: CreateUserDto = {
      first_name: 'สมชาย',
      last_name: 'ใจดี',
      email: 'new@example.com',
      password: 'securePass123',
      confirm_password: 'securePass123',
      tel: '0812345678',
      bod: new Date('2000-01-01'),
      university_id: 1,
    };

    it('ควร throw ConflictException ถ้า email ซ้ำ', async () => {
      repo.findOne!.mockResolvedValue(makeUser());

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('ควร hash password และ save user ใหม่', async () => {
      repo.findOne!.mockResolvedValue(null); // ไม่มี email ซ้ำ
      (bcryptMock.hash as jest.Mock).mockResolvedValue('hashed_secure_pass');
      const newUser = makeUser({ email: dto.email, role_id: 1 });
      repo.create!.mockReturnValue(newUser);
      repo.save!.mockResolvedValue(newUser);

      await service.register(dto);

      expect(bcryptMock.hash).toHaveBeenCalledWith('securePass123', 10);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          password: 'hashed_secure_pass',
          role_id: 1, // force role_id = 1 เสมอ
        }),
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it('ควร set role_id = 1 เสมอ ไม่ว่า client จะส่งอะไรมา', async () => {
      repo.findOne!.mockResolvedValue(null);
      (bcryptMock.hash as jest.Mock).mockResolvedValue('hashed');
      repo.create!.mockImplementation((data) => data as User);
      repo.save!.mockResolvedValue(makeUser());

      await service.register(dto);

      const createArg = (repo.create as jest.Mock).mock.calls[0][0];
      expect(createArg.role_id).toBe(1);
    });
  });

  // ============================================================
  // findByEmail
  // ============================================================
  describe('findByEmail()', () => {
    it('ควร return user ถ้าพบ email', async () => {
      const mockUser = makeUser();
      repo.findOne!.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');
      expect(result).toEqual(mockUser);
    });

    it('ควร return null ถ้าไม่พบ email', async () => {
      repo.findOne!.mockResolvedValue(null);

      const result = await service.findByEmail('notfound@x.com');
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // findOneById
  // ============================================================
  describe('findOneById()', () => {
    it('ควร return user พร้อม relations', async () => {
      const mockUser = makeUser();
      repo.findOne!.mockResolvedValue(mockUser);

      const result = await service.findOneById(1);
      expect(result).toEqual(mockUser);
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 1 },
          relations: expect.objectContaining({ university: true, role: true }),
        }),
      );
    });
  });

  // ============================================================
  // updateProfile
  // ============================================================
  describe('updateProfile()', () => {
    it('ควร throw NotFoundException ถ้าไม่พบ user', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.updateProfile(999, { first_name: 'New' }))
        .rejects.toThrow(NotFoundException);
    });

    it('ควร throw ConflictException ถ้า email ใหม่ซ้ำกับ user อื่น', async () => {
      const currentUser = makeUser({ user_id: 1, email: 'old@example.com' });
      const anotherUser = makeUser({ user_id: 2, email: 'taken@example.com' });

      repo.findOne!
        .mockResolvedValueOnce(currentUser)  // หา current user
        .mockResolvedValueOnce(anotherUser); // หา email ซ้ำ

      await expect(service.updateProfile(1, { email: 'taken@example.com' }))
        .rejects.toThrow(ConflictException);
    });

    it('ควร อัปเดต profile สำเร็จ', async () => {
      const currentUser = makeUser();
      const updatedUser = makeUser({ first_name: 'ใหม่' });
      repo.findOne!.mockResolvedValue(currentUser);
      repo.save!.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(1, { first_name: 'ใหม่' });

      expect(repo.save).toHaveBeenCalled();
      expect(result.first_name).toBe('ใหม่');
    });

    it('ควร ไม่ให้ update password ผ่าน endpoint นี้', async () => {
      const currentUser = makeUser();
      repo.findOne!.mockResolvedValue(currentUser);
      repo.save!.mockResolvedValue(currentUser);

      const updateData = { first_name: 'New', password: 'hackerpass' } as any;
      await service.updateProfile(1, updateData);

      const savedUser = (repo.save as jest.Mock).mock.calls[0][0];
      expect(savedUser.password).not.toBe('hackerpass');
    });
  });

  // ============================================================
  // validatePassword
  // ============================================================
  describe('validatePassword()', () => {
    it('ควร return false ถ้าไม่มี hashed password (Google user)', async () => {
      const result = await service.validatePassword('pass', null);
      expect(result).toBe(false);
    });

    it('ควร call bcrypt.compare', async () => {
      (bcryptMock.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validatePassword('pass', 'hashed');
      expect(bcryptMock.compare).toHaveBeenCalledWith('pass', 'hashed');
      expect(result).toBe(true);
    });
  });

  // ============================================================
  // createSocialUser
  // ============================================================
  describe('createSocialUser()', () => {
    it('ควร สร้าง user ใหม่ด้วย role_id = 1 และ password = null', async () => {
      const newUser = makeUser({ provider: 'google', password: null });
      repo.create!.mockReturnValue(newUser);
      repo.save!.mockResolvedValue(newUser);

      await service.createSocialUser({
        email: 'google@gmail.com',
        first_name: 'Google',
        last_name: 'User',
        provider: 'google',
      });

      const createArg = (repo.create as jest.Mock).mock.calls[0][0];
      expect(createArg.password).toBeNull();
      expect(createArg.role_id).toBe(1);
      expect(createArg.provider).toBe('google');
    });
  });

  // ============================================================
  // จัดการผู้ใช้ (Super Admin) — ตรรกะความปลอดภัย
  // ============================================================
  describe('softDeleteUser()', () => {
    it('ควร ไม่ให้ลบบัญชีตัวเอง', async () => {
      await expect(service.softDeleteUser(3, 3)).rejects.toThrow(BadRequestException);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it('ควร ไม่ให้ลบบัญชี Super Admin คนอื่น', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 9, role_id: 3 }));

      await expect(service.softDeleteUser(9, 3)).rejects.toThrow(ForbiddenException);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it('ควร throw NotFoundException ถ้าไม่พบผู้ใช้', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.softDeleteUser(99, 3)).rejects.toThrow(NotFoundException);
    });

    it('ควร เรียก softDelete (ไม่ใช่ delete จริง) เมื่อผ่านเงื่อนไขครบ', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, role_id: 2 }));

      await service.softDeleteUser(5, 3);

      expect(repo.softDelete).toHaveBeenCalledWith({ user_id: 5 });
    });
  });

  describe('setRole()', () => {
    it('ควร บันทึก manual_role_id คู่กับ role_id เสมอ ไม่งั้นการถอดสิทธิ์จะถูกย้อนตอน login', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, role_id: 2 }));

      await service.setRole(5, 1, 3);

      expect(repo.update).toHaveBeenCalledWith(
        { user_id: 5 },
        { role_id: 1, manual_role_id: 1 },
      );
    });

    it('ควร ล้าง manual_role_id เมื่อส่ง null (คืนการคำนวณอัตโนมัติ)', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, role_id: 2 }));

      await service.setRole(5, null, 3);

      expect(repo.update).toHaveBeenCalledWith({ user_id: 5 }, { manual_role_id: null });
    });

    it('ควร คำนวณสิทธิ์ใหม่ทันทีหลังล้าง override ไม่รอ login ครั้งถัดไป', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, role_id: 1 }));
      paymentService.getEffectiveRoleId.mockResolvedValueOnce({
        roleId: 2,
        expiresAt: new Date('2027-01-01'),
      });

      const result = await service.setRole(5, null, 3);

      expect(paymentService.getEffectiveRoleId).toHaveBeenCalledWith(5, 1);
      // คืน role ที่คำนวณใหม่ ไม่ใช่ค่าเดิมที่ค้างอยู่ใน DB
      expect(result.role_id).toBe(2);
    });

    it('ควร ไม่ให้ตั้งสิทธิ์เป็น Super Admin (3)', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, role_id: 2 }));

      await expect(service.setRole(5, 3, 3)).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('ควร ไม่ให้เปลี่ยนสิทธิ์ตัวเอง', async () => {
      await expect(service.setRole(3, 1, 3)).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('restoreUser()', () => {
    it('ควร throw BadRequestException ถ้าผู้ใช้ไม่ได้ถูกลบอยู่', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, deleted_at: null }));

      await expect(service.restoreUser(5)).rejects.toThrow(BadRequestException);
      expect(repo.restore).not.toHaveBeenCalled();
    });

    it('ควร กู้คืนได้ถ้าผู้ใช้ถูกลบอยู่', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, deleted_at: new Date() }));

      await service.restoreUser(5);

      expect(repo.restore).toHaveBeenCalledWith({ user_id: 5 });
    });
  });

  describe('anonymizeUser()', () => {
    it('ควร ไม่ให้ล้างข้อมูลถ้ายังไม่ได้ลบผู้ใช้ก่อน', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, deleted_at: null }));

      await expect(service.anonymizeUser(5, 3)).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('ควร ไม่ให้ล้างข้อมูลบัญชีตัวเอง', async () => {
      await expect(service.anonymizeUser(3, 3)).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('ควร ไม่ให้ล้างข้อมูลบัญชี Super Admin', async () => {
      repo.findOne!.mockResolvedValue(
        makeUser({ user_id: 9, role_id: 3, deleted_at: new Date() }),
      );

      await expect(service.anonymizeUser(9, 3)).rejects.toThrow(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('ควร ไม่ให้ล้างซ้ำถ้าล้างไปแล้ว', async () => {
      repo.findOne!.mockResolvedValue(
        makeUser({ user_id: 5, deleted_at: new Date(), anonymized_at: new Date() }),
      );

      await expect(service.anonymizeUser(5, 3)).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('ควร ล้างข้อมูลระบุตัวตนทิ้ง แต่คง user_id และ university_id ไว้ให้สถิติใช้งานต่อได้', async () => {
      repo.findOne!.mockResolvedValue(
        makeUser({ user_id: 5, university_id: 7, deleted_at: new Date() }),
      );

      await service.anonymizeUser(5, 3);

      const [where, patch] = (repo.update as jest.Mock).mock.calls[0];
      expect(where).toEqual({ user_id: 5 });
      expect(patch.email).toBe('deleted-user-5@anonymized.invalid');
      expect(patch.password).toBeNull();
      expect(patch.tel).toBeNull();
      expect(patch.bod).toBeNull();
      expect(patch.profile_picture).toBeNull();
      expect(patch.anonymized_at).toBeInstanceOf(Date);
      // ไม่แตะ university_id — leaderboard ระดับมหาวิทยาลัยต้องใช้คำนวณต่อ
      expect(patch).not.toHaveProperty('university_id');
    });
  });

  describe('restoreUser() หลังล้างข้อมูล', () => {
    it('ควร กู้คืนบัญชีที่ถูกล้างข้อมูลไปแล้วไม่ได้', async () => {
      repo.findOne!.mockResolvedValue(
        makeUser({ user_id: 5, deleted_at: new Date(), anonymized_at: new Date() }),
      );

      await expect(service.restoreUser(5)).rejects.toThrow(BadRequestException);
      expect(repo.restore).not.toHaveBeenCalled();
    });
  });

  describe('hardDeleteUser()', () => {
    const CONFIRM = 'test@example.com';

    it('ควร ไม่ให้ลบถาวรถ้ายังไม่ได้ลบลงถังขยะก่อน', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, deleted_at: null }));

      await expect(service.hardDeleteUser(5, 3, CONFIRM)).rejects.toThrow(
        BadRequestException,
      );
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('ควร ไม่ให้ลบบัญชีตัวเองถาวร', async () => {
      await expect(service.hardDeleteUser(3, 3, CONFIRM)).rejects.toThrow(
        BadRequestException,
      );
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('ควร ไม่ให้ลบบัญชี Super Admin ถาวร', async () => {
      repo.findOne!.mockResolvedValue(
        makeUser({ user_id: 9, role_id: 3, deleted_at: new Date() }),
      );

      await expect(service.hardDeleteUser(9, 3, CONFIRM)).rejects.toThrow(
        ForbiddenException,
      );
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('ควร ไม่ลบถ้าอีเมลยืนยันไม่ตรง — กันกดผิดคนเพราะย้อนกลับไม่ได้', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, deleted_at: new Date() }));

      await expect(
        service.hardDeleteUser(5, 3, 'someone-else@example.com'),
      ).rejects.toThrow(BadRequestException);
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('ควร ลบแถวลูกทุกตารางก่อนแล้วค่อยลบ users เป็นลำดับสุดท้าย', async () => {
      repo.findOne!.mockResolvedValue(makeUser({ user_id: 5, deleted_at: new Date() }));

      const result = await service.hardDeleteUser(5, 3, ` ${CONFIRM.toUpperCase()} `);

      const statements = (manager.query as jest.Mock).mock.calls.map(
        ([sql]: [string]) => sql.replace(/\s+/g, ' ').trim(),
      );
      const deletes = statements.filter((sql) => sql.startsWith('DELETE'));

      // ลบแถว users ต้องเป็นคำสั่งลบท้ายสุด ไม่งั้น FK แบบ NO ACTION จะปฏิเสธ
      expect(deletes[deletes.length - 1]).toContain('DELETE FROM users');
      for (const table of [
        'chat_messages',
        'chat_sessions',
        'chat_quotas',
        'item_answers',
        'cat_sessions',
        'exam_sessions',
        'user_item_mastery',
        'note_files',
        'note_tags',
        'notes',
        'notifications',
        'schedules',
        'user_bookmarks',
        'subscriptions',
        'otp_codes',
      ]) {
        expect(deletes.some((sql) => sql.includes(`DELETE FROM ${table} `))).toBe(true);
      }
      // เอกสารแชทบอทเป็นข้อมูลกลาง — ตัดคนอัปโหลดออก ไม่ลบทิ้ง
      expect(
        statements.some((sql) =>
          sql.startsWith('UPDATE chatbot_documents SET uploaded_by = NULL'),
        ),
      ).toBe(true);
      expect(deletes.some((sql) => sql.includes('chatbot_documents'))).toBe(false);
      expect(result.user_id).toBe(5);
    });
  });
});
