import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from './entities/items.entity';
import { ItemBankItem } from './entities/item_bank_items.entity';
import { ItemsBank } from './entities/items-bank.entity';
import { ExamSession } from './entities/exam-session.entity';

@Injectable()
export class IrtManagementService implements OnModuleInit {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(ItemBankItem)
    private readonly itemBankItemRepo: Repository<ItemBankItem>,
    @InjectRepository(ItemsBank)
    private readonly bankRepo: Repository<ItemsBank>,
    @InjectRepository(ExamSession)
    private readonly examSessionRepo: Repository<ExamSession>,
  ) {}

  async onModuleInit() {
    try {
      // Auto-set default IRT values (a=1.0, b=0.0, c=0.20) for any legacy or imported items missing valid IRT
      await this.itemRepo
        .createQueryBuilder()
        .update(Item)
        .set({
          irt_a_discrimination: 1.0,
          irt_b_difficulty: 0.0,
          irt_c_guessing: 0.20,
        })
        .where('irt_a_discrimination IS NULL OR irt_a_discrimination <= 0 OR irt_b_difficulty IS NULL OR irt_c_guessing IS NULL')
        .execute();
    } catch (err) {
      console.warn('Failed to auto-set default IRT parameters:', err);
    }
  }

  // ==================== IRT / CAT Methods ====================

  /**
   * ดึงข้อสอบทั้งหมดที่มี IRT parameters ครบ พร้อมข้อมูล item bank
   * (legacy — ใช้โดย endpoint เดิม)
   */
  async getItemsWithIRTParameters() {
    const allItemBankItems = await this.itemBankItemRepo.find({
      relations: ['item', 'item.answer_options', 'item.situation', 'item_bank'],
      order: { item_bank_id: 'ASC', display_order: 'ASC' },
    });

    const itemsWithIRT = allItemBankItems.filter((bbi) => this.isValidIRTItem(bbi.item));

    return itemsWithIRT.map((bbi) => ({
      item_id: bbi.item.item_id,
      question_text: bbi.item.question_text,
      question_image_url: bbi.item.question_image_url,
      irt_a_discrimination: bbi.item.irt_a_discrimination,
      irt_b_difficulty: bbi.item.irt_b_difficulty,
      irt_c_guessing: bbi.item.irt_c_guessing,
      explanation: bbi.item.explanation,
      status: bbi.item.status,
      display_order: bbi.display_order,
      situation: bbi.item.situation
        ? {
            situation_id: bbi.item.situation.situation_id,
            situation_text: bbi.item.situation.situation_text,
            situation_image_url: bbi.item.situation.situation_image_url,
          }
        : null,
      item_bank: {
        item_bank_id: bbi.item_bank.item_bank_id,
        bank_name: bbi.item_bank.bank_name,
        description: bbi.item_bank.description,
      },
      answer_options: bbi.item.answer_options?.map((opt) => ({
        option_id: opt.option_id,
        option_text: opt.option_text,
        is_correct: opt.is_correct,
      })),
    }));
  }

  /**
   * ดึงข้อสอบ **ทั้งหมด** (ทั้งที่มี IRT และยังไม่มี) สำหรับหน้า CAT Management
   * ข้อที่ยังไม่ได้ตั้งค่าจะ return irt_* เป็น null
   */
  async getAllItemsForCATManagement() {
    const allItemBankItems = await this.itemBankItemRepo.find({
      relations: ['item', 'item.answer_options', 'item.situation', 'item_bank'],
      order: { item_bank_id: 'ASC', display_order: 'ASC' },
    });

    return allItemBankItems.map((bbi) => ({
      item_id: bbi.item.item_id,
      question_text: bbi.item.question_text,
      question_image_url: bbi.item.question_image_url,
      irt_a_discrimination: (bbi.item.irt_a_discrimination && bbi.item.irt_a_discrimination > 0) ? bbi.item.irt_a_discrimination : 1.0,
      irt_b_difficulty: bbi.item.irt_b_difficulty ?? 0.0,
      irt_c_guessing: bbi.item.irt_c_guessing ?? 0.20,
      irt_calibrated: this.isValidIRTItem(bbi.item),
      explanation: bbi.item.explanation,
      status: bbi.item.status,
      display_order: bbi.display_order,
      situation: (bbi.item.situation && (
        (bbi.item.situation.situation_text && bbi.item.situation.situation_text.replace(/<[^>]*>/g, '').trim() !== '') ||
        (bbi.item.situation.situation_image_url && bbi.item.situation.situation_image_url.trim() !== '')
      ))
        ? {
            situation_id: bbi.item.situation.situation_id,
            situation_text: bbi.item.situation.situation_text,
            situation_image_url: bbi.item.situation.situation_image_url,
          }
        : null,
      item_bank: {
        item_bank_id: bbi.item_bank.item_bank_id,
        bank_name: bbi.item_bank.bank_name,
        description: bbi.item_bank.description,
      },
      answer_options: bbi.item.answer_options?.map((opt) => ({
        option_id: opt.option_id,
        option_text: opt.option_text,
        is_correct: opt.is_correct,
      })),
    }));
  }

  /**
   * ดึงข้อสอบที่มี IRT parameters ในชุดข้อสอบเฉพาะ
   */
  async getItemBankItemsWithIRT(itemBankId: number) {
    const itemBank = await this.bankRepo.findOne({
      where: { item_bank_id: itemBankId },
    });

    if (!itemBank) {
      throw new NotFoundException(`ไม่พบคลังข้อสอบ ID ${itemBankId}`);
    }

    const itemBankItems = await this.itemBankItemRepo.find({
      where: { item_bank_id: itemBankId },
      relations: ['item', 'item.answer_options', 'item.situation'],
      order: { display_order: 'ASC' },
    });

    const itemsWithIRT = itemBankItems.filter((bbi) => this.isValidIRTItem(bbi.item));
    const itemsWithoutIRT = itemBankItems.filter((bbi) => !this.isValidIRTItem(bbi.item));

    return {
      item_bank_id: itemBankId,
      bank_name: itemBank.bank_name,
      total_items: itemBankItems.length,
      items_with_irt: itemsWithIRT.length,
      items_without_irt: itemsWithoutIRT.length,
      readiness_percentage: Math.round((itemsWithIRT.length / itemBankItems.length) * 100),
      items: itemsWithIRT.map((bbi) => ({
        item_id: bbi.item.item_id,
        question_text: bbi.item.question_text,
        question_image_url: bbi.item.question_image_url,
        irt_a_discrimination: bbi.item.irt_a_discrimination,
        irt_b_difficulty: bbi.item.irt_b_difficulty,
        irt_c_guessing: bbi.item.irt_c_guessing,
        explanation: bbi.item.explanation,
        status: bbi.item.status,
        display_order: bbi.display_order,
        situation: bbi.item.situation
          ? {
              situation_id: bbi.item.situation.situation_id,
              situation_text: bbi.item.situation.situation_text,
            }
          : null,
        answer_options: bbi.item.answer_options?.map((opt) => ({
          option_id: opt.option_id,
          option_text: opt.option_text,
          is_correct: opt.is_correct,
        })),
      })),
      items_missing_irt: itemsWithoutIRT.map((bbi) => ({
        item_id: bbi.item.item_id,
        question_text: bbi.item.question_text?.substring(0, 100) + '...',
        missing_params: this.getMissingIRTParams(bbi.item),
      })),
    };
  }

  /**
   * อัพเดท IRT parameters แบบ batch
   */
  async batchUpdateIRTParameters(updateData: {
    updates: Array<{
      item_id: number;
      irt_a_discrimination: number;
      irt_b_difficulty: number;
      irt_c_guessing: number;
    }>;
  }) {
    const results: {
      success: Array<{ item_id: number; message: string }>;
      failed: Array<{ item_id: number; reason: string }>;
    } = { success: [], failed: [] };

    for (const update of updateData.updates) {
      try {
        const item = await this.itemRepo.findOne({ where: { item_id: update.item_id } });

        if (!item) {
          results.failed.push({ item_id: update.item_id, reason: 'ไม่พบข้อสอบ' });
          continue;
        }

        if (
          update.irt_a_discrimination <= 0 ||
          update.irt_c_guessing < 0 ||
          update.irt_c_guessing >= 1
        ) {
          results.failed.push({ item_id: update.item_id, reason: 'IRT parameters ไม่ถูกต้อง' });
          continue;
        }

        await this.itemRepo.update(
          { item_id: update.item_id },
          {
            irt_a_discrimination: update.irt_a_discrimination,
            irt_b_difficulty: update.irt_b_difficulty,
            irt_c_guessing: update.irt_c_guessing,
          },
        );

        results.success.push({ item_id: update.item_id, message: 'อัพเดทสำเร็จ' });
      } catch (error) {
        results.failed.push({ item_id: update.item_id, reason: error.message });
      }
    }

    return {
      message: 'Batch update completed',
      total: updateData.updates.length,
      success_count: results.success.length,
      failed_count: results.failed.length,
      results,
    };
  }

  /**
   * ดู CAT readiness summary ของทุก item banks
   */
  async getCATReadinessSummary() {
    const allBanks = await this.bankRepo.find({ order: { item_bank_id: 'ASC' } });

    const summary = await Promise.all(
      allBanks.map(async (bank) => {
        const itemBankItems = await this.itemBankItemRepo.find({
          where: { item_bank_id: bank.item_bank_id },
          relations: ['item'],
        });

        const totalItems = itemBankItems.length;
        const itemsWithIRT = itemBankItems.filter((bbi) => this.isValidIRTItem(bbi.item)).length;
        const itemsWithoutIRT = totalItems - itemsWithIRT;
        const readinessPercentage =
          totalItems > 0 ? Math.round((itemsWithIRT / totalItems) * 100) : 0;
        const isReady = itemsWithIRT >= 20;

        return {
          item_bank_id: bank.item_bank_id,
          bank_name: bank.bank_name,
          total_items: totalItems,
          items_with_irt: itemsWithIRT,
          items_without_irt: itemsWithoutIRT,
          readiness_percentage: readinessPercentage,
          is_ready: isReady,
          status: isReady
            ? '✅ พร้อมใช้'
            : itemsWithIRT > 0
              ? `⚠️ ยังไม่พร้อม (${itemsWithIRT}/20)`
              : '❌ ยังไม่มี IRT parameters',
        };
      }),
    );

    const totalReady = summary.filter((s) => s.is_ready).length;

    return {
      total_item_banks: summary.length,
      ready_for_cat: totalReady,
      not_ready: summary.length - totalReady,
      overall_percentage: Math.round((totalReady / summary.length) * 100),
      item_banks: summary,
    };
  }

  /**
   * ดึงข้อมูลสถิติภาพรวมของ Item Bank สำหรับ Dashboard
   */
  async getDashboardStats(itemBankId: number) {
    const bank = await this.bankRepo.findOne({ where: { item_bank_id: itemBankId } });
    if (!bank) {
      throw new NotFoundException(`Item bank with ID ${itemBankId} not found`);
    }

    const totalItems = await this.itemBankItemRepo.count({ where: { item_bank_id: itemBankId } });
    const totalAttempts = await this.examSessionRepo.count({ where: { itemBankId: itemBankId } });

    const completedSessionsBuilder = this.examSessionRepo
      .createQueryBuilder('session')
      .where('session.itemBankId = :itemBankId', { itemBankId })
      .andWhere('session.end_time IS NOT NULL');

    const completedCount = await completedSessionsBuilder.getCount();
    const completedSessionsData = await completedSessionsBuilder.getMany();

    let averageScore = 0;
    let maxScore = 0;
    let minScore = 0;
    let passCount = 0;

    const scoreDistribution = Array(10)
      .fill(0)
      .map((_, i) => ({ range: `${i * 10}-${(i + 1) * 10}%`, count: 0 }));

    if (completedCount > 0) {
      const scores = completedSessionsData.map((s) => s.final_score);
      const sumScore = scores.reduce((a, b) => a + b, 0);
      averageScore = sumScore / completedCount;
      maxScore = Math.max(...scores);
      minScore = Math.min(...scores);
      passCount = scores.filter((s) => s >= 50).length;
      scores.forEach((score) => {
        const index = Math.min(Math.floor(score / 10), 9);
        scoreDistribution[index].count++;
      });
    }

    const passRate = completedCount > 0 ? (passCount / completedCount) * 100 : 0;

    const categoryRelations = await this.itemBankItemRepo.manager
      .getRepository('ItemBankCategory')
      .find({ where: { item_bank_id: itemBankId }, relations: ['category'] });

    const categories = categoryRelations.map((rel: any) => ({
      category_id: rel.category.category_id,
      category_name: rel.category.category_name,
    }));

    const recentActivityRaw = await this.examSessionRepo.find({
      where: { itemBankId },
      order: { start_time: 'DESC' },
      take: 10,
      relations: ['user'],
    });

    const recentActivity = recentActivityRaw.map((session) => ({
      session_id: session.session_id,
      user_id: session.userId,
      user_name: (() => {
        if (!session.user) return `User #${session.userId}`;
        const fName = (session.user.first_name || '').trim();
        const lName = (session.user.last_name || '').trim();
        if (!fName && !lName) return `User #${session.userId}`;
        const maskedFirst = fName.length <= 2
          ? (fName.charAt(0) || '*') + '*'.repeat(Math.max(1, fName.length - 1))
          : fName.substring(0, 2) + '*'.repeat(Math.max(1, fName.length - 2));
        const maskedLast = lName.length > 0
          ? lName.charAt(0) + '*'.repeat(Math.max(1, lName.length - 1))
          : '';
        return maskedLast ? `${maskedFirst} ${maskedLast}` : maskedFirst;
      })(),
      start_time: session.start_time,
      end_time: session.end_time,
      score: session.final_score,
      status: session.end_time ? 'COMPLETED' : 'IN_PROGRESS',
    }));

    return {
      item_bank: {
        id: bank.item_bank_id,
        name: bank.bank_name,
        created_at: bank.created_at,
        updated_at: bank.updated_at,
        duration: bank.duration,
        is_active: bank.is_active,
        categories: categories.map((c: any) => ({
          category_id: c.category_id,
          category_name: c.category_name,
        })),
      },
      stats: {
        total_items: totalItems,
        total_attempts: totalAttempts,
        completed_attempts: completedCount,
        average_score: Math.round(averageScore * 100) / 100,
        max_score: Math.round(maxScore * 100) / 100,
        min_score: Math.round(minScore * 100) / 100,
        pass_rate: Math.round(passRate * 100) / 100,
      },
      charts: { score_distribution: scoreDistribution },
      recent_activity: recentActivity,
    };
  }

  // ==================== Private Helpers ====================

  private isValidIRTItem(item: Item): boolean {
    if (
      item.irt_a_discrimination == null ||
      item.irt_b_difficulty == null ||
      item.irt_c_guessing == null
    ) {
      return false;
    }
    if (
      !isFinite(item.irt_a_discrimination) ||
      !isFinite(item.irt_b_difficulty) ||
      !isFinite(item.irt_c_guessing)
    ) {
      return false;
    }
    if (item.irt_a_discrimination <= 0) return false;
    if (item.irt_c_guessing < 0 || item.irt_c_guessing >= 1) return false;
    return true;
  }

  private getMissingIRTParams(item: Item): string[] {
    const missing: string[] = [];
    if (
      item.irt_a_discrimination == null ||
      !isFinite(item.irt_a_discrimination) ||
      item.irt_a_discrimination <= 0
    ) {
      missing.push('a (discrimination)');
    }
    if (item.irt_b_difficulty == null || !isFinite(item.irt_b_difficulty)) {
      missing.push('b (difficulty)');
    }
    if (
      item.irt_c_guessing == null ||
      !isFinite(item.irt_c_guessing) ||
      item.irt_c_guessing < 0 ||
      item.irt_c_guessing >= 1
    ) {
      missing.push('c (guessing)');
    }
    return missing;
  }
}
