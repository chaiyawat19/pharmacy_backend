import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Baseline Migration
 * 
 * ไฟล์นี้เป็น "จุดเริ่มต้น" ของ migration system
 * ตารางทั้งหมดถูกสร้างไว้ใน PostgreSQL แล้ว migration นี้แค่บันทึกว่า
 * "ณ จุดนี้ schema ถูก apply ไปแล้ว" — ไม่มีการเปลี่ยนแปลง DB จริง
 * 
 * จากนี้ไป เมื่อมีการแก้ Entity ให้รัน:
 *   npm run migration:generate -- src/migrations/ชื่อ-การเปลี่ยนแปลง
 *   npm run migration:run
 */
export class Baseline1000000000000 implements MigrationInterface {
    name = 'Baseline1000000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Intentionally empty — DB tables already exist
        // This migration only marks the baseline in the migrations table
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Intentionally empty — nothing to revert
    }
}
