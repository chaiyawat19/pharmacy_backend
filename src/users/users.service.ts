import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  async save(user: User): Promise<User> {
    return await this.userRepository.save(user);
  }
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ExamSession)
    private readonly examSessionRepository: Repository<ExamSession>,
  ) {}
  async findOneById(user_id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { user_id: user_id },
      relations: { university: true, role: true },
    });
  }
  async findOneByResetToken(token: string): Promise<User | null> {
    if (!token) return null;
    return await this.userRepository.findOne({
      where: {
        reset_password_token: token.trim(),
      },
    });
  }
  async updateLastLogin(user_id: number): Promise<void> {
    try {
      await this.userRepository.update({ user_id }, { last_login_at: new Date() });
    } catch (e) {
      console.warn('Failed to update last_login_at:', e);
    }
  }

  async findAll() {
    const users = await this.userRepository.find({
      relations: { university: true, role: true },
      order: { created_at: 'DESC' },
    });

    const examCounts = await this.examSessionRepository
      .createQueryBuilder('s')
      .select('s.user_id', 'userId')
      .addSelect('COUNT(*)', 'count')
      .where('(s.session_type = :type OR s.session_type = :lowerType OR s.session_type IS NULL)', {
        type: 'NORMAL',
        lowerType: 'normal',
      })
      .groupBy('s.user_id')
      .getRawMany();

    const examCountMap = new Map<number, number>(
      examCounts.map((r) => [Number(r.userId), Number(r.count)]),
    );

    return users.map((user) => ({
      ...user,
      exam_count: examCountMap.get(user.user_id) ?? 0,
    }));
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: { university: true, role: true },
    });
    return user;
  }

  async register(createUserDto: CreateUserDto) {
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('อีเมลนี้ถูกใช้งานในระบบแล้ว กรุณาใช้อีเมลอื่น หรือเข้าสู่ระบบ');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      role_id: 1, // Role 1 = User
    });
    return await this.userRepository.save(user);
  }

  async createAdmin(createUserDto: CreateUserDto) {
    const cleanEmail = createUserDto.email.trim().toLowerCase();
    const existingUser = await this.userRepository.findOne({
      where: { email: cleanEmail },
    });

    if (existingUser) {
      throw new ConflictException('อีเมลนี้ถูกใช้งานในระบบแล้ว กรุณาใช้อีเมลอื่น');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.userRepository.create({
      ...createUserDto,
      email: cleanEmail,
      tel: createUserDto.tel?.replace(/[-\s]/g, '') || null,
      university_id: createUserDto.university_id ? Number(createUserDto.university_id) : null,
      password: hashedPassword,
      role_id: 2, // Role 2 = Admin
    });
    return await this.userRepository.save(user);
  }
  async validatePassword(
    password: string,
    hashedPassword: string | null,
  ): Promise<boolean> {
    if (!hashedPassword) return false; // Google user
    return bcrypt.compare(password, hashedPassword);
  }
  async createSocialUser(data: {
    email: string;
    first_name?: string;
    last_name?: string;
    provider: 'google';
    profile_picture?: string | null;
  }): Promise<User> {
    const user = this.userRepository.create({
      email: data.email.trim().toLowerCase(),
      first_name: data.first_name?.trim() || data.email.split('@')[0],
      last_name: data.last_name?.trim() || '',
      provider: data.provider,
      profile_picture: data.profile_picture || null,
      role_id: 1,
      password: null,
    });

    return this.userRepository.save(user);
  }

  async updateProfile(
    user_id: number,
    updateData: UpdateUserDto,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { user_id },
      relations: { university: true, role: true },
    });

    if (!user) {
      throw new NotFoundException(`ไม่พบผู้ใช้งานด้วย ID ${user_id}`);
    }

    if (updateData.email) {
      const newEmail = updateData.email.trim().toLowerCase();
      const currentEmail = user.email.toLowerCase();

      if (newEmail !== currentEmail) {
        const existingUser = await this.userRepository.findOne({
          where: { email: newEmail },
        });
        if (existingUser && existingUser.user_id !== user_id) {
          throw new ConflictException(
            'อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น',
          );
        }
      }
      updateData.email = newEmail;
    }
    delete updateData.password;

    Object.assign(user, updateData);
    const updatedUser = await this.userRepository.save(user);
    return updatedUser;
  }
}
