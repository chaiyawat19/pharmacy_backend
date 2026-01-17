import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('cat_sessions')
export class CATSession {
    @PrimaryGeneratedColumn()
    session_id: number;

    @Column({ type: 'integer' })
    user_id: number;

    @Column({ type: 'integer' })
    item_bank_id: number;

    @Column({ type: 'float8', default: 0.0 })
    current_theta: number;

    @Column({ type: 'float8', default: 999.0 })
    current_se: number;

    @Column({ type: 'integer', default: 0 })
    num_items: number;

    @Column({ type: 'integer', default: 0 })
    num_correct: number;

    @Column({ type: 'varchar', length: 50, default: 'IN_PROGRESS' })
    status: string; // 'IN_PROGRESS', 'COMPLETED'

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

    @Column({ type: 'varchar', length: 50, nullable: true })
    mode: string; // 'real' | 'demo-easy' | 'demo-medium' | 'demo-hard'

    @CreateDateColumn({ type: 'timestamp with time zone' })
    start_time: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;

    @Column({ type: 'timestamp with time zone', nullable: true })
    end_time: Date;
}
