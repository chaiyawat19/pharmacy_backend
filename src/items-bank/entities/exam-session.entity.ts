import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ItemsBank } from './items-bank.entity';

@Entity('exam_sessions')
export class ExamSession {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    session_id: number;

    @Column({ name: 'user_id', type: 'int' })
    userId: number;

    @Column({ name: 'item_bank_id', type: 'int' })
    itemBankId: number;

    @Column({ type: 'varchar', length: 50, default: 'IN_PROGRESS' })
    status: string;

    @CreateDateColumn({ type: 'timestamptz' })
    start_time: Date;

    @Column({ type: 'timestamptz', nullable: true })
    end_time: Date;

    @Column({ type: 'float', nullable: true })
    final_score: number;

    @Column({ type: 'float', nullable: true })
    final_ability_estimate: number;

    // Relations
    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ManyToOne(() => ItemsBank)
    @JoinColumn({ name: 'item_bank_id' })
    item_bank: ItemsBank;

    @OneToMany('ExamResponse', 'session')
    responses: any[];
}
