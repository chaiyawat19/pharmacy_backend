import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ItemReport, ItemReportStatus } from './entities/item-report.entity';
import { Item } from '../items-bank/entities/items.entity';
import {
  CreateItemReportDto,
  UpdateItemReportDto,
} from './dto/item-report.dto';

/** กันการส่งรัว — ต่อข้อเปิดค้างได้ทีละ 1 รายงาน และรวมไม่เกินเท่านี้ใน 24 ชั่วโมง */
const MAX_REPORTS_PER_DAY = 30;

@Injectable()
export class ItemReportsService {
  constructor(
    @InjectRepository(ItemReport)
    private readonly reportRepo: Repository<ItemReport>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  async create(userId: number, dto: CreateItemReportDto) {
    const exists = await this.itemRepo.exists({ where: { item_id: dto.item_id } });
    if (!exists) throw new NotFoundException('ไม่พบข้อสอบนี้');

    const pending = await this.reportRepo.exists({
      where: { userId, itemId: dto.item_id, status: 'open' },
    });
    if (pending) {
      throw new BadRequestException('คุณแจ้งปัญหาข้อนี้ไว้แล้ว กำลังรอผู้ดูแลตรวจสอบ');
    }

    const recent = await this.reportRepo.count({
      where: { userId, createdAt: MoreThanOrEqual(new Date(Date.now() - 24 * 60 * 60 * 1000)) },
    });
    if (recent >= MAX_REPORTS_PER_DAY) {
      throw new BadRequestException('วันนี้แจ้งปัญหาครบจำนวนที่กำหนดแล้ว กรุณาลองใหม่พรุ่งนี้');
    }

    const saved = await this.reportRepo.save(
      this.reportRepo.create({
        itemId: dto.item_id,
        userId,
        reason: dto.reason,
        message: dto.message?.trim() || null,
      }),
    );
    return { id: saved.id, status: saved.status };
  }

  /** รายการสำหรับแอดมิน พร้อมโจทย์ ตัวเลือก และชื่อผู้แจ้ง (ไม่ส่งอีเมลหรือข้อมูลติดต่อ) */
  async listForAdmin(status?: ItemReportStatus) {
    const qb = this.reportRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.item', 'item')
      .leftJoinAndSelect('item.answer_options', 'opt')
      .orderBy('r.created_at', 'DESC')
      .addOrderBy('opt.option_id', 'ASC');
    if (status) qb.where('r.status = :status', { status });
    const reports = await qb.getMany();

    const userIds = [...new Set(reports.map((r) => r.userId))];
    const names = new Map<number, string>();
    if (userIds.length) {
      const users = await this.reportRepo.manager
        .createQueryBuilder()
        .select(['u.user_id AS user_id', 'u.first_name AS first_name'])
        .from('users', 'u')
        .where('u.user_id IN (:...userIds)', { userIds })
        .getRawMany<{ user_id: number; first_name: string | null }>();
      users.forEach((u) => names.set(Number(u.user_id), u.first_name ?? ''));
    }

    const counts = await this.reportRepo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.status')
      .getRawMany<{ status: ItemReportStatus; count: string }>();

    return {
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.count)])),
      reports: reports.map((r) => ({
        id: r.id,
        item_id: r.itemId,
        reason: r.reason,
        message: r.message,
        status: r.status,
        admin_note: r.adminNote,
        created_at: r.createdAt,
        resolved_at: r.resolvedAt,
        reporter: names.get(r.userId) || null,
        item: r.item
          ? {
              question_text: r.item.question_text,
              explanation: r.item.explanation,
              options: (r.item.answer_options ?? []).map((o) => ({
                option_id: o.option_id,
                option_text: o.option_text,
                is_correct: o.is_correct,
              })),
            }
          : null,
      })),
    };
  }

  async update(adminId: number, id: number, dto: UpdateItemReportDto) {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException('ไม่พบรายงานนี้');
    report.status = dto.status;
    if (dto.admin_note !== undefined) report.adminNote = dto.admin_note.trim() || null;
    const closed = dto.status !== 'open';
    report.resolvedBy = closed ? adminId : null;
    report.resolvedAt = closed ? new Date() : null;
    await this.reportRepo.save(report);
    return { id: report.id, status: report.status };
  }
}
