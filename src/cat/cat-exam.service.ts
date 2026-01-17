import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CATSession } from './entities/cat-session.entity';
import { IRTService, IRTResponse } from './irt.service';
import { CATService } from './cat.service';
import { StartCATExamDto, SubmitCATAnswerDto } from './dto/cat-exam.dto';
import { ItemsBank } from '../items-bank/entities/items-bank.entity';
import { ItemBankItem } from '../items-bank/entities/item_bank_items.entity';
import { Item } from '../items-bank/entities/items.entity';
import { AnswerOption } from '../items-bank/entities/answer_options.entity';

@Injectable()
export class CATExamService {
    constructor(
        @InjectRepository(CATSession)
        private readonly catSessionRepo: Repository<CATSession>,
        @InjectRepository(ItemsBank)
        private readonly itemsBankRepo: Repository<ItemsBank>,
        @InjectRepository(ItemBankItem)
        private readonly itemBankItemRepo: Repository<ItemBankItem>,
        @InjectRepository(Item)
        private readonly itemRepo: Repository<Item>,
        @InjectRepository(AnswerOption)
        private readonly answerOptionRepo: Repository<AnswerOption>,
        private readonly irtService: IRTService,
        private readonly catService: CATService,
    ) { }

    /**
     * เริ่มการสอบ CAT
     */
    async startCATExam(userId: number, startExamDto: StartCATExamDto) {
        const { item_bank_id, min_items, max_items, target_se, cut_score, mode } =
            startExamDto;

        // ตรวจสอบว่า item bank มีอยู่จริง
        const itemBank = await this.itemsBankRepo.findOne({
            where: { item_bank_id },
        });
        if (!itemBank) {
            throw new NotFoundException(`ไม่พบคลังข้อสอบ ID ${item_bank_id}`);
        }

        // ตรวจสอบว่า item bank พร้อมสำหรับ CAT (มีข้อสอบที่มี IRT parameters ครบ)
        const minItemsRequired = min_items || 20;
        await this.validateItemBankForCAT(item_bank_id, minItemsRequired);

        // สร้าง CAT session ใหม่
        const session = this.catSessionRepo.create({
            user_id: userId,
            item_bank_id: item_bank_id,
            current_theta: 0.0,
            current_se: 999.0,
            num_items: 0,
            num_correct: 0,
            status: 'IN_PROGRESS',
            used_item_ids: [],
            responses: [],
            min_items: minItemsRequired,
            max_items: max_items || 50,
            target_se: target_se || 0.35,
            cut_score: cut_score || 0.0,
            mode: mode || 'real',
        });

        const savedSession = await this.catSessionRepo.save(session);

        // เลือกข้อแรก
        const firstItem = await this.selectFirstItemForSession(savedSession);

        if (!firstItem) {
            throw new NotFoundException('ไม่มีข้อสอบในคลัง');
        }

        // อัพเดท session ด้วยข้อแรก
        savedSession.current_item_id = firstItem.item_id;
        savedSession.used_item_ids = [firstItem.item_id];
        await this.catSessionRepo.save(savedSession);

        return {
            message: 'เริ่มการสอบ CAT สำเร็จ',
            session_id: savedSession.session_id,
            item_bank_id: savedSession.item_bank_id,
            current_item: firstItem,
            current_theta: savedSession.current_theta,
            current_se: savedSession.current_se,
            num_items: savedSession.num_items,
            start_time: savedSession.start_time,
        };
    }

    /**
     * เลือกข้อแรกสำหรับ session
     */
    private async selectFirstItemForSession(session: CATSession) {
        const itemBank = await this.getItemBankItems(session.item_bank_id);
        const usedItemIds = new Set<number>(session.used_item_ids || []);
        const firstItem = this.catService.selectFirstItem(itemBank, usedItemIds);

        if (!firstItem) return null;

        // โหลด answer options
        const answerOptions = await this.answerOptionRepo.find({
            where: { item_id: firstItem.item_id },
            order: { option_id: 'ASC' },
        });

        return {
            ...firstItem,
            answer_options: answerOptions,
        };
    }

    /**
     * ดึงคลังข้อสอบทั้งหมด และ Filter เฉพาะข้อที่มี IRT parameters ครบ
     */
    private async getItemBankItems(itemBankId: number) {
        const itemBankItems = await this.itemBankItemRepo.find({
            where: { item_bank_id: itemBankId },
            relations: ['item'],
            order: { display_order: 'ASC' },
        });

        // Filter เฉพาะข้อที่มี IRT parameters ครบและถูกต้อง
        const validItems = itemBankItems
            .map((bbi) => bbi.item)
            .filter((item) => this.isValidIRTItem(item));

        return validItems;
    }

