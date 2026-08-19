import {
    Entity,
    Column,
    PrimaryColumn,
    OneToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ExamSession } from '../../items-bank/entities/exam-session.entity';

@Entity('mst_sessions')
export class MSTSession {
    @PrimaryColumn({ type: 'int' })
    session_id: number;

    @Column({ name: 'user_id', type: 'int' })
    userId: number;

    @OneToOne(() => ExamSession)
    @JoinColumn({ name: 'session_id' })
    base_session: ExamSession;

    @Column({ type: 'integer', default: 1 })
    current_stage: number;

    @Column({ type: 'integer', default: 2 })
    total_stages: number;

    @Column({ type: 'integer', default: 12 })
    items_per_stage: number;

    @Column({ type: 'float8', default: 0.0 })
    current_theta: number;

    @Column({ type: 'float8', default: 999.0 })
    current_se: number;

    @Column({ type: 'float8', default: 0.0 })
    prior_theta: number;

    @Column({ type: 'integer', default: 0 })
    total_items_answered: number;

    @Column({ type: 'integer', default: 0 })
    total_correct: number;

    // ประวัติ Routing เช่น ["Stage 1: Routing (Medium)", "Stage 2: Targeted (Hard)"]
    @Column({ type: 'jsonb', nullable: true, default: '[]' })
    routing_path: string[];

    // รายการ ID ข้อสอบที่ถูกเลือกในแต่ละ Stage { "1": [1, 2, 3], "2": [4, 5, 6] }
    @Column({ type: 'jsonb', nullable: true, default: '{}' })
    stage_items: Record<string, number[]>;

    // ประวัติการตอบราย Stage { "1": [...responses], "2": [...responses] }
    @Column({ type: 'jsonb', nullable: true, default: '{}' })
    stage_responses: Record<string, any[]>;

    // รายการ item_id ทั้งหมดที่ถูกใช้ไปแล้ว
    @Column({ type: 'jsonb', nullable: true, default: '[]' })
    used_item_ids: number[];

    @Column({ type: 'float8', nullable: true })
    final_theta: number;

    @Column({ type: 'float8', nullable: true })
    final_se: number;

    @Column({ type: 'boolean', nullable: true })
    passed: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    stop_reason: string;

    @Column({ type: 'float8', default: 0.0 })
    cut_score: number;

    @CreateDateColumn({ type: 'timestamptz' })
    start_time: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updated_at: Date;

    @Column({ type: 'timestamptz', nullable: true })
    end_time: Date;
}
