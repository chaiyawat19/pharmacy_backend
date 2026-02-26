import {
    Entity,
    PrimaryColumn,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Item } from './items.entity';
import { SubTopic } from '../../topics/entities/sub-topics.entity';

@Entity('item_sub_topics')
export class ItemSubTopic {
    @PrimaryColumn({ type: 'integer' })
    item_id: number;

    @ManyToOne(() => Item)
    @JoinColumn({ name: 'item_id' })
    item: Item;

    @PrimaryColumn({ type: 'integer' })
    sub_topic_id: number;

    @ManyToOne(() => SubTopic)
    @JoinColumn({ name: 'sub_topic_id' })
    sub_topic: SubTopic;

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;
}
