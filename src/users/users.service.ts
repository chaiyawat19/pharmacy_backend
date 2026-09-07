import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { Subscription } from '../payment/entities/subscription.entity';
import { PaymentService } from '../payment/payment.service';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';

/** role_id ที่ Super Admin ตั้งให้ผู้ใช้คนอื่นได้ — ตั้งเป็น 3 ให้ไม่ได้ */
const ASSIGNABLE_ROLE_IDS = [1, 2];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  async save(user: User): Promise<User> {
    return await this.userRepository.save(user);
  }
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ExamSession)
    private readonly examSessionRepository: Repository<ExamSession>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    private readonly paymentService: PaymentService,
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
    // withDeleted: ผู้ใช้ที่ถูกลบยังกินอีเมลใน unique index อยู่ ถ้าไม่มองหาด้วย
    // จะผ่านเช็คตรงนี้แล้วไปพังที่ DB constraint พร้อม error ที่ผู้ใช้อ่านไม่รู้เรื่อง
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
      withDeleted: true,
    });

    if (existingUser) {
      throw new ConflictException(
        existingUser.deleted_at
          ? 'อีเมลนี้เคยถูกใช้งานและถูกลบออกจากระบบแล้ว กรุณาติดต่อผู้ดูแลระบบ'
          : 'อีเมลนี้ถูกใช้งานในระบบแล้ว กรุณาใช้อีเมลอื่น หรือเข้าสู่ระบบ',
      );
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
      withDeleted: true,
    });

    if (existingUser) {
      throw new ConflictException(
        existingUser.deleted_at
          ? 'อีเมลนี้เคยถูกใช้งานและถูกลบออกจากระบบแล้ว กรุณากู้คืนบัญชีเดิมแทนการสร้างใหม่'
          : 'อีเมลนี้ถูกใช้งานในระบบแล้ว กรุณาใช้อีเมลอื่น',
      );
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

  // ── จัดการผู้ใช้ (Super Admin เท่านั้น) ────────────────────────────────────

  /** โหลดผู้ใช้พร้อมกันไม่ให้แตะ Super Admin คนอื่นหรือตัวเอง */
  private async loadManageableTarget(
    targetId: number,
    requesterId: number,
    action: string,
  ): Promise<User> {
    if (targetId === requesterId) {
      throw new BadRequestException(`ไม่สามารถ${action}บัญชีของตัวเองได้`);
    }

    const target = await this.userRepository.findOne({
      where: { user_id: targetId },
    });
    if (!target) {
      throw new NotFoundException(`ไม่พบผู้ใช้งานด้วย ID ${targetId}`);
    }
    // กัน Super Admin ถอดสิทธิ์/ลบกันเอง จนไม่เหลือใครเข้าระบบได้
    if (target.role_id === 3) {
      throw new ForbiddenException(`ไม่สามารถ${action}บัญชีผู้ดูแลระบบสูงสุดได้`);
    }
    return target;
  }

  /** ข้อมูลสรุปของผู้ใช้หนึ่งคน — โปรไฟล์ + สถิติการสอบ + สถานะสิทธิ์รายปี */
  async findOneDetail(user_id: number) {
    const user = await this.userRepository.findOne({
      where: { user_id },
      relations: { university: true, role: true },
      withDeleted: true, // ให้ดูข้อมูลผู้ใช้ที่ถูกลบไปแล้วได้ ก่อนตัดสินใจกู้คืน
    });

    if (!user) {
      throw new NotFoundException(`ไม่พบผู้ใช้งานด้วย ID ${user_id}`);
    }

    const stats = await this.examSessionRepository
      .createQueryBuilder('s')
      .select('COUNT(*)', 'total')
      .addSelect('AVG(s.final_score)', 'avgScore')
      .addSelect('MAX(s.final_score)', 'bestScore')
      .addSelect('MAX(s.end_time)', 'lastExamAt')
      .where('s.user_id = :user_id', { user_id })
      .andWhere('s.end_time IS NOT NULL')
      .getRawOne();

    const subscriptions = await this.subscriptionRepository.find({
      where: { userId: user_id, status: 'successful' },
      order: { expiresAt: 'DESC' },
    });
    const latest = subscriptions[0];
    const now = Date.now();

    const { password, reset_password_token, reset_password_expires, ...safeUser } =
      user;

    return {
      ...safeUser,
      is_deleted: !!user.deleted_at,
      exam_stats: {
        total: Number(stats?.total ?? 0),
        avg_score: stats?.avgScore ? parseFloat(Number(stats.avgScore).toFixed(1)) : null,
        best_score: stats?.bestScore ? parseFloat(Number(stats.bestScore).toFixed(1)) : null,
        last_exam_at: stats?.lastExamAt ?? null,
      },
      subscription: {
        has_active:
          !!latest?.expiresAt && new Date(latest.expiresAt).getTime() > now,
        expires_at: latest?.expiresAt ?? null,
        total_paid: subscriptions.reduce((sum, sub) => sum + Number(sub.amount), 0),
        payment_count: subscriptions.length,
      },
    };
  }

  /** รายชื่อผู้ใช้ที่ถูกลบไปแล้ว — ใช้ในหน้าถังขยะเพื่อกู้คืน */
  async findDeleted() {
    const users = await this.userRepository.find({
      relations: { university: true, role: true },
      withDeleted: true,
      order: { deleted_at: 'DESC' },
    });
    return users.filter((user) => !!user.deleted_at);
  }

  /**
   * ลบผู้ใช้แบบ soft delete — ลบจริงไม่ได้เพราะมี 11 ตารางอ้าง FK มาที่ users
   * ผู้ใช้จะ login ไม่ได้ทันที (findByEmail กรอง soft-deleted ออกให้เอง)
   * แต่ประวัติการสอบและใบเสร็จยังอยู่ครบ
   */
  async softDeleteUser(targetId: number, requesterId: number) {
    const target = await this.loadManageableTarget(targetId, requesterId, 'ลบ');

    await this.userRepository.softDelete({ user_id: targetId });
    this.logger.log(
      `Super Admin ${requesterId} ลบผู้ใช้ ${targetId} (${target.email})`,
    );

    return {
      message: `ลบผู้ใช้ ${target.email} เรียบร้อยแล้ว (กู้คืนได้)`,
      user_id: targetId,
    };
  }

  /** กู้คืนผู้ใช้ที่ถูกลบไปแล้ว */
  async restoreUser(targetId: number) {
    const target = await this.userRepository.findOne({
      where: { user_id: targetId },
      withDeleted: true,
    });

    if (!target) {
      throw new NotFoundException(`ไม่พบผู้ใช้งานด้วย ID ${targetId}`);
    }
    if (!target.deleted_at) {
      throw new BadRequestException('ผู้ใช้รายนี้ไม่ได้ถูกลบอยู่แล้ว');
    }

    await this.userRepository.restore({ user_id: targetId });
    this.logger.log(`กู้คืนผู้ใช้ ${targetId} (${target.email})`);

    return {
      message: `กู้คืนผู้ใช้ ${target.email} เรียบร้อยแล้ว`,
      user_id: targetId,
    };
  }

  /**
   * ตั้งสิทธิ์ให้ผู้ใช้ด้วยมือ — ใช้ถอดสิทธิ์ Admin หรือให้สิทธิ์โดยไม่ต้องจ่ายเงิน
   *
   * บันทึกลง manual_role_id ด้วย ไม่ใช่แค่ role_id เพราะ getEffectiveRoleId
   * จะคำนวณ role ใหม่จาก subscription ทุกครั้งที่ login — ถ้าเซ็ตแค่ role_id
   * การถอดสิทธิ์จะถูกย้อนกลับทันทีที่ผู้ใช้เข้าระบบใหม่
   *
   * roleId = null คือคืนค่าให้ระบบคำนวณเองตามวันหมดอายุตามปกติ
   */
  async setRole(targetId: number, roleId: number | null, requesterId: number) {
    const action = roleId === null ? 'คืนสิทธิ์อัตโนมัติให้' : 'เปลี่ยนสิทธิ์ของ';
    const target = await this.loadManageableTarget(targetId, requesterId, action);

    if (roleId !== null && !ASSIGNABLE_ROLE_IDS.includes(roleId)) {
      throw new BadRequestException(
        `กำหนดสิทธิ์ได้เฉพาะ ${ASSIGNABLE_ROLE_IDS.join(' หรือ ')} เท่านั้น (ตั้งเป็นผู้ดูแลระบบสูงสุดผ่านหน้าเว็บไม่ได้)`,
      );
    }

    if (roleId === null) {
      await this.userRepository.update({ user_id: targetId }, { manual_role_id: null });

      // คำนวณสิทธิ์ใหม่ทันที ไม่รอ login ครั้งถัดไป — ไม่งั้น role_id ที่ค้างอยู่
      // จะทำให้หน้าจัดการผู้ใช้แสดงสิทธิ์ที่ไม่ตรงความจริง และปุ่มถอด/ให้สิทธิ์
      // ที่ขึ้นกับ role_id จะกลายเป็นปุ่มผิดตัวจนกดถอดสิทธิ์ซ้ำไม่ได้
      const { roleId: effectiveRoleId } = await this.paymentService.getEffectiveRoleId(
        targetId,
        target.role_id,
      );

      this.logger.log(
        `Super Admin ${requesterId} คืนสิทธิ์อัตโนมัติให้ผู้ใช้ ${targetId} (${target.email}) → role ${effectiveRoleId}`,
      );
      return {
        message:
          effectiveRoleId === 2
            ? `คืนการคำนวณอัตโนมัติให้ ${target.email} แล้ว — ยังมีสิทธิ์ที่ชำระเงินไว้ จึงได้สิทธิ์ผู้ดูแลระบบกลับคืน`
            : `คืนการคำนวณอัตโนมัติให้ ${target.email} แล้ว — ไม่มีสิทธิ์ที่ชำระเงินไว้ จึงเป็นผู้ใช้งานทั่วไป`,
        user_id: targetId,
        role_id: effectiveRoleId,
        manual_role_id: null,
      };
    }

    await this.userRepository.update(
      { user_id: targetId },
      { role_id: roleId, manual_role_id: roleId },
    );
    this.logger.log(
      `Super Admin ${requesterId} ตั้งสิทธิ์ผู้ใช้ ${targetId} (${target.email}): ${target.role_id} → ${roleId}`,
    );

    return {
      message:
        roleId === 1
          ? `ถอดสิทธิ์ผู้ดูแลระบบของ ${target.email} แล้ว`
          : `ให้สิทธิ์ผู้ดูแลระบบกับ ${target.email} แล้ว`,
      user_id: targetId,
      role_id: roleId,
      manual_role_id: roleId,
    };
  }
}
