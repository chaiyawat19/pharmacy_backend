import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserAnonymizedAt1787070000000 implements MigrationInterface {
    name = 'AddUserAnonymizedAt1787070000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // บันทึกว่าผู้ใช้รายนี้ถูกลบข้อมูลส่วนตัวถาวรไปแล้ว (anonymize)
        // แถวยังอยู่เพราะมี 9 ตารางอ้าง FK มาแบบ NO ACTION — ลบแถวจริงไม่ได้
        // และประวัติสอบกับใบเสร็จต้องคงไว้ ใช้คอลัมน์นี้กันไม่ให้กู้คืนบัญชีที่ถูกล้างแล้ว
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "anonymized_at" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "anonymized_at"`);
    }
}
