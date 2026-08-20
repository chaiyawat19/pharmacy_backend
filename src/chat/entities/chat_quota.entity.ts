import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('chat_quotas')
@Index(['user_id', 'usage_date'], { unique: true })
export class Chat_quota {
    @PrimaryGeneratedColumn()
    quota_id: number;

    @Column({ type: 'int' })
    user_id: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ type: 'date' })
    usage_date: string; // YYYY-MM-DD

    @Column({ type: 'int', default: 0 })
    used_points: number; // 0 - 100

    @Column({ type: 'int', default: 0 })
    message_count: number;

    @CreateDateColumn({ type: 'timestamp' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updated_at: Date;
}
