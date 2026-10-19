import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** กำหนดการของแอดมินที่ผู้ใช้มาร์คไว้ว่าสนใจ — เก็บเป็นรายผู้ใช้ ไม่แก้ตาราง schedules */
@Entity('schedule_marks')
export class ScheduleMark {
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @PrimaryColumn({ name: 'schedule_id', type: 'int' })
  scheduleId: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
