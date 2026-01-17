import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
} from 'typeorm';
import { ExamSession } from './exam-session.entity';
import { Item } from './items.entity';

@Entity('exam_responses')
export class ExamResponse {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    response_id: number;

    @Column({ type: 'bigint' })
    session_id: number;

    @Column({ type: 'int' })
    item_id: number;

    @Column({ type: 'int', nullable: true })
    selected_option_id: number | null; // option_id ที่ผู้ใช้เลือก

    @Column({ type: 'boolean', default: false })
    is_correct: boolean;

    @Column({ type: 'int' })
    order_presented: number; // ลำดับที่แสดงคำถาม

    @Column({ type: 'int', nullable: true })
    response_time_ms: number; // เวลาที่ใช้ตอบ (milliseconds)

    @Column({ type: 'float', nullable: true })
    irt_a_param: number; // IRT discrimination parameter

    @Column({ type: 'float', nullable: true })
    irt_b_param: number; // IRT difficulty parameter

    @Column({ type: 'float', nullable: true })
    irt_c_param: number; // IRT guessing parameter

    @Column({ type: 'float', nullable: true })
    irt_ability_estimate_after: number; // Ability estimate หลังตอบข้อนี้

    @Column({ type: 'float', nullable: true })
    irt_se_after: number; // Standard error หลังตอบข้อนี้

    @CreateDateColumn({ type: 'timestamptz' })
    submitted_at: Date;

    // Relations
    @ManyToOne(() => ExamSession, (session) => session.responses)
    @JoinColumn({ name: 'session_id' })
    session: ExamSession;

    @ManyToOne(() => Item)
    @JoinColumn({ name: 'item_id' })
    item: Item;
}
