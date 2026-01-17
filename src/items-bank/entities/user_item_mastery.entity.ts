import {
    Entity,
    Column,
    PrimaryColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn
} from 'typeorm';

import { Item } from './items.entity';
import { User } from '../../users/entities/user.entity';

@Entity('user_item_mastery')
export class UserItemMastery {
    @PrimaryColumn({ type: 'integer' })
    user_id: number;

    @PrimaryColumn({ type: 'integer' })
    item_id: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ManyToOne(() => Item)
    @JoinColumn({ name: 'item_id' })
    item: Item;

    @Column({ type: 'integer', default: 0 })
    total_attempts: number;

    @Column({ type: 'integer', default: 0 })
    total_correct: number;

    @Column({ type: 'integer', default: 0 })
    total_incorrect: number;

    @Column({ type: 'integer', default: 0 })
    correct_streak: number;

    @Column({ type: 'timestamp with time zone', nullable: true })
    last_answered_at: Date;

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;
}
