import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
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
    // Keep uncalibrated items as null so administrators can calibrate them explicitly
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
      irt_a_discrimination: bbi.item.irt_a_discrimination ?? null,
      irt_b_difficulty: bbi.item.irt_b_difficulty ?? null,
      irt_c_guessing: bbi.item.irt_c_guessing ?? null,
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
      irt_a_discrimination?: number | null;
      irt_b_difficulty?: number | null;
      irt_c_guessing?: number | null;
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

        const a = update.irt_a_discrimination !== undefined ? update.irt_a_discrimination : item.irt_a_discrimination;
        const b = update.irt_b_difficulty !== undefined ? update.irt_b_difficulty : item.irt_b_difficulty;
        const c = update.irt_c_guessing !== undefined ? update.irt_c_guessing : item.irt_c_guessing;

        if (
          (a != null && a <= 0) ||
          (c != null && (c < 0 || c >= 1))
        ) {
          results.failed.push({ item_id: update.item_id, reason: 'IRT parameters ไม่ถูกต้อง' });
          continue;
        }

        await this.itemRepo.update(
          { item_id: update.item_id },
          {
            irt_a_discrimination: a,
            irt_b_difficulty: b,
            irt_c_guessing: c,
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

    const completedSessionsData = await this.examSessionRepo.find({
      where: {
        itemBankId: itemBankId,
        end_time: Not(IsNull()),
      },
    });
    const completedCount = completedSessionsData.length;

    let averageScore = 0;
    let maxScore = 0;
    let minScore = 0;
    let passCount = 0;

    const scoreDistribution = Array(10)
      .fill(0)
      .map((_, i) => ({ range: `${i * 10}-${(i + 1) * 10}%`, count: 0 }));

    if (completedCount > 0) {
      const scores = completedSessionsData
        .map((s) => (s.final_score != null ? Number(s.final_score) : null))
        .filter((s): s is number => s !== null && !isNaN(s));

      if (scores.length > 0) {
        const sumScore = scores.reduce((a, b) => a + b, 0);
        averageScore = sumScore / scores.length;
        maxScore = Math.max(...scores);
        minScore = Math.min(...scores);
        passCount = scores.filter((s) => s >= 50).length;
        scores.forEach((score) => {
          const index = Math.min(Math.floor(score / 10), 9);
          if (index >= 0 && index < 10) {
            scoreDistribution[index].count++;
          }
        });
      }
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
      where: {
        itemBankId,
        end_time: Not(IsNull()),
      },
      order: { end_time: 'DESC' },
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
        const fullName = [fName, lName].filter(Boolean).join(' ');
        return fullName || `User #${session.userId}`;
      })(),
      start_time: session.start_time,
      end_time: session.end_time,
      score: session.final_score != null ? Math.round(Number(session.final_score) * 100) / 100 : null,
      status: 'COMPLETED',
    }));

    return {
      item_bank: {
        id: bank.item_bank_id,
        name: bank.bank_name,
        description: bank.description,
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
    if (!item) return false;
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
    if (!item) return ['irt_a_discrimination', 'irt_b_difficulty', 'irt_c_guessing'];
    if (item.irt_a_discrimination == null || item.irt_a_discrimination <= 0) {
      missing.push('irt_a_discrimination');
    }
    if (item.irt_b_difficulty == null) {
      missing.push('irt_b_difficulty');
    }
    if (item.irt_c_guessing == null || item.irt_c_guessing < 0 || item.irt_c_guessing >= 1) {
      missing.push('irt_c_guessing');
    }
    return missing;
  }

  // ==================== Export & Calibration Methods ====================

  /**
   * ส่งออก Response Matrix (0/1 Matrix CSV) จากการทำข้อสอบปกติ
   */
  async exportResponseMatrix(itemBankId?: number) {
    const query = this.examSessionRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.user', 'user')
      .where('session.end_time IS NOT NULL')
      .andWhere("session.session_type = 'NORMAL'");

    if (itemBankId) {
      query.andWhere('session.itemBankId = :itemBankId', { itemBankId });
    }

    const sessions = await query.orderBy('session.session_id', 'ASC').getMany();

    // ดึง items ทั้งหมดที่อยู่ใน itemBankId (หรือทั้งหมด)
    let itemBankItemsQuery = this.itemBankItemRepo
      .createQueryBuilder('bbi')
      .leftJoinAndSelect('bbi.item', 'item')
      .leftJoinAndSelect('bbi.item_bank', 'item_bank');

    if (itemBankId) {
      itemBankItemsQuery = itemBankItemsQuery.where('bbi.item_bank_id = :itemBankId', { itemBankId });
    }

    const itemBankItems = await itemBankItemsQuery
      .orderBy('bbi.item_bank_id', 'ASC')
      .addOrderBy('bbi.display_order', 'ASC')
      .getMany();

    // Deduplicate item ids in order
    const orderedItemIds: number[] = [];
    const itemMap = new Map<number, any>();
    for (const bbi of itemBankItems) {
      if (bbi.item && !itemMap.has(bbi.item.item_id)) {
        itemMap.set(bbi.item.item_id, bbi.item);
        orderedItemIds.push(bbi.item.item_id);
      }
    }

    // Build header: session_id, user_id, user_email, item_bank_id, total_score, submitted_at, item_<id1>, item_<id2>, ...
    const itemHeaders = orderedItemIds.map((id) => `item_${id}`);
    const headers = [
      'session_id',
      'user_id',
      'user_email',
      'item_bank_id',
      'total_score',
      'submitted_at',
      ...itemHeaders,
    ];

    const rows: string[] = [headers.join(',')];
    const matrixData: any[] = [];

    for (const session of sessions) {
      const respMap = new Map<number, number>(); // item_id -> 1 | 0
      let responses = session.responses;
      if (typeof responses === 'string') {
        try {
          responses = JSON.parse(responses);
        } catch {
          responses = [];
        }
      }
      if (Array.isArray(responses)) {
        for (const resp of responses) {
          if (resp && resp.item_id != null) {
            respMap.set(Number(resp.item_id), resp.is_correct ? 1 : 0);
          }
        }
      }

      const itemValues = orderedItemIds.map((id) => {
        if (respMap.has(id)) {
          return respMap.get(id)!.toString();
        }
        return 'NA';
      });

      const submittedAtStr = session.end_time
        ? `"${new Date(session.end_time).toISOString()}"`
        : '';

      const row = [
        session.session_id,
        session.userId,
        `"${(session.user?.email || '').replace(/"/g, '""')}"`,
        session.itemBankId || '',
        session.final_score ?? '',
        submittedAtStr,
        ...itemValues,
      ];
      rows.push(row.join(','));

      const sessionObj: any = {
        session_id: session.session_id,
        user_id: session.userId,
        user_email: session.user?.email,
        item_bank_id: session.itemBankId,
        total_score: session.final_score,
        submitted_at: session.end_time,
        responses: {},
      };
      orderedItemIds.forEach((id) => {
        sessionObj.responses[`item_${id}`] = respMap.has(id) ? respMap.get(id) : null;
      });
      matrixData.push(sessionObj);
    }

    return {
      csv: rows.join('\n'),
      total_sessions: sessions.length,
      total_items: orderedItemIds.length,
      item_ids: orderedItemIds,
      matrix: matrixData,
    };
  }

  /**
   * คำนวณสถิติ CTT และค่าประมาณการ IRT (a, b, c) จากประวัติการสอบจริง
   */
  async getAutoCalibrationStats(itemBankId?: number) {
    const query = this.examSessionRepo
      .createQueryBuilder('session')
      .where('session.end_time IS NOT NULL')
      .andWhere("session.session_type = 'NORMAL'");

    if (itemBankId) {
      query.andWhere('session.itemBankId = :itemBankId', { itemBankId });
    }

    const sessions = await query.getMany();

    // ดึง items
    let itemBankItemsQuery = this.itemBankItemRepo
      .createQueryBuilder('bbi')
      .leftJoinAndSelect('bbi.item', 'item')
      .leftJoinAndSelect('bbi.item_bank', 'item_bank');

    if (itemBankId) {
      itemBankItemsQuery = itemBankItemsQuery.where('bbi.item_bank_id = :itemBankId', { itemBankId });
    }

    const itemBankItems = await itemBankItemsQuery
      .orderBy('bbi.item_bank_id', 'ASC')
      .addOrderBy('bbi.display_order', 'ASC')
      .getMany();

    // เก็บข้อมูลคะแนนรวมของผู้สอบทุกคน
    const sessionScores: number[] = sessions.map((s) => Number(s.final_score || 0));
    const meanTotalScore =
      sessionScores.length > 0
        ? sessionScores.reduce((acc, v) => acc + v, 0) / sessionScores.length
        : 50;

    const stdTotalScore =
      sessionScores.length > 1
        ? Math.sqrt(
            sessionScores.reduce((acc, v) => acc + Math.pow(v - meanTotalScore, 2), 0) /
              (sessionScores.length - 1),
          )
        : 15;

    // สำหรับแต่ละข้อ รวบรวม responses
    const itemStatsMap = new Map<
      number,
      {
        totalAttempts: number;
        correctAttempts: number;
        correctScores: number[];
      }
    >();

    for (const session of sessions) {
      let responses = session.responses;
      if (typeof responses === 'string') {
        try {
          responses = JSON.parse(responses);
        } catch {
          responses = [];
        }
      }
      if (Array.isArray(responses)) {
        for (const resp of responses) {
          if (!resp || resp.item_id == null) continue;
          const itemId = Number(resp.item_id);
          if (!itemStatsMap.has(itemId)) {
            itemStatsMap.set(itemId, {
              totalAttempts: 0,
              correctAttempts: 0,
              correctScores: [],
            });
          }
          const stat = itemStatsMap.get(itemId)!;
          stat.totalAttempts++;
          if (resp.is_correct) {
            stat.correctAttempts++;
            stat.correctScores.push(Number(session.final_score || 0));
          }
        }
      }
    }

    const itemsResults: any[] = [];

    for (const bbi of itemBankItems) {
      if (!bbi.item) continue;
      const item = bbi.item;
      const stat = itemStatsMap.get(item.item_id) || {
        totalAttempts: 0,
        correctAttempts: 0,
        correctScores: [],
      };

      const N = stat.totalAttempts;
      const R = stat.correctAttempts;
      const p = N > 0 ? R / N : 0.5; // p-value (difficulty)

      // Point-Biserial Correlation (r_pb)
      let r_pb = 0.3;
      if (N >= 5 && R > 0 && R < N && stdTotalScore > 0) {
        const meanCorrect = stat.correctScores.reduce((a, b) => a + b, 0) / R;
        r_pb = ((meanCorrect - meanTotalScore) / stdTotalScore) * Math.sqrt(p * (1 - p));
        r_pb = Math.max(-0.99, Math.min(0.99, r_pb));
      }

      // IRT Estimation (CTT to IRT Approximation)
      const clampedP = Math.max(0.02, Math.min(0.98, p));
      let estimated_b = Math.log((1 - clampedP) / clampedP);
      estimated_b = Math.round(Math.max(-3.5, Math.min(3.5, estimated_b)) * 100) / 100;

      let estimated_a = 1.0;
      if (r_pb > 0.05) {
        const denom = Math.sqrt(Math.max(0.05, 1 - Math.pow(r_pb, 2)));
        estimated_a = (1.7 * r_pb) / denom;
        estimated_a = Math.round(Math.max(0.3, Math.min(2.5, estimated_a)) * 100) / 100;
      } else if (r_pb <= 0) {
        estimated_a = 0.4;
      }

      const estimated_c = 0.20;

      itemsResults.push({
        item_id: item.item_id,
        question_text: item.question_text,
        item_bank_id: bbi.item_bank_id,
        bank_name: bbi.item_bank?.bank_name,
        attempts: N,
        correct_count: R,
        p_value: Math.round(p * 1000) / 1000,
        r_pb: Math.round(r_pb * 1000) / 1000,
        current_a: item.irt_a_discrimination ?? null,
        current_b: item.irt_b_difficulty ?? null,
        current_c: item.irt_c_guessing ?? null,
        estimated_a,
        estimated_b,
        estimated_c,
        data_quality: N >= 30 ? 'HIGH' : N >= 10 ? 'MEDIUM' : N > 0 ? 'LOW' : 'NO_DATA',
      });
    }

    return {
      total_sessions: sessions.length,
      total_items: itemsResults.length,
      items: itemsResults,
    };
  }

  /**
   * นำเข้าและอัปเดต IRT parameters จากไฟล์ Calibrated CSV/JSON
   */
  async importCalibratedIRT(updates: Array<{
    item_id: number;
    irt_a_discrimination?: number | null;
    irt_b_difficulty?: number | null;
    irt_c_guessing?: number | null;
  }>) {
    return this.batchUpdateIRTParameters({ updates });
  }
}