    /**
     * ตรวจสอบว่าข้อสอบมี IRT parameters ครบและถูกต้อง
     */
    private isValidIRTItem(item: Item): boolean {
        // ตรวจสอบว่ามีค่า IRT parameters ทั้ง 3 ตัว
        if (
            item.irt_a_discrimination == null ||
            item.irt_b_difficulty == null ||
            item.irt_c_guessing == null
        ) {
            return false;
        }

        // ตรวจสอบว่าค่าไม่เป็น NaN หรือ Infinity
        if (
            !isFinite(item.irt_a_discrimination) ||
            !isFinite(item.irt_b_difficulty) ||
            !isFinite(item.irt_c_guessing)
        ) {
            return false;
        }

        // ตรวจสอบว่าค่าอยู่ในช่วงที่เหมาะสม
        // a (discrimination): ควรมากกว่า 0 (โดยทั่วไป 0.5-2.5)
        // b (difficulty): ควรอยู่ระหว่าง -4 ถึง 4
        // c (guessing): ควรอยู่ระหว่าง 0 ถึง 1
        if (item.irt_a_discrimination <= 0) {
            return false;
        }

        if (item.irt_c_guessing < 0 || item.irt_c_guessing >= 1) {
            return false;
        }

        return true;
    }

    /**
     * ตรวจสอบว่า item bank พร้อมสำหรับ CAT หรือไม่
     */
    private async validateItemBankForCAT(itemBankId: number, minItems: number) {
        const validItems = await this.getItemBankItems(itemBankId);

        if (validItems.length === 0) {
            throw new NotFoundException(
                `คลังข้อสอบนี้ไม่มีข้อสอบที่มี IRT parameters (a, b, c) ครบ ไม่สามารถใช้กับระบบ CAT ได้`,
            );
        }

        if (validItems.length < minItems) {
            throw new NotFoundException(
                `คลังข้อสอบนี้มีข้อสอบที่ระบุ IRT parameters ครบเพียง ${validItems.length} ข้อ ` +
                `ไม่เพียงพอสำหรับ CAT (ต้องการอย่างน้อย ${minItems} ข้อ)`,
            );
        }

        return validItems;
    }

    /**
     * รับข้อสอบข้อถัดไป
     */
    async getNextItem(userId: number, sessionId: number) {
        const session = await this.catSessionRepo.findOne({
            where: { session_id: sessionId, user_id: userId },
        });

        if (!session) {
            throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
        }

        if (session.status !== 'IN_PROGRESS') {
            throw new NotFoundException('Session นี้จบแล้ว');
        }

        // ดึงข้อปัจจุบัน
        const currentItem = await this.itemRepo.findOne({
            where: { item_id: session.current_item_id },
        });

        if (!currentItem) {
            throw new NotFoundException('ไม่พบข้อสอบ');
        }

        const answerOptions = await this.answerOptionRepo.find({
            where: { item_id: currentItem.item_id },
            order: { option_id: 'ASC' },
        });

        return {
            session_id: session.session_id,
            current_item: {
                ...currentItem,
                answer_options: answerOptions,
            },
            current_theta: session.current_theta,
            current_se: session.current_se,
            num_items: session.num_items,
            min_items: session.min_items,
            max_items: session.max_items,
        };
    }

