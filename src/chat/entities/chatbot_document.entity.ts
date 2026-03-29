import { User } from "src/users/entities/user.entity";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('chatbot_documents')
export class ChatbotDocument {
  // จำเป็นต้องมี Primary Key สำหรับ TypeORM 
  // แนะนำให้เพิ่ม column 'id' เป็น serial/bigserial ในตารางด้วยครับ
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true })
  file_name: string;

  @Column({ type: 'varchar', nullable: true })
  file_size: string;

  @Column({ type: 'bigint', nullable: true })
  uploaded_by: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by' })
  user: User;

  @CreateDateColumn({ type: 'timestamp without time zone', nullable: true })
  uploaded_at: Date;
}
