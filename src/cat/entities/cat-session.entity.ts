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

@Entity('cat_sessions')
export class CATSession {
    // session_id เป็น serial4 ใน DB แต่เราตั้งค่าเองจาก exam_sessions.session_id
    @PrimaryColumn({ type: 'int' })
    session_id: number;

    @Column({ name: 'user_id', type: 'int' })
    userId: number;

    @OneToOne(() => ExamSession)
    @JoinColumn({ name: 'session_id' })
    base_session: ExamSession;

    @Column({ type: 'jsonb', nullable: true })
    topic_proportions: any; // { topic_id: weight_percentage }

    @Column({ type: 'float8', default: 0.0 })
    current_theta: number;

    @Column({ type: 'float8', default: 0.0 })
    prior_theta: number; // Bayesian prior mean — seeded from user's last session

    @Column({ type: 'float8', default: 999.0 })
    current_se: number;

    @Column({ type: 'integer', default: 0 })
    num_items: number;

    @Column({ type: 'integer', default: 0 })
    num_correct: number;

    @Column({ type: 'jsonb', nullable: true })
    used_item_ids: number[]; // เก็บ item_id ที่ใช้ไปแล้ว

    @Column({ type: 'jsonb', nullable: true })
    responses: any[]; // เก็บประวัติการตอบแต่ละข้อ

    @Column({ type: 'integer', nullable: true })
    current_item_id?: number; // ข้อที่กำลังทำอยู่

    @Column({ type: 'float8', nullable: true })
    final_theta: number;

    @Column({ type: 'float8', nullable: true })
    final_se: number;

    @Column({ type: 'boolean', nullable: true })
    passed: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    stop_reason: string;

    @Column({ type: 'integer', default: 20 })
    min_items: number;

    @Column({ type: 'integer', default: 50 })
    max_items: number;

    @Column({ type: 'float8', default: 0.35 })
    target_se: number;

    @Column({ type: 'float8', default: 0.0 })
    cut_score: number;

    @CreateDateColumn({ type: 'timestamptz' })
    start_time: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updated_at: Date;

    @Column({ type: 'timestamptz', nullable: true })
    end_time: Date;
}