    /**
     * ส่งคำตอบและเลือกข้อถัดไป
     */
    async submitAnswer(userId: number, submitAnswerDto: SubmitCATAnswerDto) {
        const { session_id, item_id, selected_option_id, response_time_ms } =
            submitAnswerDto;

        const session = await this.catSessionRepo.findOne({
            where: { session_id, user_id: userId },
        });

        if (!session) {
            throw new NotFoundException(`ไม่พบ session ID ${session_id}`);
        }

        if (session.status !== 'IN_PROGRESS') {
            throw new NotFoundException('Session นี้จบแล้ว');
        }

        // ดึงข้อมูลข้อสอบ
        const item = await this.itemRepo.findOne({ where: { item_id } });
        if (!item) {
            throw new NotFoundException(`ไม่พบข้อสอบ ID ${item_id}`);
        }

        // ตรวจสอบคำตอบ
        const correctOption = await this.answerOptionRepo.findOne({
            where: { item_id, is_correct: true },
        });

        const isCorrect = selected_option_id === correctOption?.option_id;

        // บันทึก response
        const response = {
            item_id,
            selected_option_id,
            is_correct: isCorrect,
            response_time_ms: response_time_ms || 0,
            theta_before: session.current_theta,
            timestamp: new Date(),
        };

        const responses = [...(session.responses || []), response];

        // อัพเดทจำนวนข้อและคะแนน
        session.num_items += 1;
        if (isCorrect) session.num_correct += 1;

        // ประมาณค่า theta ใหม่ (ใช้เฉพาะ responses ที่มี IRT params ครบ)
        const irtResponses: IRTResponse[] = responses
            .filter((r) => {
                const respItem = responses.find((resp) => resp.item_id === r.item_id);
                return (
                    respItem &&
                    item.irt_a_discrimination != null &&
                    item.irt_b_difficulty != null &&
                    item.irt_c_guessing != null
                );
            })
            .map((r) => ({
                item: {
                    a: item.irt_a_discrimination!,
                    b: item.irt_b_difficulty!,
                    c: item.irt_c_guessing!,
                },
                isCorrect: r.is_correct,
            }));

        const estimation = this.irtService.estimateThetaEAP(irtResponses);
        session.current_theta = estimation.theta;
        session.current_se = estimation.se;

        // อัพเดท response ด้วย theta หลังตอบ
        response['theta_after'] = session.current_theta;
        response['se_after'] = session.current_se;

        session.responses = responses;

        // ตรวจสอบเงื่อนไขหยุด
        const stoppingRule = this.catService.checkStoppingRule(
            session.current_theta,
            session.current_se,
            session.num_items,
            {
                minItems: session.min_items,
                maxItems: session.max_items,
                targetSE: session.target_se,
                cutScore: session.cut_score,
            },
        );

        if (stoppingRule.shouldStop) {
            // จบการสอบ
            session.status = 'COMPLETED';
            session.end_time = new Date();
            session.final_theta = session.current_theta;
            session.final_se = session.current_se;
            session.passed = this.catService.makeDecision(
                session.final_theta,
                session.cut_score,
            );
            session.stop_reason = stoppingRule.reason;
            session.current_item_id = undefined;

            await this.catSessionRepo.save(session);

            return {
                message: 'จบการสอบ',
                finished: true,
                session_id: session.session_id,
                final_theta: session.final_theta,
                final_se: session.final_se,
                num_items: session.num_items,
                num_correct: session.num_correct,
                passed: session.passed,
                stop_reason: session.stop_reason,
            };
        } else {
            // เลือกข้อถัดไป
            const itemBank = await this.getItemBankItems(session.item_bank_id);
            const usedItemIds = new Set<number>(session.used_item_ids);
            const nextItem = this.catService.selectNextItem(
                session.current_theta,
                itemBank,
                usedItemIds,
            );

            if (!nextItem) {
                // ไม่มีข้อเหลือ ต้องจบ
                session.status = 'COMPLETED';
                session.end_time = new Date();
                session.final_theta = session.current_theta;
                session.final_se = session.current_se;
                session.passed = this.catService.makeDecision(
                    session.final_theta,
                    session.cut_score,
                );
                session.stop_reason = 'ไม่มีข้อสอบเหลือในคลัง';
                session.current_item_id = undefined;

                await this.catSessionRepo.save(session);

                return {
                    message: 'จบการสอบ (ไม่มีข้อเหลือ)',
                    finished: true,
                    session_id: session.session_id,
                    final_theta: session.final_theta,
                    final_se: session.final_se,
                    num_items: session.num_items,
                    num_correct: session.num_correct,
                    passed: session.passed,
                    stop_reason: session.stop_reason,
                };
            }

            // อัพเดท session
            session.current_item_id = nextItem.item_id;
            session.used_item_ids = [...usedItemIds, nextItem.item_id];
            await this.catSessionRepo.save(session);

            // โหลด answer options
            const answerOptions = await this.answerOptionRepo.find({
                where: { item_id: nextItem.item_id },
                order: { option_id: 'ASC' },
            });

            return {
                message: 'ส่งคำตอบสำเร็จ',
                finished: false,
                is_correct: isCorrect,
                session_id: session.session_id,
                current_theta: session.current_theta,
                current_se: session.current_se,
                num_items: session.num_items,
                next_item: {
                    ...nextItem,
                    answer_options: answerOptions,
                },
            };
        }
    }

    /**
     * ดูผลการสอบ
     */
    async getExamResult(userId: number, sessionId: number) {
        const session = await this.catSessionRepo.findOne({
            where: { session_id: sessionId, user_id: userId },
        });

        if (!session) {
            throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
        }

        const itemBank = await this.itemsBankRepo.findOne({
            where: { item_bank_id: session.item_bank_id },
        });

        return {
            session_id: session.session_id,
            item_bank_name: itemBank?.bank_name,
            status: session.status,
            start_time: session.start_time,
            end_time: session.end_time,
            current_theta: session.current_theta,
            current_se: session.current_se,
            final_theta: session.final_theta,
            final_se: session.final_se,
            num_items: session.num_items,
            num_correct: session.num_correct,
            passed: session.passed,
            stop_reason: session.stop_reason,
            responses: session.responses,
            pass_percentile: session.final_theta
                ? this.catService.calculatePassPercentile(session.final_theta)
                : null,
        };
    }

