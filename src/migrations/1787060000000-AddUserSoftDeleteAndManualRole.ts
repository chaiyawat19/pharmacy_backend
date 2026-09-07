import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserSoftDeleteAndManualRole1787060000000 implements MigrationInterface {
    name = 'AddUserSoftDeleteAndManualRole1787060000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // soft delete ผู้ใช้ — ลบจริงไม่ได้เพราะมี 11 ตารางอ้าง FK มาที่ users
        // (ประวัติสอบ, ใบเสร็จ, โน้ต, บุ๊กมาร์ก ฯลฯ) ลบจริงแล้วข้อมูลพวกนี้หายตาม
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE`);

        // สิทธิ์ที่ Super Admin ตั้งเองด้วยมือ — ทับผลการคำนวณจาก subscription
        // ถ้าไม่มีคอลัมน์นี้ การถอดสิทธิ์จะไม่ติด เพราะ getEffectiveRoleId จะดึง
        // role กลับเป็น 2 ให้เองตอน login ถัดไปตราบใดที่ subscription ยังไม่หมดอายุ
        // NULL = ปล่อยให้ระบบคำนวณเองตามปกติ
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "manual_role_id" INTEGER`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "manual_role_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`);
    }
}
