import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Request,
  Response,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  PAYMENT_THROTTLE_LIMIT,
  THROTTLE_TTL,
} from '../common/throttle.constants';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PaymentService, SlipInput } from './payment.service';
import { VerifySlipDto } from './dto/verify-slip.dto';
import { GenerateQrDto } from './dto/generate-qr.dto';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Throttle({ payment: { limit: PAYMENT_THROTTLE_LIMIT, ttl: THROTTLE_TTL } })
  @Post('generate-qr')
  async generateQr(@Request() req, @Body() dto: GenerateQrDto) {
    return this.paymentService.generateQr(req.user.userId, dto.method);
  }

  @Throttle({ payment: { limit: PAYMENT_THROTTLE_LIMIT, ttl: THROTTLE_TTL } })
  @Post('verify-slip')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/payment-slips',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `slip-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new BadRequestException('รองรับเฉพาะไฟล์รูปภาพเท่านั้น'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 4 * 1024 * 1024, // 4MB ตามข้อกำหนดของ Thunder
      },
    }),
  )
  async verifySlip(
    @Request() req,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: VerifySlipDto,
  ) {
    const providedMethods = [
      file ? 'image' : null,
      dto.payload ? 'payload' : null,
      dto.base64 ? 'base64' : null,
      dto.url ? 'url' : null,
    ].filter(Boolean);

    if (providedMethods.length === 0) {
      throw new BadRequestException(
        'กรุณาระบุวิธียืนยันสลิปอย่างใดอย่างหนึ่ง: แนบรูปภาพ, payload, base64 หรือ URL',
      );
    }
    if (providedMethods.length > 1) {
      throw new BadRequestException('กรุณาระบุวิธียืนยันสลิปแค่วิธีเดียว');
    }

    let input: SlipInput;
    if (file) {
      input = { type: 'image', filePath: file.path };
    } else if (dto.payload) {
      input = { type: 'payload', value: dto.payload };
    } else if (dto.base64) {
      input = { type: 'base64', value: dto.base64 };
    } else {
      input = { type: 'url', value: dto.url! };
    }

    return this.paymentService.verifySlip(
      req.user.userId,
      Number(dto.subscriptionId),
      input,
    );
  }

  @Get('my-subscription')
  async mySubscription(@Request() req) {
    return this.paymentService.getMySubscription(req.user.userId);
  }

  @Get('pending')
  async pending(@Request() req) {
    return this.paymentService.getPendingSubscription(req.user.userId);
  }

  @Get('my-history')
  async myHistory(@Request() req) {
    return this.paymentService.getMyHistory(req.user.userId);
  }

  /**
   * ราคาและสถานะเปิด/ปิดระบบ — เปิดสาธารณะ เพราะหน้า /upgrade-admin ให้คนที่ยังไม่ล็อกอินดูได้
   * คืนเฉพาะ annualPrice กับ isEnabled ไม่มีข้อมูลอ่อนไหว
   */
  @Public()
  @Get('settings')
  async getSettings() {
    return this.paymentService.getPublicSettings();
  }

  /** [Super Admin] แก้ราคา / เปิด-ปิดระบบชำระเงิน */
  @Roles(3)
  @Patch('settings')
  async updateSettings(@Request() req, @Body() dto: UpdatePaymentSettingsDto) {
    return this.paymentService.updateSettings(req.user.userId, dto);
  }

  /** [Super Admin] ประวัติการชำระเงินของผู้ใช้ทุกคน */
  @Roles(3)
  @Get('admin/subscriptions')
  async allSubscriptions() {
    return this.paymentService.getAllSubscriptions();
  }

  /** ใบเสร็จ PDF — เจ้าของรายการ หรือ Super Admin เท่านั้น */
  @Get('receipt/:id')
  async receipt(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Response() res,
  ) {
    const { buffer, filename } = await this.paymentService.buildReceipt(
      id,
      req.user.userId,
      req.user.role_id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
