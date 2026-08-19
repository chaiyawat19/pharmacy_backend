import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn
} from 'typeorm';

import { ItemSituation } from './item_situations.entity';
import { AnswerOption } from './answer_options.entity';
import { ItemSubTopic } from './item_sub_topics.entity';

@Entity('items')
export class Item {
    @PrimaryGeneratedColumn()
    item_id: number;

    @Column({ type: 'text' })
    question_text: string;

    @Column({ type: 'float4', nullable: true, default: 1.0 })
    irt_a_discrimination?: number | null;

    @Column({ type: 'float4', nullable: true, default: 0.0 })
    irt_b_difficulty?: number | null;

    @Column({ type: 'float4', nullable: true, default: 0.20 })
    irt_c_guessing?: number | null;

    @Column({ type: 'text' })
    explanation: string;

    @Column({ type: 'integer', nullable: true })
    situation_id?: number | null;

    @ManyToOne(() => ItemSituation, { nullable: true })
    @JoinColumn({ name: 'situation_id' })
    situation?: ItemSituation | null;

    @OneToMany(() => AnswerOption, (option) => option.item)
    answer_options: AnswerOption[];

    @OneToMany(() => ItemSubTopic, (ist) => ist.item)
    item_sub_topics: ItemSubTopic[];

    @Column({ type: 'varchar', length: 50, default: 'draft' })
    status: string;

    @Column({ type: 'text', nullable: true })
    question_image_url?: string | null;


    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;

    @DeleteDateColumn({ type: 'timestamp with time zone', nullable: true })
    deleted_at: Date | null;
}
