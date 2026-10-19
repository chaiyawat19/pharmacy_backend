import { Entity, PrimaryColumn } from 'typeorm';

/**
 * ผู้ใช้ที่ส่งแบบประเมินแล้ว — ใช้กันตอบซ้ำเท่านั้น
 * ไม่มีเวลาและไม่มีรหัสคำตอบ เพื่อไม่ให้จับคู่กับแถวใน survey_responses ได้
 */
@Entity('survey_participants')
export class SurveyParticipant {
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;
}
