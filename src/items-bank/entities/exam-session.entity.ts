import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ItemsBank } from './items-bank.entity';

@Entity('exam_sessions')
export class ExamSession {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    session_id: number;

    @Column({ name: 'user_id', type: 'int' })
    userId: number;

    // nullable: true เพราะ CAT exam อาจไม่ได้ผูกกับ item_bank ใดโดยเฉพาะ
    @Column({ name: 'item_bank_id', type: 'int', nullable: true })
    itemBankId: number | null;

    @Column({
        type: 'varchar',
        length: 20,
        default: 'NORMAL'
    })
    session_type: string;

    @CreateDateColumn({ type: 'timestamptz' })
    start_time: Date;

    @Column({ type: 'timestamptz', nullable: true })
    end_time: Date;

    @Column({ type: 'float', nullable: true })
    final_score: number;

    // เก็บคำตอบทั้งหมดเป็น JSONB array
    @Column({ type: 'jsonb', nullable: true, default: '[]' })
    responses: any[];

    // Relations
    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ManyToOne(() => ItemsBank, { nullable: true })
    @JoinColumn({ name: 'item_bank_id' })
    item_bank: ItemsBank | null;
}
