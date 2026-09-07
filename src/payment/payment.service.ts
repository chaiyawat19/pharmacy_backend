import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import generatePayload from 'promptpay-qr';
import * as QRCode from 'qrcode';

import { Subscription, PaymentMethod } from './entities/subscription.entity';
import { PaymentSettings } from './entities/payment-settings.entity';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { buildReceiptPdf, ReceiptData } from './receipt.util';

// ราคาเริ่มต้นตอนสร้างแถวตั้งค่าครั้งแรกเท่านั้น — หลังจากนั้นแก้ได้จากหน้า Super Admin
// ค่าจริง 2,720 บาท/ปี (hosting 185x12 + domain 500) ต้องตรงกับ default ของคอลัมน์ใน
// PaymentSettings entity ไม่งั้นราคาจะต่างกันขึ้นกับว่าแถวถูกสร้างจากโค้ดหรือจาก DB default
// ตอนทดสอบตั้ง PAYMENT_DEFAULT_ANNUAL_PRICE=20 ใน .env แทนการแก้โค้ด
const DEFAULT_ANNUAL_PRICE = Number(
  process.env.PAYMENT_DEFAULT_ANNUAL_PRICE ?? 2720,
);
const THUNDER_BASE_URL =
  process.env.THUNDER_API_URL || 'https://api.thunder.in.th/v2';
const PAYMENT_WINDOW_MS = 5 * 60 * 1000; // เวลาที่ให้ยืนยันสลิปหลังสร้าง QR/คำแนะนำจ่ายเงิน (5 นาที)
const REMINDER_DAYS_BEFORE = 7; // เตือนล่วงหน้ากี่วันก่อนหมดอายุ
const SLIP_DIR = './uploads/payment-slips';
const SLIP_RETENTION_DAYS = 90; // เก็บไฟล์สลิปไว้ตรวจสอบย้อนหลังกี่วันก่อนลบทิ้ง

export type SlipInput =
  | { type: 'image'; filePath: string }
  | { type: 'payload'; value: string }
  | { type: 'base64'; value: string }
  | { type: 'url'; value: string };

function describeSlipInput(input: SlipInput): string {
  if (input.type === 'image') return input.filePath;
  if (input.type === 'url') return input.value;
  return `${input.type}-provided`;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  promptpay: 'พร้อมเพย์ (โอนผ่านธนาคาร)',
  truewallet: 'TrueMoney Wallet',
};

function normalizeDigits(value?: string | number | null): string {
  return String(value ?? '').replace(/\D/g, '');
}

function collectDeepStrings(value: unknown, bucket: string[] = []): string[] {
  if (typeof value === 'string' || typeof value === 'number') {
    bucket.push(String(value));
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectDeepStrings(item, bucket));
    return bucket;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectDeepStrings(item, bucket),
    );
  }
  return bucket;
}

