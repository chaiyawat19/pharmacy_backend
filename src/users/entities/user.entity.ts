import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  DeleteDateColumn,
} from 'typeorm';
import { University } from '../../universities/entities/university.entity';
import { Role } from '../../roles/entities/role.entity';
import { Exclude } from 'class-transformer';
import { Note } from '../../notes/entities/note.entity';
import { Bookmark } from '../../bookmark/entities/bookmark.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  user_id: number;

  @Column({ type: 'varchar', length: 255 })
  first_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  last_name: string | null;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  tel: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Exclude()
  password: string | null;

  @Column({ type: 'date', nullable: true })
  bod: Date | null;

  @Column({ type: 'integer', nullable: true })
  university_id: number | null;

  @ManyToOne(() => University, { nullable: true })
  @JoinColumn({ name: 'university_id' })
  university: University | null;

  @Column({ type: 'integer', default: 1 })
  role_id: number;

  /**
   * สิทธิ์ที่ Super Admin ตั้งเองด้วยมือ — ทับผลการคำนวณจาก subscription
   * NULL = ปล่อยให้ PaymentService.getEffectiveRoleId คำนวณเองตามวันหมดอายุ
   * ถ้าไม่มีคอลัมน์นี้ การถอดสิทธิ์จะไม่ติด เพราะระบบจะดึง role กลับเป็น 2
   * ให้เองตอน login ถัดไป ตราบใดที่ subscription ยังไม่หมดอายุ
   */
  @Column({ name: 'manual_role_id', type: 'integer', nullable: true })
  manual_role_id: number | null;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'local',
  })
  provider: 'local' | 'google';

  @Column({ type: 'text', nullable: true })
  profile_picture: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reset_password_token: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reset_password_expires: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  last_login_at: Date | null;

  @OneToMany(() => Note, (note) => note.user)
  notes: Note[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;

  @OneToMany(() => Bookmark, (bookmark) => bookmark.user)
  bookmarks: Bookmark[];

  /**
   * soft delete — ลบจริงไม่ได้เพราะมี 11 ตารางอ้าง FK มาที่ users
   * TypeORM จะกรองแถวที่มีค่าคอลัมน์นี้ออกจาก find/findOne ให้เองโดยอัตโนมัติ
   * ผลพลอยได้คือผู้ใช้ที่ถูกลบจะ login ไม่ได้ทันที (findByEmail มองไม่เห็น)
   */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp with time zone', nullable: true })
  deleted_at: Date | null;

  /**
   * เวลาที่ข้อมูลส่วนตัวถูกล้างถาวร (anonymize) — ชื่อ อีเมล เบอร์ รูป รหัสผ่าน ถูกลบทิ้ง
   * แถวยังอยู่เพราะมี 9 ตารางอ้าง FK มาแบบ NO ACTION และประวัติสอบ/ใบเสร็จต้องคงไว้
   * ผู้ใช้ที่ถูกล้างแล้วกู้คืนไม่ได้ เพราะบัญชีไม่เหลืออะไรให้ล็อกอิน
   */
  @Column({ name: 'anonymized_at', type: 'timestamp with time zone', nullable: true })
  anonymized_at: Date | null;
}
