import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn
} from 'typeorm';

import { Item } from '../entities/items.entity';

@Entity('answer_options')
export class AnswerOption {
    @PrimaryGeneratedColumn()
    option_id: number;

    @Column({ type: 'integer' })
    item_id: number;

    @ManyToOne(() => Item)
    @JoinColumn({ name: 'item_id' })
    item: Item;

    @Column({ type: 'text' })
    option_text: string;

    @Column({ type: 'boolean' })
    is_correct: boolean;

    @Column({ type: 'text', nullable: true })
    option_image_url?: string | null;

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;
}
