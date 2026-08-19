import { Injectable } from '@nestjs/common';
import { Item } from '../items-bank/entities/items.entity';

export type MSTDifficultyLevel = 'easy' | 'medium' | 'hard';

export interface StageAssemblyResult {
    module_label: string;
    difficulty_level: MSTDifficultyLevel;
    items: Item[];
    item_ids: number[];
}

@Injectable()
export class MSTRoutingService {
    /**
     * ตัดสินใจเลือกระดับความยากของ Stage ถัดไปจากค่า Theta ปัจจุบัน
     */
    determineNextDifficulty(
        currentTheta: number,
        currentStage: number,
        previousDifficulty: MSTDifficultyLevel = 'medium',
    ): MSTDifficultyLevel {
        // เกณฑ์มาตรฐาน 1-3 Model (Routing Medium -> Easy / Medium / Hard)
        if (currentStage === 1) {
            if (currentTheta >= 0.5) {
                return 'hard';
            } else if (currentTheta <= -0.5) {
                return 'easy';
            } else {
                return 'medium';
            }
        }

        // กรณีเป็น 3-Stage Model (Stage 2 -> Stage 3)
        if (currentStage === 2) {
            if (previousDifficulty === 'hard') {
                return currentTheta >= 0.8 ? 'hard' : 'medium';
            } else if (previousDifficulty === 'easy') {
                return currentTheta <= -0.8 ? 'easy' : 'medium';
            } else {
                if (currentTheta >= 0.5) return 'hard';
                if (currentTheta <= -0.5) return 'easy';
                return 'medium';
            }
        }

        return 'medium';
    }

    /**
     * ประกอบข้อสอบ 1 Stage (รวมข้อเดี่ยว + ข้อสถานการณ์พร้อมข้อย่อย)
     * ตามเป้าหมายความยากที่กำหนด
     */
    assembleStageItems(
        availableItems: Item[],
        usedItemIds: Set<number>,
        targetDifficulty: MSTDifficultyLevel,
        targetCount: number = 12,
    ): StageAssemblyResult {
        // 1. กรองข้อที่ยังไม่เคยใช้ และมี IRT parameters ครบ
        const usableItems = availableItems.filter(
            (item) => !usedItemIds.has(item.item_id) && this.isValidIRTItem(item),
        );

        if (usableItems.length === 0) {
            return {
                module_label: `Stage (${targetDifficulty})`,
                difficulty_level: targetDifficulty,
                items: [],
                item_ids: [],
            };
        }

        // 2. จัดกลุ่มข้อสอบตาม Situation (Testlets) และ Standalone (ข้อเดี่ยว)
        const situationGroups = new Map<number, Item[]>();
        const standaloneItems: Item[] = [];

        for (const item of usableItems) {
            if (item.situation_id) {
                if (!situationGroups.has(item.situation_id)) {
                    situationGroups.set(item.situation_id, []);
                }
                situationGroups.get(item.situation_id)!.push(item);
            } else {
                standaloneItems.push(item);
            }
        }

        // 3. แปลงกลุ่มสถานการณ์เป็น Testlet Units (คำนวณความยากเฉลี่ยของกลุ่ม)
        interface TestletUnit {
            type: 'situation' | 'standalone';
            situation_id?: number;
            items: Item[];
            avg_b: number;
        }

        const units: TestletUnit[] = [];

        // เพิ่ม Situations
        for (const [sitId, items] of situationGroups.entries()) {
            const avgB =
                items.reduce((sum, it) => sum + (it.irt_b_difficulty ?? 0), 0) /
                items.length;
            units.push({
                type: 'situation',
                situation_id: sitId,
                items,
                avg_b: avgB,
            });
        }

        // เพิ่ม Standalone Items
        for (const item of standaloneItems) {
            units.push({
                type: 'standalone',
                items: [item],
                avg_b: item.irt_b_difficulty ?? 0,
            });
        }

        // 4. กรองและจัดลำดับ Units ให้ตรงกับเป้าหมายความยาก
        const targetB =
            targetDifficulty === 'hard'
                ? 1.0
                : targetDifficulty === 'easy'
                ? -1.0
                : 0.0;

        // สุ่มสับเปลี่ยนก่อนเพื่อไม่ให้ได้ข้อสอบชุดเดิมซ้ำๆ เสมอ
        const shuffledUnits = [...units].sort(() => Math.random() - 0.5);

        // จัดเรียงตามความใกล้เคียงกับ targetB
        shuffledUnits.sort(
            (u1, u2) => Math.abs(u1.avg_b - targetB) - Math.abs(u2.avg_b - targetB),
        );

        // 5. เลือก Units จนกว่าจะได้จำนวนข้อครบ targetCount
        const selectedItems: Item[] = [];

        for (const unit of shuffledUnits) {
            if (selectedItems.length >= targetCount) break;

            // ตรวจสอบว่าถ้าเพิ่ม unit นี้แล้วจำนวนข้อจะพอดีหรือเกินเพียงเล็กน้อย
            selectedItems.push(...unit.items);

            if (selectedItems.length >= targetCount) {
                break;
            }
        }

        // ถ้ายังได้ข้อไม่พอ ให้เติมข้อที่เหลือที่มีอยู่
        if (selectedItems.length < targetCount) {
            const alreadySelectedIds = new Set(selectedItems.map((i) => i.item_id));
            const remaining = usableItems.filter(
                (i) => !alreadySelectedIds.has(i.item_id),
            );
            for (const item of remaining) {
                if (selectedItems.length >= targetCount) break;
                selectedItems.push(item);
            }
        }

        const itemIds = selectedItems.map((i) => i.item_id);

        return {
            module_label: `Module (${targetDifficulty.toUpperCase()})`,
            difficulty_level: targetDifficulty,
            items: selectedItems,
            item_ids: itemIds,
        };
    }

    private isValidIRTItem(item: Item): boolean {
        return (
            item.irt_a_discrimination != null &&
            item.irt_a_discrimination > 0 &&
            item.irt_b_difficulty != null &&
            item.irt_c_guessing != null &&
            item.irt_c_guessing >= 0 &&
            item.irt_c_guessing < 1
        );
    }
}
