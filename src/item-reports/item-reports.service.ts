import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { ItemReport, ItemReportStatus } from './entities/item-report.entity';
import { Item } from '../items-bank/entities/items.entity';
import { ItemBankItem } from '../items-bank/entities/item_bank_items.entity';
import {
  CreateItemReportDto,
  ResolveItemReportsDto,
  UpdateItemReportDto,
} from './dto/item-report.dto';

export interface OpenReportSummary {
  id: number;
  reason: string;
  message: string | null;
  created_at: Date;
  item_edited_at: Date | null;
  reporter: string | null;
}

/** กันการส่งรัว — ต่อข้อเปิดค้างได้ทีละ 1 รายงาน และรวมไม่เกินเท่านี้ใน 24 ชั่วโมง */
const MAX_REPORTS_PER_DAY = 30;

@Injectable()
export class ItemReportsService {
  constructor(
    @InjectRepository(ItemReport)
    private readonly reportRepo: Repository<ItemReport>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(ItemBankItem)
    private readonly bankItemRepo: Repository<ItemBankItem>,
  ) {}

  async countOpen() {
    return { open: await this.reportRepo.count({ where: { status: 'open' } }) };
  }

  /** รายงานที่รอตรวจของข้อที่ระบุ — จำนวนต่อข้อ และรายละเอียดให้หน้าคลังข้อสอบแสดงใต้ข้อนั้น */
  async countOpenByItems(itemIds: number[]) {
    if (!itemIds.length) return { total: 0, counts: {}, reports: {} };
    const rows = await this.reportRepo.find({
      where: { itemId: In(itemIds), status: 'open' },
      order: { createdAt: 'ASC' },
    });
    const names = await this.firstNames(rows.map((r) => r.userId));
    const counts: Record<number, number> = {};
    const reports: Record<number, OpenReportSummary[]> = {};
    for (const r of rows) {
      counts[r.itemId] = (counts[r.itemId] ?? 0) + 1;
      (reports[r.itemId] ??= []).push({
        id: r.id,
        reason: r.reason,
        message: r.message,
        created_at: r.createdAt,
        item_edited_at: r.itemEditedAt,
        reporter: names.get(r.userId) || null,
      });
    }
    return { total: rows.length, counts, reports };
  }

  /** ชื่อต้นของผู้ใช้ (ไม่ส่งอีเมลหรือข้อมูลติดต่อ) */
  private async firstNames(userIds: number[]) {
    const ids = [...new Set(userIds)];
    const names = new Map<number, string>();
    if (!ids.length) return names;
    const users = await this.reportRepo.manager
      .createQueryBuilder()
      .select(['u.user_id AS user_id', 'u.first_name AS first_name'])
      .from('users', 'u')
      .where('u.user_id IN (:...ids)', { ids })
      .getRawMany<{ user_id: number; first_name: string | null }>();
    users.forEach((u) => names.set(Number(u.user_id), u.first_name ?? ''));
    return names;
  }

  /** ปิดรายงานที่รอตรวจทั้งหมดของข้อที่ระบุเป็น "แก้ไขแล้ว" */
  async resolveByItems(adminId: number, dto: ResolveItemReportsDto) {
    const res = await this.reportRepo.update(
      { itemId: In(dto.item_ids), status: 'open' },
      {
        status: 'resolved',
        adminNote: dto.admin_note?.trim() || null,
        resolvedBy: adminId,
        resolvedAt: new Date(),
      },
    );
    return { resolved: res.affected ?? 0 };
  }

  /**
   * หาว่าแต่ละข้ออยู่คลังไหน เป็นข้อที่เท่าไร — เลขข้อเรียงแบบเดียวกับหน้าจัดการคลังข้อสอบ
   * (ข้อในสถานการณ์เดียวกันอยู่ติดกัน กลุ่มเรียงตาม display_order ต่ำสุดของกลุ่ม)
   */
  private async locateItems(itemIds: number[]) {
    const result = new Map<
      number,
      { item_bank_id: number; bank_name: string; question_no: number }[]
    >();
    if (!itemIds.length) return result;

    const links = await this.bankItemRepo.find({
      where: { item_id: In(itemIds) },
      relations: ['item_bank'],
    });
    const banks = new Map<number, string>();
    links.forEach(
      (l) => l.item_bank && banks.set(l.item_bank_id, l.item_bank.bank_name),
    );
    if (!banks.size) return result;

    const rows = await this.bankItemRepo.find({
      where: { item_bank_id: In([...banks.keys()]) },
      relations: ['item'],
      order: { display_order: 'ASC' },
    });
    const wanted = new Set(itemIds);
    for (const [bankId, bankName] of banks) {
      const groups = new Map<number, { order: number; ids: number[] }>();
      const standalone: { order: number; ids: number[] }[] = [];
      for (const r of rows) {
        if (r.item_bank_id !== bankId || !r.item) continue;
        const order = r.display_order ?? 0;
        const sitId = r.item.situation_id;
        if (sitId) {
          const g = groups.get(sitId);
          if (g) {
            g.ids.push(r.item_id);
            g.order = Math.min(g.order, order);
          } else groups.set(sitId, { order, ids: [r.item_id] });
        } else standalone.push({ order, ids: [r.item_id] });
      }
      let no = 0;
      [...groups.values(), ...standalone]
        .sort((a, b) => a.order - b.order)
        .forEach((g) =>
          g.ids.forEach((id) => {
            no++;
            if (!wanted.has(id)) return;
            const list = result.get(id) ?? [];
            list.push({
              item_bank_id: bankId,
              bank_name: bankName,
              question_no: no,
            });
            result.set(id, list);
          }),
        );
    }
    return result;
  }

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

    const names = await this.firstNames(
      reports.flatMap((r) =>
        r.resolvedBy ? [r.userId, r.resolvedBy] : [r.userId],
      ),
    );

    const counts = await this.reportRepo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.status')
      .getRawMany<{ status: ItemReportStatus; count: string }>();

    const locations = await this.locateItems([
      ...new Set(reports.map((r) => r.itemId)),
    ]);

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
        resolved_by: r.resolvedBy ? names.get(r.resolvedBy) || null : null,
        item_edited_at: r.itemEditedAt,
        reporter: names.get(r.userId) || null,
        locations: locations.get(r.itemId) ?? [],
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
