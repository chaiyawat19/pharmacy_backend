import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from '../../items-bank/entities/items.entity';

export const ITEM_REPORT_REASONS = [
  'wrong_answer', // เฉลยผิด
  'unclear', // โจทย์หรือตัวเลือกกำกวม
  'typo', // พิมพ์ผิด
  'missing_image', // รูปไม่แสดง หรือไม่มีรูปที่โจทย์อ้างถึง
  'other',
] as const;
export type ItemReportReason = (typeof ITEM_REPORT_REASONS)[number];

export const ITEM_REPORT_STATUSES = ['open', 'resolved', 'rejected'] as const;
export type ItemReportStatus = (typeof ITEM_REPORT_STATUSES)[number];

/** รายงานจากผู้เรียนว่าข้อสอบมีปัญหา (เช่นแย้งว่าเฉลยผิด) ให้แอดมินตรวจ */
@Entity('item_reports')
@Index(['itemId', 'status'])
export class ItemReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'item_id', type: 'int' })
  itemId: number;

  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 30 })
  reason: ItemReportReason;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: ItemReportStatus;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ name: 'resolved_by', type: 'int', nullable: true })
  resolvedBy: number | null;

  @Column({ name: 'resolved_at', type: 'timestamp with time zone', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
