import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DailyReview } from './entities/daily-review.entity';
import { AnswerDailyReviewDto } from './dto/daily-review.dto';
import { Item } from '../items-bank/entities/items.entity';
import { ExamService } from '../items-bank/exam.service';

/** จำนวนข้อต่อวัน และสัดส่วนสูงสุดที่ดึงจากข้อที่เคยตอบผิด */
const ITEMS_PER_DAY = 5;
const MAX_WEAK_ITEMS = 3;

/** วันที่ปัจจุบันตามเวลาไทย (YYYY-MM-DD) — ชุดทบทวนเปลี่ยนตอนเที่ยงคืนเวลาไทย */
const todayInBangkok = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ข้อที่ใช้ได้: เปิดใช้งาน ยังไม่ถูกลบ และอยู่ในชุดข้อสอบที่เปิดใช้งาน
const AVAILABLE_ITEM_SQL = `
  i.deleted_at IS NULL AND i.status = 'active'
  AND EXISTS (
    SELECT 1 FROM item_bank_items bi
    JOIN item_banks b ON b.item_bank_id = bi.item_bank_id
    WHERE bi.item_id = i.item_id AND b.is_active = true AND b.deleted_at IS NULL
  )`;

@Injectable()
export class DailyReviewService {
  constructor(
    @InjectRepository(DailyReview)
    private readonly reviewRepo: Repository<DailyReview>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    private readonly examService: ExamService,
  ) {}

  async getToday(userId: number) {
    const review = await this.findOrCreateToday(userId);
    const items = await this.itemRepo.find({
      where: { item_id: In(review.itemIds) },
      relations: ['answer_options', 'situation'],
    });
    const byId = new Map(items.map((i) => [i.item_id, i]));

    return {
      date: review.reviewDate,
      total: review.itemIds.length,
      answered: Object.keys(review.answers).length,
      completed: !!review.completedAt,
      streak: await this.streak(userId),
      items: review.itemIds
        .map((id) => byId.get(id))
        .filter((i): i is Item => !!i)
        .map((item) => {
          const answer = review.answers[String(item.item_id)];
          const options = [...(item.answer_options ?? [])].sort((a, b) => a.option_id - b.option_id);
          return {
            item_id: item.item_id,
            question_text: item.question_text,
            question_image_url: item.question_image_url ?? null,
            situation: item.situation
              ? {
                  situation_text: item.situation.situation_text,
                  situation_image_url: item.situation.situation_image_url ?? null,
                }
              : null,
            answer_options: options.map((o) => ({
              option_id: o.option_id,
              option_text: o.option_text,
              option_image_url: o.option_image_url ?? null,
            })),
            // เฉลยส่งเฉพาะข้อที่ตอบไปแล้ว
            result: answer
              ? {
                  selected_option_id: answer.option_id,
                  is_correct: answer.is_correct,
                  correct_option_id: options.find((o) => o.is_correct)?.option_id ?? null,
                  explanation: item.explanation,
                }
              : null,
          };
        }),
    };
  }

  async answer(userId: number, dto: AnswerDailyReviewDto) {
    const review = await this.reviewRepo.findOne({
      where: { userId, reviewDate: todayInBangkok() },
    });
    if (!review || !review.itemIds.includes(dto.item_id)) {
      throw new NotFoundException('ข้อนี้ไม่อยู่ในชุดทบทวนของวันนี้');
    }
    if (review.answers[String(dto.item_id)]) {
      throw new BadRequestException('ตอบข้อนี้ไปแล้ว');
    }

    const item = await this.itemRepo.findOne({
      where: { item_id: dto.item_id },
      relations: ['answer_options'],
    });
    if (!item) throw new NotFoundException('ไม่พบข้อสอบนี้');
    const selected = item.answer_options.find((o) => o.option_id === dto.option_id);
    if (!selected) throw new BadRequestException('ตัวเลือกไม่ถูกต้อง');

    const isCorrect = !!selected.is_correct;
    await this.examService.updateUserItemMastery(userId, item.item_id, isCorrect);

    review.answers = {
      ...review.answers,
      [String(item.item_id)]: { option_id: selected.option_id, is_correct: isCorrect },
    };
    const completed = Object.keys(review.answers).length >= review.itemIds.length;
    if (completed && !review.completedAt) review.completedAt = new Date();
    await this.reviewRepo.save(review);

    return {
      is_correct: isCorrect,
      correct_option_id: item.answer_options.find((o) => o.is_correct)?.option_id ?? null,
      explanation: item.explanation,
      completed,
    };
  }

