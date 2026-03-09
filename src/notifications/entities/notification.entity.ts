import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn()
    notification_id: number;

    @Column({ type: 'integer' })
    user_id: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ type: 'integer', default: 4 })
    notification_type_id: number;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'text' })
    message: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    link_url: string;

    @Column({ type: 'boolean', default: false })
    is_read: boolean;

    @Column({ type: 'timestamp with time zone', nullable: true })
    read_at: Date;

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;
}
