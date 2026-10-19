import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * คำตอบแบบประเมิน — ไม่มีคอลัมน์ผู้ใช้โดยตั้งใจ
 * เอกสารชี้แจงอาสาสมัครระบุว่าไม่เก็บข้อมูลที่ระบุตัวตนได้ คำตอบจึงเชื่อมกลับไปหาผู้ตอบไม่ได้
 * การกันตอบซ้ำใช้ตาราง survey_participants แยกต่างหาก (ดู SurveyParticipant)
 */
@Entity('survey_responses')
export class SurveyResponse {
  @PrimaryGeneratedColumn()
  id: number;

  /** เวอร์ชันชุดคำถาม (SURVEY_VERSION) ตอนที่ตอบ */
  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'jsonb' })
  answers: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
