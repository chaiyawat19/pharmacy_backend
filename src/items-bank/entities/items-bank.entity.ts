import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('item_banks')
export class ItemsBank {
  @PrimaryGeneratedColumn()
  item_bank_id: number;

  @Column({ type: 'varchar', length: 255 })
  bank_name: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'int8'})
  duration: number;

  @Column({ type: 'boolean'})
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;
}
