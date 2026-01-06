import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService], // ต้อง export ถ้าใช้ใน module อื่น
})
export class MailModule {}
