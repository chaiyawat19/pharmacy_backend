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
import { DataSource, EntityManager, MoreThan, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { Subscription } from '../payment/entities/subscription.entity';
import { PaymentService } from '../payment/payment.service';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
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
    private readonly dataSource: DataSource,
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

    // รูปเดิมที่อัปโหลดไว้ในเครื่องจะไม่ถูกใช้แล้วเมื่อเปลี่ยนรูปใหม่ ลบทิ้งกันไฟล์ค้าง
    const previousPicture = user.profile_picture;

    Object.assign(user, updateData);
    const updatedUser = await this.userRepository.save(user);

    if (
      updateData.profile_picture !== undefined &&
      previousPicture &&
      previousPicture !== updatedUser.profile_picture
    ) {
      await this.unlinkUpload(previousPicture);
    }
    return updatedUser;
  }

  /** ลบรูปโปรไฟล์ — ไฟล์ที่อัปโหลดไว้จะถูกลบ ส่วนรูปจาก Google เป็น URL ภายนอกจึงแค่ล้างค่า */
  async removeProfilePicture(user_id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { user_id },
      relations: { university: true, role: true },
    });
    if (!user) {
      throw new NotFoundException(`ไม่พบผู้ใช้งานด้วย ID ${user_id}`);
    }

    const previousPicture = user.profile_picture;
    user.profile_picture = null;
    const updatedUser = await this.userRepository.save(user);
    await this.unlinkUpload(previousPicture);
    return updatedUser;
  }

  /**
   * ตั้งรหัสผ่านครั้งแรก — ใช้กับบัญชี Google ที่ยังไม่มีรหัสผ่าน
   * บัญชีที่มีรหัสผ่านแล้วต้องเปลี่ยนผ่านขั้นตอนลืมรหัสผ่าน ไม่ให้ทับตรงนี้ได้
   */
  async setInitialPassword(user_id: number, password: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { user_id } });
    if (!user) {
      throw new NotFoundException(`ไม่พบผู้ใช้งานด้วย ID ${user_id}`);
    }
    if (user.password) {
      throw new BadRequestException(
        'บัญชีนี้ตั้งรหัสผ่านไว้แล้ว หากต้องการเปลี่ยนรหัสผ่านกรุณาใช้เมนูลืมรหัสผ่าน',
      );
    }

    user.password = await bcrypt.hash(password, 10);
    await this.userRepository.save(user);
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
    if (target.anonymized_at) {
      throw new BadRequestException(
        'บัญชีนี้ถูกล้างข้อมูลส่วนตัวถาวรไปแล้ว กู้คืนไม่ได้ (ไม่เหลือข้อมูลให้เข้าสู่ระบบ)',
      );
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

  /**
   * ล้างข้อมูลส่วนตัวถาวร — ลบชื่อ อีเมล เบอร์ วันเกิด รหัสผ่าน และรูปโปรไฟล์ทิ้ง
   * แต่คงแถวและ user_id ไว้ ทำให้ประวัติสอบ คะแนนที่ใช้คำนวณ leaderboard
   * และใบเสร็จยังอยู่ครบ
   *
   * ลบทั้งแถวไม่ได้ เพราะมี 9 ตารางอ้าง FK มาที่ users แบบ ON DELETE NO ACTION
   * (exam_sessions, subscriptions, notes, notifications, schedules ฯลฯ)
   * Postgres จะปฏิเสธคำสั่งลบทันที ไม่ใช่ลบแล้วข้อมูลหายเงียบ ๆ
   *
   * ต้อง soft delete ก่อน — กันเผลอกดจากหน้ารายชื่อผู้ใช้ปกติ เพราะย้อนกลับไม่ได้
   */
  async anonymizeUser(targetId: number, requesterId: number) {
    if (targetId === requesterId) {
      throw new BadRequestException('ไม่สามารถล้างข้อมูลบัญชีของตัวเองได้');
    }

    const target = await this.userRepository.findOne({
      where: { user_id: targetId },
      withDeleted: true,
    });

    if (!target) {
      throw new NotFoundException(`ไม่พบผู้ใช้งานด้วย ID ${targetId}`);
    }
    if (target.role_id === 3) {
      throw new ForbiddenException('ไม่สามารถล้างข้อมูลบัญชีผู้ดูแลระบบสูงสุดได้');
    }
    if (!target.deleted_at) {
      throw new BadRequestException(
        'ต้องลบผู้ใช้รายนี้ก่อน จึงจะล้างข้อมูลส่วนตัวถาวรได้',
      );
    }
    if (target.anonymized_at) {
      throw new BadRequestException('บัญชีนี้ถูกล้างข้อมูลส่วนตัวไปแล้ว');
    }

    const originalEmail = target.email;

    // ลบไฟล์รูปโปรไฟล์ออกจากดิสก์ด้วย ไม่งั้นรูปยังค้างอยู่แม้ลบ path ในฐานข้อมูลแล้ว
    if (target.profile_picture?.startsWith('/uploads/')) {
      const filePath = `.${target.profile_picture}`;
      try {
        await fs.promises.unlink(filePath);
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          this.logger.warn(
            `ลบไฟล์รูปโปรไฟล์ ${filePath} ไม่สำเร็จ: ${(err as Error).message}`,
          );
        }
      }
    }

    await this.userRepository.update(
      { user_id: targetId },
      {
        // first_name กับ email เป็น NOT NULL ใน DB จึงใส่ค่าแทนแทนการเซ็ต null
        // อีเมลต้องไม่ซ้ำกับใคร และต้องไม่ใช่โดเมนจริง กัน mail service ส่งออกไปโดยไม่ตั้งใจ
        first_name: 'ผู้ใช้ที่ถูกลบ',
        last_name: null,
        email: `deleted-user-${targetId}@anonymized.invalid`,
        tel: null,
        bod: null,
        password: null,
        profile_picture: null,
        reset_password_token: null,
        reset_password_expires: null,
        // คง university_id ไว้ ไม่ใช่ข้อมูลระบุตัวตน และ leaderboard ระดับมหาวิทยาลัย
        // ต้องใช้คำนวณ ถ้าล้างทิ้งค่าเฉลี่ยของมหาลัยนั้นจะเปลี่ยนย้อนหลัง
        role_id: 1,
        manual_role_id: null,
        anonymized_at: new Date(),
      },
    );

    this.logger.log(
      `Super Admin ${requesterId} ล้างข้อมูลส่วนตัวของผู้ใช้ ${targetId} (${originalEmail}) ถาวร`,
    );

    return {
      message: `ล้างข้อมูลส่วนตัวของ ${originalEmail} ถาวรแล้ว — ประวัติการสอบและใบเสร็จยังอยู่ครบ`,
      user_id: targetId,
    };
  }

  // ── ลบถาวร (hard delete) ──────────────────────────────────────────────────

  /**
   * ลบไฟล์ใน uploads/ แบบไม่โยน error — ข้อมูลใน DB ลบไปแล้ว ถ้าไฟล์ค้างอยู่
   * ก็ไม่ควรทำให้ทั้งคำสั่งล้มเหลว แค่บันทึก log ไว้ให้ตามลบทีหลัง
   */
  private async unlinkUpload(rawPath: string | null | undefined): Promise<void> {
    if (!rawPath) return;

    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const resolved = path.resolve(process.cwd(), rawPath.replace(/^[\\/]+/, ''));

    // path พวกนี้มาจากฐานข้อมูล — ถ้าหลุดออกนอก uploads/ (เป็น URL ภายนอก
    // หรือมี ../ ปนมา) ห้ามแตะ ไม่งั้นคำสั่งลบผู้ใช้จะกลายเป็นช่องลบไฟล์ระบบ
    if (!resolved.startsWith(uploadsRoot + path.sep)) return;

    try {
      await fs.promises.unlink(resolved);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        this.logger.warn(`ลบไฟล์ ${resolved} ไม่สำเร็จ: ${(err as Error).message}`);
      }
    }
  }

  /** DELETE ที่คืนจำนวนแถวที่ลบไป — query() คืนมาแค่แถว จึงต้องพ่วง RETURNING */
  private async deleteRows(
    manager: EntityManager,
    sql: string,
    params: unknown[],
  ): Promise<number> {
    const rows: unknown[] = await manager.query(`${sql} RETURNING 1`, params);
    return rows.length;
  }

  /**
   * ลบผู้ใช้ถาวรพร้อมข้อมูลทั้งหมด — ไล่ลบลูกทุกตารางก่อน แล้วค่อยลบแถว users
   *
   * ต่างจาก anonymizeUser ตรงที่ไม่เหลืออะไรเลย: ประวัติการสอบ คะแนน ใบเสร็จ
   * โน้ต ไฟล์แนบ และรูปโปรไฟล์หายหมด ค่าเฉลี่ยรวมและ leaderboard จะเปลี่ยน
   * ย้อนหลัง — ถ้าต้องคงหลักฐานการเงินหรือสถิติไว้ ให้ใช้ anonymizeUser แทน
   *
   * มี 10 ตารางอ้าง FK มาที่ users และเกือบทั้งหมดเป็น ON DELETE NO ACTION
   * ลบแถว users ตรง ๆ Postgres จะปฏิเสธทันที จึงต้องไล่ลบจากลูกขึ้นมาหาพ่อ
   * ทั้งชุดอยู่ใน transaction เดียว ถ้าพังกลางทางจะ rollback ไม่เหลือผู้ใช้
   * ที่ข้อมูลหายไปครึ่งเดียว
   *
   * ไฟล์บนดิสก์ลบหลัง commit เท่านั้น เพราะลบไฟล์แล้วย้อนคืนไม่ได้
   * ต่อให้ transaction rollback ทีหลัง
   */
  async hardDeleteUser(targetId: number, requesterId: number, confirmEmail: string) {
    if (targetId === requesterId) {
      throw new BadRequestException('ไม่สามารถลบบัญชีของตัวเองถาวรได้');
    }

    const target = await this.userRepository.findOne({
      where: { user_id: targetId },
      withDeleted: true,
    });

    if (!target) {
      throw new NotFoundException(`ไม่พบผู้ใช้งานด้วย ID ${targetId}`);
    }
    if (target.role_id === 3) {
      throw new ForbiddenException('ไม่สามารถลบบัญชีผู้ดูแลระบบสูงสุดถาวรได้');
    }
    // บังคับให้ลบลงถังขยะก่อน — กันกดพลาดจากหน้ารายชื่อผู้ใช้ปกติ
    // และเปิดช่องให้ทบทวนอีกรอบก่อนลบจริง เพราะกู้คืนไม่ได้
    if (!target.deleted_at) {
      throw new BadRequestException('ต้องลบผู้ใช้รายนี้ลงถังขยะก่อน จึงจะลบถาวรได้');
    }
    if (confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
      throw new BadRequestException(
        'อีเมลยืนยันไม่ตรงกับผู้ใช้รายนี้ กรุณาตรวจสอบอีกครั้ง',
      );
    }

    const originalEmail = target.email;

    const { deleted, files } = await this.dataSource.transaction(async (manager) => {
      // เก็บ path ไฟล์ไว้ก่อนลบแถว — พอลบแล้วไม่มีทางรู้ว่าต้องตามลบไฟล์ไหน
      const noteFiles: { storage_path: string }[] = await manager.query(
        `SELECT nf.storage_path FROM note_files nf
           JOIN notes n ON n.note_id = nf.note_id
          WHERE n.user_id = $1`,
        [targetId],
      );
      const slips: { slip_image_url: string | null }[] = await manager.query(
        `SELECT slip_image_url FROM subscriptions
          WHERE user_id = $1 AND slip_image_url IS NOT NULL`,
        [targetId],
      );

      const pendingFiles: string[] = [];
      if (target.profile_picture) pendingFiles.push(target.profile_picture);
      for (const file of noteFiles) {
        pendingFiles.push(path.join('uploads', file.storage_path));
      }
      // slip_image_url เก็บได้ทั้ง path ไฟล์, URL ภายนอก และค่าอย่าง 'payload-provided'
      // ตัวที่ไม่ได้ชี้เข้า uploads/ จะถูก unlinkUpload กรองทิ้งเองอีกชั้น
      for (const slip of slips) {
        if (slip.slip_image_url) pendingFiles.push(slip.slip_image_url);
      }

      const counts: Record<string, number> = {};

      // แชท — ข้อความอ้าง session จึงต้องลบก่อน session
      counts.chat_messages = await this.deleteRows(
        manager,
        `DELETE FROM chat_messages
          WHERE chat_session_id IN (SELECT chat_session_id FROM chat_sessions WHERE user_id = $1)`,
        [targetId],
      );
      counts.chat_sessions = await this.deleteRows(
        manager,
        `DELETE FROM chat_sessions WHERE user_id = $1`,
        [targetId],
      );
      counts.chat_quotas = await this.deleteRows(
        manager,
        `DELETE FROM chat_quotas WHERE user_id = $1`,
        [targetId],
      );

      // การสอบ — คำตอบรายข้อและ CAT session อ้าง exam_sessions
      counts.item_answers = await this.deleteRows(
        manager,
        `DELETE FROM item_answers
          WHERE session_id IN (SELECT session_id FROM exam_sessions WHERE user_id = $1)`,
        [targetId],
      );
      // cat_sessions มีทั้ง user_id ของตัวเองและ FK ไป exam_sessions — เช็คสองทาง
      // เพราะ user_id ไม่มี FK บังคับ แถวกำพร้าจึงหลุดรอดได้ถ้าเช็คทางเดียว
      counts.cat_sessions = await this.deleteRows(
        manager,
        `DELETE FROM cat_sessions
          WHERE user_id = $1
             OR session_id IN (SELECT session_id FROM exam_sessions WHERE user_id = $1)`,
        [targetId],
      );
      counts.exam_sessions = await this.deleteRows(
        manager,
        `DELETE FROM exam_sessions WHERE user_id = $1`,
        [targetId],
      );
      counts.user_item_mastery = await this.deleteRows(
        manager,
        `DELETE FROM user_item_mastery WHERE user_id = $1`,
        [targetId],
      );

      // โน้ตและไฟล์แนบ
      counts.note_files = await this.deleteRows(
        manager,
        `DELETE FROM note_files
          WHERE note_id IN (SELECT note_id FROM notes WHERE user_id = $1)`,
        [targetId],
      );
      counts.note_tags = await this.deleteRows(
        manager,
        `DELETE FROM note_tags
          WHERE note_id IN (SELECT note_id FROM notes WHERE user_id = $1)`,
        [targetId],
      );
      counts.notes = await this.deleteRows(
        manager,
        `DELETE FROM notes WHERE user_id = $1`,
        [targetId],
      );

      counts.notifications = await this.deleteRows(
        manager,
        `DELETE FROM notifications WHERE user_id = $1`,
        [targetId],
      );
      counts.schedules = await this.deleteRows(
        manager,
        `DELETE FROM schedules WHERE user_id = $1`,
        [targetId],
      );
      counts.user_bookmarks = await this.deleteRows(
        manager,
        `DELETE FROM user_bookmarks WHERE user_id = $1`,
        [targetId],
      );
      counts.subscriptions = await this.deleteRows(
        manager,
        `DELETE FROM subscriptions WHERE user_id = $1`,
        [targetId],
      );

      // otp_codes ผูกกับอีเมล ไม่ใช่ user_id จึงไม่มี FK คอยเตือน
      // ถ้าไม่ลบ รหัส OTP ของอีเมลนี้จะค้างอยู่และถูกใช้สมัครใหม่ได้ทันที
      counts.otp_codes = await this.deleteRows(
        manager,
        `DELETE FROM otp_codes WHERE LOWER(email) = LOWER($1)`,
        [originalEmail],
      );

      // เอกสารแชทบอทเป็นข้อมูลกลางที่ผู้ใช้ทุกคนใช้ร่วมกัน — ตัดแค่ความเชื่อมโยง
      // กับคนอัปโหลด ไม่ลบตัวเอกสาร ไม่งั้นลบแอดมินคนเดียวคลังความรู้หายทั้งระบบ
      const unlinkedDocs: unknown[] = await manager.query(
        `UPDATE chatbot_documents SET uploaded_by = NULL WHERE uploaded_by = $1 RETURNING 1`,
        [targetId],
      );
      counts.chatbot_documents_unlinked = unlinkedDocs.length;

      counts.users = await this.deleteRows(
        manager,
        `DELETE FROM users WHERE user_id = $1`,
        [targetId],
      );

      return { deleted: counts, files: pendingFiles };
    });

    for (const file of files) {
      await this.unlinkUpload(file);
    }

    this.logger.warn(
      `Super Admin ${requesterId} ลบผู้ใช้ ${targetId} (${originalEmail}) ถาวร — ` +
        Object.entries(deleted)
          .filter(([, count]) => count > 0)
          .map(([table, count]) => `${table}=${count}`)
          .join(' '),
    );

    return {
      message: `ลบ ${originalEmail} และข้อมูลทั้งหมดออกจากระบบถาวรแล้ว`,
      user_id: targetId,
      deleted,
      removed_files: files.length,
    };
  }
}