    /**
     * ดูประวัติการสอบ CAT
     */
    async getUserCATHistory(userId: number) {
        const sessions = await this.catSessionRepo.find({
            where: { user_id: userId },
            order: { start_time: 'DESC' },
        });

        return Promise.all(
            sessions.map(async (session) => {
                const itemBank = await this.itemsBankRepo.findOne({
                    where: { item_bank_id: session.item_bank_id },
                });

                return {
                    session_id: session.session_id,
                    item_bank_id: session.item_bank_id,
                    item_bank_name: itemBank?.bank_name,
                    status: session.status,
                    start_time: session.start_time,
                    end_time: session.end_time,
                    final_theta: session.final_theta,
                    num_items: session.num_items,
                    num_correct: session.num_correct,
                    passed: session.passed,
                };
            }),
        );
    }

    /**
     * ดูข้อมูล session ปัจจุบัน
     */
    async getCATSession(userId: number, sessionId: number) {
        const session = await this.catSessionRepo.findOne({
            where: { session_id: sessionId, user_id: userId },
        });

        if (!session) {
            throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
        }

        return session;
    }

    /**
     * ตรวจสอบว่า item bank พร้อมสำหรับ CAT หรือไม่
     */
    async checkCATReadiness(itemBankId: number) {
        // ตรวจสอบว่า item bank มีอยู่จริง
        const itemBank = await this.itemsBankRepo.findOne({
            where: { item_bank_id: itemBankId },
        });

        if (!itemBank) {
            throw new NotFoundException(`ไม่พบคลังข้อสอบ ID ${itemBankId}`);
        }

        // นับจำนวนข้อสอบทั้งหมด
        const allItems = await this.itemBankItemRepo.find({
            where: { item_bank_id: itemBankId },
            relations: ['item'],
        });

        const totalItems = allItems.length;

        // Filter ข้อที่มี IRT parameters ครบ
        const validItems = allItems
            .map((bbi) => bbi.item)
            .filter((item) => this.isValidIRTItem(item));

        const validItemsCount = validItems.length;
        const invalidItemsCount = totalItems - validItemsCount;

        // คำนวณเปอร์เซ็นต์
        const readinessPercentage = totalItems > 0
            ? Math.round((validItemsCount / totalItems) * 100)
            : 0;

        // ตรวจสอบว่าพร้อมใช้หรือไม่
        const MIN_ITEMS_FOR_CAT = 20;
        const isReady = validItemsCount >= MIN_ITEMS_FOR_CAT;

        // หาข้อที่ยังไม่มี IRT parameters (สำหรับแจ้งเตือน)
        const itemsWithoutIRT = allItems
            .map((bbi) => bbi.item)
            .filter((item) => !this.isValidIRTItem(item))
            .map((item) => ({
                item_id: item.item_id,
                question_text: item.question_text?.substring(0, 50) + '...',
                missing_params: this.getMissingIRTParams(item),
            }))
            .slice(0, 10); // แสดงแค่ 10 ข้อแรก

        return {
            item_bank_id: itemBankId,
            item_bank_name: itemBank.bank_name,
            is_ready: isReady,
            total_items: totalItems,
            valid_items: validItemsCount,
            invalid_items: invalidItemsCount,
            readiness_percentage: readinessPercentage,
            min_items_required: MIN_ITEMS_FOR_CAT,
            message: isReady
                ? `✅ คลังข้อสอบพร้อมใช้กับ CAT (มีข้อสอบที่มี IRT parameters ครบ ${validItemsCount} ข้อ)`
                : `❌ คลังข้อสอบยังไม่พร้อมใช้กับ CAT (มีข้อสอบที่มี IRT parameters ครบเพียง ${validItemsCount}/${MIN_ITEMS_FOR_CAT} ข้อ)`,
            items_without_irt: itemsWithoutIRT,
        };
    }

    /**
     * หา IRT parameters ที่หายไป
     */
    private getMissingIRTParams(item: Item): string[] {
        const missing: string[] = [];

        if (item.irt_a_discrimination == null || !isFinite(item.irt_a_discrimination) || item.irt_a_discrimination <= 0) {
            missing.push('a (discrimination)');
        }
        if (item.irt_b_difficulty == null || !isFinite(item.irt_b_difficulty)) {
            missing.push('b (difficulty)');
        }
        if (item.irt_c_guessing == null || !isFinite(item.irt_c_guessing) || item.irt_c_guessing < 0 || item.irt_c_guessing >= 1) {
            missing.push('c (guessing)');
        }

        return missing;
    }
}
