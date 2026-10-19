import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ตั้งค่าแบบประเมิน — มีแถวเดียว (singleton) แอดมินเปิด/ปิดได้จากหน้าผลการประเมิน
 * ปิด = ซ่อนเมนู "แบบประเมินความพึงพอใจ" จากเมนูผู้ใช้ และไม่รับคำตอบใหม่
 */
@Entity('survey_settings')
export class SurveySettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'is_open', type: 'boolean', default: true })
  isOpen: boolean;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