  private async findOrCreateToday(userId: number): Promise<DailyReview> {
    const reviewDate = todayInBangkok();
    const existing = await this.reviewRepo.findOne({ where: { userId, reviewDate } });
    if (existing) return existing;

    const itemIds = await this.pickItems(userId);
    try {
      return await this.reviewRepo.save(
        this.reviewRepo.create({ userId, reviewDate, itemIds, answers: {} }),
      );
    } catch {
      // เปิดพร้อมกันสองแท็บ — อีกคำขอสร้างไปก่อนแล้ว (ชน unique) ใช้ของที่มีอยู่
      const created = await this.reviewRepo.findOne({ where: { userId, reviewDate } });
      if (created) return created;
      throw new BadRequestException('ไม่สามารถสร้างชุดทบทวนได้ กรุณาลองใหม่');
    }
  }

  /**
   * เลือกข้อ: ไม่เกิน MAX_WEAK_ITEMS ข้อจากข้อที่เคยตอบผิดและยังตอบถูกติดกันไม่ถึง 2 ครั้ง
   * ที่เหลือเติมด้วยข้อที่ยังไม่เคยทำก่อน แล้วจึงเป็นข้ออื่น ๆ
   */
  private async pickItems(userId: number): Promise<number[]> {
    const weak: Array<{ item_id: number }> = await this.itemRepo.query(
      `SELECT i.item_id FROM items i
       JOIN user_item_mastery m ON m.item_id = i.item_id AND m.user_id = $1
       WHERE ${AVAILABLE_ITEM_SQL} AND m.total_incorrect > 0 AND m.correct_streak < 2
       ORDER BY random() LIMIT $2`,
      [userId, MAX_WEAK_ITEMS],
    );
    const weakIds = weak.map((r) => Number(r.item_id));

    const rest: Array<{ item_id: number }> = await this.itemRepo.query(
      `SELECT i.item_id FROM items i
       LEFT JOIN user_item_mastery m ON m.item_id = i.item_id AND m.user_id = $1
       WHERE ${AVAILABLE_ITEM_SQL} AND NOT (i.item_id = ANY($2::int[]))
       ORDER BY (m.item_id IS NOT NULL), random() LIMIT $3`,
      [userId, weakIds, ITEMS_PER_DAY - weakIds.length],
    );

    const ids = [...weakIds, ...rest.map((r) => Number(r.item_id))];
    if (ids.length === 0) throw new NotFoundException('ยังไม่มีข้อสอบในระบบสำหรับทบทวน');
    return ids;
  }

  /** จำนวนวันติดกันที่ทำครบ นับถึงวันนี้ (หรือถึงเมื่อวานถ้าวันนี้ยังไม่ครบ) */
  private async streak(userId: number): Promise<number> {
    const rows = await this.reviewRepo
      .createQueryBuilder('r')
      .select('r.review_date', 'date')
      .where('r.user_id = :userId', { userId })
      .andWhere('r.completed_at IS NOT NULL')
      .orderBy('r.review_date', 'DESC')
      .limit(366)
      .getRawMany<{ date: string | Date }>();
    const done = new Set(
      rows.map((r) => (r.date instanceof Date ? r.date.toISOString() : String(r.date)).slice(0, 10)),
    );

    let day = todayInBangkok();
    if (!done.has(day)) day = addDays(day, -1);
    let count = 0;
    while (done.has(day)) {
      count += 1;
      day = addDays(day, -1);
    }
    return count;
  }
}
