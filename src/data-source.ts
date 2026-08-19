import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

// โหลด .env
config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'pharmacy_project',

  // ใช้ path แบบ absolute ไม่ใช้ src/ alias
  entities: [
    join(__dirname, '**', '*.entity.ts'),
    join(__dirname, '**', '*.entity.js'),
  ],

  // โฟลเดอร์เก็บ migration files
  migrations: [
    join(__dirname, 'migrations', '*.ts'),
    join(__dirname, 'migrations', '*.js'),
  ],

  // ปิด synchronize เสมอเมื่อใช้ migrations
  synchronize: false,

  logging: true,
});
