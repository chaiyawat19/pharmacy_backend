import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type SubscriptionStatus = 'pending' | 'successful' | 'failed';
export type PaymentMethod = 'promptpay' | 'truewallet';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Postgres คืนค่าคอลัมน์ decimal เป็น string เสมอ (กันความแม่นยำทศนิยมหาย) — ใส่ transformer
  // แปลงกลับเป็น number อัตโนมัติทุกครั้งที่อ่านจาก DB ไม่งั้น .amount จะเป็น string ตอน query ใหม่
  // (ต่างจากตอน .create() ที่ยังเป็น number เดิมอยู่ในหน่วยความจำ — เป็นบ่อเกิดบั๊กที่ตรวจจับยาก)
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: SubscriptionStatus;

  @Column({ type: 'varchar', length: 20, default: 'promptpay' })
  method: PaymentMethod;

  @Column({ name: 'qr_generated_at', type: 'timestamp' })
  qrGeneratedAt: Date;

  @Column({ name: 'slip_image_url', type: 'varchar', nullable: true })
  slipImageUrl: string | null;

  @Column({ name: 'thunder_transaction_ref', type: 'varchar', nullable: true })
  thunderTransactionRef: string | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'reminder_sent_at', type: 'timestamp', nullable: true })
  reminderSentAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
