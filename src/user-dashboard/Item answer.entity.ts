import {
    Column,
    CreateDateColumn,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
} from 'typeorm'
import { ExamSession } from '../items-bank/entities/exam-session.entity'
import { Item } from '../items-bank/entities/items.entity' // ปรับ path ตาม entity จริง

/**
 * เก็บผลการตอบแต่ละข้อในแต่ละ session
 * ใช้สำหรับคำนวณ radar chart และ weak topics
 */
@Entity('item_answers')
export class ItemAnswer {
  @PrimaryGeneratedColumn()
  id: number;

    @ManyToOne(() => ExamSession, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'session_id' })
    session: ExamSession

    @Column({ name: 'session_id' })
    session_id: number

    @ManyToOne(() => Item, { eager: false })
    @JoinColumn({ name: 'item_id' })
    item: Item

    @Column({ name: 'item_id' })
    item_id: number

    /** คำตอบที่ผู้ใช้เลือก */
    @Column({ nullable: true })
    selected_choice: string

    /** ตอบถูกหรือไม่ */
    @Column({ default: false })
    is_correct: boolean

    @CreateDateColumn()
    answered_at: Date
}
