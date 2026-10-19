import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * กำหนดการส่วนตัวของผู้ใช้ — เห็นเฉพาะเจ้าของ ไม่ปนกับตาราง schedules ของแอดมิน
 * (หน้าจัดการกำหนดการของแอดมินดึงทุกแถวใน schedules จึงแยกตารางกันชัดเจน)
 */
@Entity('personal_events')
export class PersonalEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** วันที่แบบไม่มีเวลา (YYYY-MM-DD) กันวันเลื่อนจากเขตเวลา */
  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
