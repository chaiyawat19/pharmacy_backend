import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('universities')
export class University {
  @PrimaryGeneratedColumn()
  university_id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;
}
