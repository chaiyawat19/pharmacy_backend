import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ตั้งค่าระบบชำระเงิน — มีแถวเดียวในตาราง (singleton) แก้ได้เฉพาะ Super Admin (role_id=3)
 * เก็บใน DB แทน hardcode ในโค้ด เพื่อให้ปรับราคา/เปิด-ปิดฟีเจอร์ได้จากหน้าเว็บโดยไม่ต้อง deploy ใหม่
 */
@Entity('payment_settings')
export class PaymentSettings {
  @PrimaryGeneratedColumn()
  id: number;

  // Postgres คืนค่า decimal เป็น string — แปลงกลับเป็น number ตอนอ่านเสมอ
  @Column({
    name: 'annual_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 10000,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  annualPrice: number;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