function recipientMatches(rawReceiver: unknown, expected: string): boolean {
  const expectedDigits = normalizeDigits(expected);
  const receiverStrings = collectDeepStrings(rawReceiver);
  const receiverDigits = receiverStrings.map(normalizeDigits).filter(Boolean);

  if (!expectedDigits) return false;
  return receiverDigits.some((digits) => {
    if (digits === expectedDigits) return true;
    if (expectedDigits.length >= 4 && digits.endsWith(expectedDigits.slice(-4))) {
      return true;
    }
    return digits.length >= 4 && expectedDigits.endsWith(digits.slice(-4));
  });
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(PaymentSettings)
    private readonly settingsRepo: Repository<PaymentSettings>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  // ── ตั้งค่าระบบชำระเงิน (Super Admin) ─────────────────────────────────────

  /** อ่านค่าตั้งค่า — สร้างแถว singleton อัตโนมัติถ้ายังไม่มี */
  async getSettings(): Promise<PaymentSettings> {
    let settings = await this.settingsRepo.findOne({ where: {}, order: { id: 'ASC' } });
    if (!settings) {
      settings = this.settingsRepo.create({
        annualPrice: DEFAULT_ANNUAL_PRICE,
        isEnabled: true,
      });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async getPublicSettings() {
    const settings = await this.getSettings();
    return {
      annualPrice: settings.annualPrice,
      isEnabled: settings.isEnabled,
    };
  }

  async updateSettings(
    userId: number,
    data: { annualPrice?: number; isEnabled?: boolean },
  ) {
    const settings = await this.getSettings();
    if (data.annualPrice !== undefined) {
      settings.annualPrice = data.annualPrice;
    }
    if (data.isEnabled !== undefined) {
      settings.isEnabled = data.isEnabled;
    }
    settings.updatedBy = userId;
    await this.settingsRepo.save(settings);
    return {
      annualPrice: settings.annualPrice,
      isEnabled: settings.isEnabled,
      updatedAt: settings.updatedAt,
    };
  }

  // ── สร้างรายการชำระเงิน ───────────────────────────────────────────────────

  async generateQr(userId: number, method: PaymentMethod = 'promptpay') {
    const settings = await this.getSettings();
    if (!settings.isEnabled) {
      throw new BadRequestException(
        'ระบบชำระเงินปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแลระบบ',
      );
    }

    const existingPending = await this.subscriptionRepo.find({
      where: { userId, status: 'pending' },
      order: { qrGeneratedAt: 'DESC' },
    });
    const now = Date.now();
    for (const pending of existingPending) {
      const isExpired = now - pending.qrGeneratedAt.getTime() >= PAYMENT_WINDOW_MS;
      if (!isExpired && pending.method === method && pending.amount === settings.annualPrice) {
        return this.buildPaymentPayload(pending);
      }
      pending.status = 'failed';
      await this.subscriptionRepo.save(pending);
    }

    const subscription = this.subscriptionRepo.create({
      userId,
      amount: settings.annualPrice,
      status: 'pending',
      method,
      qrGeneratedAt: new Date(),
    });
    await this.subscriptionRepo.save(subscription);

    return this.buildPaymentPayload(subscription);
  }

  /**
   * เช็คว่า user นี้มีรายการที่ยัง pending และยังไม่หมดเวลาอยู่ไหม
   * ใช้ตอนโหลดหน้า /upgrade-admin ใหม่ (ออกไปแล้วกลับเข้ามา) เพื่อ resume QR/นับถอยหลังเดิม แทนที่จะสร้างรายการใหม่
   */
  async getPendingSubscription(userId: number) {
    const pending = await this.subscriptionRepo.findOne({
      where: { userId, status: 'pending' },
      order: { qrGeneratedAt: 'DESC' },
    });

    if (!pending) {
      return { pending: false as const };
    }

    const elapsedMs = Date.now() - pending.qrGeneratedAt.getTime();
    if (elapsedMs >= PAYMENT_WINDOW_MS) {
      pending.status = 'failed';
      await this.subscriptionRepo.save(pending);
      return { pending: false as const };
    }

    return { pending: true as const, ...(await this.buildPaymentPayload(pending)) };
  }

  private async buildPaymentPayload(subscription: Subscription) {
    const elapsedMs = Date.now() - subscription.qrGeneratedAt.getTime();
    const secondsRemaining = Math.max(0, Math.round((PAYMENT_WINDOW_MS - elapsedMs) / 1000));

    if (subscription.method === 'truewallet') {
      const phone = process.env.TRUEWALLET_PHONE;
      if (!phone) {
        throw new BadRequestException('ระบบยังไม่ได้ตั้งค่าเบอร์ TrueMoney Wallet (TRUEWALLET_PHONE)');
      }
      return {
        subscriptionId: subscription.id,
        amount: subscription.amount,
        method: 'truewallet' as const,
        secondsRemaining,
        instructions: {
          phone,
          text: `โอนผ่าน TrueMoney Wallet ไปที่เบอร์ ${phone} จำนวน ${subscription.amount} บาท`,
        },
      };
    }

    const promptpayId = process.env.PROMPTPAY_ID;
    if (!promptpayId) {
      throw new BadRequestException('ระบบยังไม่ได้ตั้งค่าบัญชีรับเงิน (PROMPTPAY_ID)');
    }

    const payload = generatePayload(promptpayId, { amount: subscription.amount });
    const qrImageBase64 = await QRCode.toDataURL(payload);

    return {
      subscriptionId: subscription.id,
      amount: subscription.amount,
      method: 'promptpay' as const,
      secondsRemaining,
      qrImage: qrImageBase64,
    };
  }

  // ── ตรวจสอบสลิป ──────────────────────────────────────────────────────────

  async verifySlip(userId: number, subscriptionId: number, input: SlipInput) {
    if (!process.env.THUNDER_API_KEY) {
      throw new BadRequestException('ระบบยังไม่ได้ตั้งค่า THUNDER_API_KEY');
    }

    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('ไม่พบรายการชำระเงินนี้');
    }
    if (subscription.userId !== userId) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงรายการนี้');
    }
    if (subscription.status !== 'pending') {
      throw new BadRequestException('รายการนี้ถูกตรวจสอบไปแล้ว');
    }
    const elapsedMs = Date.now() - subscription.qrGeneratedAt.getTime();
    if (elapsedMs >= PAYMENT_WINDOW_MS) {
      subscription.status = 'failed';
      await this.subscriptionRepo.save(subscription);
      throw new BadRequestException('หมดเวลาการชำระเงิน กรุณาสร้างรายการใหม่');
    }
    if (subscription.method === 'truewallet' && input.type === 'payload') {
      this.logger.warn(
        `Rejected verify-slip for subscription ${subscription.id}: truewallet does not support payload`,
      );
      throw new BadRequestException(
        'TrueMoney Wallet ไม่รองรับการยืนยันด้วย QR payload (รองรับแค่รูปภาพ, Base64, หรือ URL)',
      );
    }

    const verifyEndpoint =
      subscription.method === 'truewallet' ? '/verify/truewallet' : '/verify/bank';
    const remark = `subscription-${subscription.id}`;
    const slipReference = describeSlipInput(input);

    let thunderData: any;
    try {
      let response;
      if (input.type === 'image') {
        const form = new FormData();
        form.append('image', fs.createReadStream(input.filePath));
        form.append('remark', remark);
        form.append('matchAmount', String(subscription.amount));
        form.append('checkDuplicate', 'true');

        response = await axios.post(`${THUNDER_BASE_URL}${verifyEndpoint}`, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${process.env.THUNDER_API_KEY}`,
          },
          timeout: 20000,
        });
      } else {
        const body: Record<string, any> = {
          remark,
          matchAmount: subscription.amount,
          checkDuplicate: true,
          [input.type]: input.value,
        };

        response = await axios.post(`${THUNDER_BASE_URL}${verifyEndpoint}`, body, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.THUNDER_API_KEY}`,
          },
          timeout: 20000,
        });
      }
      thunderData = response.data;
    } catch (error: any) {
      const thunderBody = error.response?.data;
      const thunderError = thunderBody?.error;
      const thunderMessage =
        thunderError?.message ||
        thunderBody?.message ||
        (typeof thunderBody === 'string' ? thunderBody : undefined);

      this.logger.warn(
        `Thunder verify failed for subscription ${subscription.id} (${input.type}) ` +
          `status=${error.response?.status ?? 'NO_RESPONSE'} ` +
          `message=${thunderMessage ?? error.message}`,
      );

      // ไม่เปลี่ยน status เป็น failed — ปล่อยเป็น pending ต่อ เพื่อให้อัปโหลดสลิปใหม่ยืนยันซ้ำได้ภายในเวลาที่กำหนด
      subscription.slipImageUrl = slipReference;
      await this.subscriptionRepo.save(subscription);
      throw new BadRequestException(
        thunderMessage || 'ไม่สามารถตรวจสอบสลิปได้ในขณะนี้',
      );
    }

    if (!thunderData?.success) {
      subscription.slipImageUrl = slipReference;
      await this.subscriptionRepo.save(subscription);
      throw new BadRequestException(
        thunderData?.error?.message || 'สลิปไม่ถูกต้อง',
      );
    }

    const data = thunderData.data;
    const slipDate = new Date(data.rawSlip?.date);
    if (Number.isNaN(slipDate.getTime())) {
      subscription.slipImageUrl = slipReference;
      await this.subscriptionRepo.save(subscription);
      throw new BadRequestException('ไม่พบวันที่โอนในสลิป กรุณาใช้สลิปที่อ่านข้อมูลได้ชัดเจน');
    }

    // ── ตรวจสอบเงื่อนไข ──
    if (data.isDuplicate) {
      subscription.slipImageUrl = slipReference;
      await this.subscriptionRepo.save(subscription);
      throw new BadRequestException('สลิปนี้เคยถูกใช้ยืนยันการชำระเงินไปแล้ว');
    }
    if (data.isAmountMatched === false) {
      subscription.slipImageUrl = slipReference;
      await this.subscriptionRepo.save(subscription);
      throw new BadRequestException(
        `จำนวนเงินไม่ตรง (โอนมา ${data.amountInSlip} บาท ต้องการ ${subscription.amount} บาท)`,
      );
    }
    if (slipDate.getTime() < subscription.qrGeneratedAt.getTime()) {
      subscription.slipImageUrl = slipReference;
      await this.subscriptionRepo.save(subscription);
      throw new BadRequestException(
        'เวลาโอนในสลิปเก่ากว่าเวลาที่สร้าง QR — ไม่สามารถใช้สลิปเก่ามายืนยันได้',
      );
    }
    const expectedReceiver =
      subscription.method === 'truewallet'
        ? process.env.TRUEWALLET_PHONE
        : process.env.PROMPTPAY_ID;
    const rawReceiver =
      data.rawSlip?.receiver ??
      data.receiver ??
      data.rawSlip?.recipient ??
      data.recipient;
    if (!expectedReceiver || !recipientMatches(rawReceiver, expectedReceiver)) {
      subscription.slipImageUrl = slipReference;
      await this.subscriptionRepo.save(subscription);
      throw new BadRequestException(
        'บัญชีผู้รับเงินในสลิปไม่ตรงกับบัญชีรับชำระของระบบ',
      );
    }

    // ── ผ่านครบ ──
    const latestActive = await this.subscriptionRepo.findOne({
      where: { userId, status: 'successful' },
      order: { expiresAt: 'DESC' },
    });
    const renewalBase =
      latestActive?.expiresAt && latestActive.expiresAt.getTime() > Date.now()
        ? new Date(latestActive.expiresAt)
        : new Date();
    const expiresAt = new Date(renewalBase);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const transactionRef =
      subscription.method === 'truewallet'
        ? data.rawSlip?.transactionId
        : data.rawSlip?.transRef;
    const senderName =
      subscription.method === 'truewallet'
        ? data.rawSlip?.sender?.name
        : data.rawSlip?.sender?.account?.name?.th;

    if (transactionRef) {
      const localDuplicate = await this.subscriptionRepo
        .createQueryBuilder('subscription')
        .where('subscription.thunderTransactionRef = :transactionRef', {
          transactionRef,
        })
        .andWhere('subscription.status = :status', { status: 'successful' })
        .andWhere('subscription.id != :id', { id: subscription.id })
        .getOne();

      if (localDuplicate) {
        subscription.slipImageUrl = slipReference;
        await this.subscriptionRepo.save(subscription);
        throw new BadRequestException('สลิปนี้เคยถูกใช้ยืนยันการชำระเงินไปแล้ว');
      }
    }

    subscription.status = 'successful';
    subscription.slipImageUrl = slipReference;
    subscription.thunderTransactionRef = transactionRef ?? null;
    subscription.paidAt = slipDate;
    subscription.expiresAt = expiresAt;
    await this.subscriptionRepo.save(subscription);

    // ไม่ลดสิทธิ์ Super Admin (role_id=3) ลงมาเป็น 2 ถ้าเผลอจ่ายเงิน
    const user = await this.userRepo.findOne({ where: { user_id: userId } });
    if (user && user.role_id !== 3) {
      await this.userRepo.update({ user_id: userId }, { role_id: 2 });
    }

    if (user) {
      // แนบใบเสร็จ PDF ไปกับอีเมล — ถ้าสร้างใบเสร็จพัง ยังต้องส่งอีเมลยืนยันให้ได้อยู่ดี
      let receipt: { filename: string; content: Buffer } | undefined;
      try {
        const built = await this.buildReceipt(subscription.id, userId, user.role_id);
        receipt = { filename: built.filename, content: built.buffer };
      } catch (err) {
        this.logger.error('สร้างใบเสร็จ PDF ไม่สำเร็จ', err as Error);
      }

      try {
        await this.mailService.sendPaymentConfirmation(user.email, expiresAt, receipt);
      } catch (err) {
        this.logger.error('ส่งอีเมลยืนยันการชำระเงินไม่สำเร็จ', err as Error);
      }
    }

    return {
      status: 'successful',
      expiresAt,
      senderName: senderName ?? null,
    };
  }

  // ── สถานะ / ประวัติ ──────────────────────────────────────────────────────

  /**
   * ปรับสิทธิ์ให้ตรงกับสถานะ subscription จริง — เรียกจาก AuthService.login() ก่อนออก JWT ทุกครั้ง
   * ทำงานสองทาง: หมดอายุแล้วลดลงเป็น 1, ยังไม่หมดอายุแต่สิทธิ์หลุดไปแล้วก็ดึงกลับเป็น 2 ให้เอง
   * (ถ้าคืนสิทธิ์ไม่ได้ ผู้ใช้ที่จ่ายเงินแล้วแต่ role หลุดด้วยเหตุใดก็ตามจะติดค้างถาวร ต้องแก้ DB มือ)
   *
   * คืน expiresAt กลับไปด้วย เพื่อให้ AuthService ฝังลง JWT — JwtStrategy จะได้ตัดสิทธิ์เองได้
   * ทันทีที่หมดอายุ โดยไม่ต้องรอ token เดิม (อายุ 1 วัน) หมดหรือรอผู้ใช้ล็อกอินใหม่
   */
  async getEffectiveRoleId(
    userId: number,
    currentRoleId: number,
  ): Promise<{ roleId: number; expiresAt: Date | null }> {
    if (currentRoleId === 3) {
      return { roleId: 3, expiresAt: null }; // Super Admin ไม่ได้มาจากการจ่ายเงิน ไม่มีวันหมดอายุ
    }

    const latest = await this.subscriptionRepo.findOne({
      where: { userId, status: 'successful' },
      order: { expiresAt: 'DESC' },
    });

    // ไม่มีประวัติการจ่ายเงินเลย = สิทธิ์ปัจจุบันมาจากทางอื่น (ตั้งเองผ่าน DB ตอน dev/test)
    // ไม่ใช่ของที่ระบบนี้ออกให้ ไม่ต้องไปยุ่ง ปล่อยตามเดิม
    if (!latest) {
      return { roleId: currentRoleId, expiresAt: null };
    }

    const stillActive = !!latest.expiresAt && latest.expiresAt.getTime() > Date.now();
    const shouldBe = stillActive ? 2 : 1;

    if (shouldBe !== currentRoleId) {
      await this.userRepo.update({ user_id: userId }, { role_id: shouldBe });
      this.logger.log(
        `ปรับสิทธิ์ user ${userId}: ${currentRoleId} → ${shouldBe} (subscription ${stillActive ? 'ยังไม่หมดอายุ' : 'หมดอายุแล้ว'})`,
      );
    }
    return { roleId: shouldBe, expiresAt: stillActive ? latest.expiresAt : null };
  }

  async getMySubscription(userId: number) {
    const latest = await this.subscriptionRepo.findOne({
      where: { userId, status: 'successful' },
      order: { expiresAt: 'DESC' },
    });

    if (!latest || !latest.expiresAt) {
      return { hasActiveSubscription: false };
    }

    const now = Date.now();
    const daysRemaining = Math.ceil(
      (latest.expiresAt.getTime() - now) / (1000 * 60 * 60 * 24),
    );

    return {
      hasActiveSubscription: daysRemaining > 0,
      expiresAt: latest.expiresAt,
      daysRemaining: Math.max(0, daysRemaining),
    };
  }

  /** ประวัติการชำระเงินของตัวเอง (เฉพาะรายการที่สำเร็จ — pending/failed ไม่มีความหมายกับผู้ใช้) */
  async getMyHistory(userId: number) {
    const rows = await this.subscriptionRepo.find({
      where: { userId, status: 'successful' },
      order: { createdAt: 'DESC' },
    });

    return rows.map((s) => ({
      id: s.id,
      amount: s.amount,
      method: s.method,
      methodLabel: METHOD_LABELS[s.method] ?? s.method,
      transactionRef: s.thunderTransactionRef,
      paidAt: s.paidAt ?? s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }

  /** [Super Admin] รายการชำระเงินทั้งหมดของทุกคน + ข้อมูลผู้ใช้ */
  async getAllSubscriptions() {
    const rows = await this.subscriptionRepo.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    const now = Date.now();
    return rows.map((s) => ({
      id: s.id,
      status: s.status,
      amount: s.amount,
      method: s.method,
      methodLabel: METHOD_LABELS[s.method] ?? s.method,
      transactionRef: s.thunderTransactionRef,
      paidAt: s.paidAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isActive:
        s.status === 'successful' &&
        !!s.expiresAt &&
        s.expiresAt.getTime() > now,
      user: s.user
        ? {
            id: s.user.user_id,
            name: `${s.user.first_name ?? ''} ${s.user.last_name ?? ''}`.trim(),
            email: s.user.email,
            roleId: s.user.role_id,
            lastLoginAt: s.user.last_login_at,
          }
        : null,
    }));
  }

  // ── ใบเสร็จ PDF ──────────────────────────────────────────────────────────

  async buildReceipt(
    subscriptionId: number,
    requesterId: number,
    requesterRoleId: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId },
      relations: ['user'],
    });

    if (!subscription) {
      throw new NotFoundException('ไม่พบรายการชำระเงินนี้');
    }
    // เจ้าของรายการ หรือ Super Admin เท่านั้น
    if (subscription.userId !== requesterId && requesterRoleId !== 3) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงใบเสร็จนี้');
    }
    if (subscription.status !== 'successful') {
      throw new BadRequestException('รายการนี้ยังชำระเงินไม่สำเร็จ จึงยังไม่มีใบเสร็จ');
    }

    const data: ReceiptData = {
      receiptNo: `RC-${String(subscription.id).padStart(6, '0')}`,
      customerName:
        `${subscription.user?.first_name ?? ''} ${subscription.user?.last_name ?? ''}`.trim() ||
        '-',
      customerEmail: subscription.user?.email ?? '-',
      amount: subscription.amount,
      method: METHOD_LABELS[subscription.method] ?? subscription.method,
      transactionRef: subscription.thunderTransactionRef,
      paidAt: subscription.paidAt ?? subscription.createdAt,
      expiresAt: subscription.expiresAt,
    };

    const buffer = await buildReceiptPdf(data);
    return { buffer, filename: `receipt-${data.receiptNo}.pdf` };
  }

  // ── แจ้งเตือนก่อนหมดอายุ (cron รายวัน 09:00) ──────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendExpiryReminders() {
    const now = new Date();
    const windowStart = new Date(now);
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + REMINDER_DAYS_BEFORE);

    const dueSoon = await this.subscriptionRepo.find({
      where: {
        status: 'successful',
        reminderSentAt: IsNull(),
        expiresAt: Between(windowStart, windowEnd),
      },
      relations: ['user'],
    });

    if (dueSoon.length === 0) {
      return;
    }

    this.logger.log(`ส่งอีเมลเตือนหมดอายุ ${dueSoon.length} รายการ`);

    for (const sub of dueSoon) {
      if (!sub.user?.email || !sub.expiresAt) continue;
      const daysLeft = Math.ceil(
        (sub.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      try {
        await this.mailService.sendSubscriptionExpiryReminder(
          sub.user.email,
          sub.expiresAt,
          daysLeft,
        );
        sub.reminderSentAt = new Date();
        await this.subscriptionRepo.save(sub);
      } catch (err) {
        this.logger.error(
          `ส่งอีเมลเตือนหมดอายุให้ ${sub.user.email} ไม่สำเร็จ`,
          err as Error,
        );
      }
    }
  }

  // ── ล้างไฟล์สลิปเก่า (cron รายวัน 03:00) ─────────────────────────────────

  /**
   * ไฟล์สลิปที่อัปโหลดมาถูกเก็บไว้บนดิสก์และไม่เคยถูกลบ — สะสมไปเรื่อย ๆ จนเต็ม
   * เก็บไว้ SLIP_RETENTION_DAYS วันเพื่อตรวจสอบย้อนหลัง แล้วลบทิ้ง
   * (ตัว path ยังอยู่ในคอลัมน์ slipImageUrl เป็นหลักฐานว่าเคยยืนยันด้วยไฟล์ไหน)
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldSlips() {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(SLIP_DIR);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        this.logger.error('อ่านโฟลเดอร์สลิปไม่สำเร็จ', err as Error);
      }
      return; // ยังไม่เคยมีใครอัปโหลดสลิป โฟลเดอร์ยังไม่ถูกสร้าง
    }

    const cutoff = Date.now() - SLIP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const entry of entries) {
      const filePath = `${SLIP_DIR}/${entry}`;
      try {
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile() || stat.mtimeMs >= cutoff) continue;
        await fs.promises.unlink(filePath);
        removed++;
      } catch (err) {
        this.logger.warn(`ลบไฟล์สลิป ${entry} ไม่สำเร็จ: ${(err as Error).message}`);
      }
    }

    if (removed > 0) {
      this.logger.log(
        `ลบไฟล์สลิปที่เก่ากว่า ${SLIP_RETENTION_DAYS} วันแล้ว ${removed} ไฟล์`,
      );
    }
  }
}
