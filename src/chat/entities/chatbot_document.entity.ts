import { User } from '../../users/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('chatbot_documents')
export class ChatbotDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true })
  file_name: string;

  @Column({ type: 'varchar', nullable: true })
  file_size: string;

  @Column({ type: 'varchar', nullable: true })
  file_url: string;

  @Column({ type: 'varchar', nullable: true })
  file_path: string;

  @Column({ type: 'bigint', nullable: true })
  uploaded_by: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by' })
  user: User;

  @CreateDateColumn({ type: 'timestamp without time zone', nullable: true })
  uploaded_at: Date;

  @DeleteDateColumn({ type: 'timestamp without time zone', nullable: true })
  deleted_at: Date | null;
}
