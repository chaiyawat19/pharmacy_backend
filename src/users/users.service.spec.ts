import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
};

function createMockRepo(): MockRepo {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
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

  beforeEach(async () => {
    repo = createMockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
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
});
