import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export interface DailyReviewAnswer {
  option_id: number;
  is_correct: boolean;
}

/**
 * ชุดทบทวนประจำวันของผู้ใช้ — สุ่มครั้งแรกที่เปิดในวันนั้นแล้วเก็บไว้
 * ให้ชุดคงที่ทั้งวัน (ถ้าคำนวณใหม่ทุกครั้ง ข้อจะเปลี่ยนหลังตอบเพราะ mastery เปลี่ยน)
 */
@Entity('daily_reviews')
@Unique(['userId', 'reviewDate'])
export class DailyReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  /** วันที่ตามเวลาไทย (YYYY-MM-DD) */
  @Column({ name: 'review_date', type: 'date' })
  reviewDate: string;

  @Column({ name: 'item_ids', type: 'int', array: true })
  itemIds: number[];

  /** คำตอบรายข้อ key = item_id */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  answers: Record<string, DailyReviewAnswer>;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
