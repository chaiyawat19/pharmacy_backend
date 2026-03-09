import { Injectable } from '@nestjs/common';
import { IRTService, IRTItem } from './irt.service';

export interface CATOptions {
    minItems?: number;
    maxItems?: number;
    targetSE?: number;
    cutScore?: number;
}

export interface StoppingRule {
    shouldStop: boolean;
    reason: string;
}

/**
 * CAT (Computerized Adaptive Testing) Service
 * จัดการการเลือกข้อสอบและตัดสินใจหยุดการทดสอบ
 */
@Injectable()
export class CATService {
    constructor(private readonly irtService: IRTService) { }

    /**
     * เลือกข้อแรก (ความยากปานกลาง)
     */
    selectFirstItem(itemBank: any[], usedItemIds: Set<number>): any | null {
        const candidates = itemBank.filter(
            (item) =>
                !usedItemIds.has(item.item_id) &&
                Math.abs(item.irt_b_difficulty) < 0.5,
        );

        if (candidates.length === 0) {
            // ถ้าไม่มีให้เลือกข้อแรกที่ยังไม่ใช้
            const available = itemBank.filter(
                (item) => !usedItemIds.has(item.item_id),
            );
            if (available.length === 0) return null;
            return available[Math.floor(Math.random() * available.length)];
        }

        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    /**
     * เลือกข้อถัดไป ด้วย a-Stratified Maximum Fisher Information
     *
     * CATsim standard: แบ่งข้อสอบเป็น strata ตาม discrimination (a)
     * ช่วงแรก → ใช้ข้อ a ต่ำ  (stratum 1)
     * ช่วงกลาง → ใช้ข้อ a กลาง (stratum 2)
     * ช่วงท้าย → ใช้ข้อ a สูง  (stratum 3)
     * ภายในแต่ละ stratum เลือกข้อที่ให้ MFI สูงสุด ณ theta ปัจจุบัน
     */
    selectNextItem(
        currentTheta: number,
        itemBank: any[],
        usedItemIds: Set<number>,
        numAnsweredSoFar: number = 0,
        maxItems: number = 50,
    ): any | null {
        const eligibleItems = itemBank.filter(
            (item) => !usedItemIds.has(item.item_id),
        );

        if (eligibleItems.length === 0) {
            return null;
        }

        // ─── a-Stratified Exposure Control ────────────────────────────────
        const NUM_STRATA = 3;
        const progressRatio = maxItems > 0 ? numAnsweredSoFar / maxItems : 0;
        const currentStratum = Math.min(
            Math.floor(progressRatio * NUM_STRATA),
            NUM_STRATA - 1,
        );

        const aValues = [...eligibleItems]
            .map((i) => i.irt_a_discrimination)
            .sort((x, y) => x - y);
        const strataSize = Math.ceil(aValues.length / NUM_STRATA);
        const aMax =
            aValues[Math.min((currentStratum + 1) * strataSize - 1, aValues.length - 1)];

        let candidates = eligibleItems.filter(
            (item) => item.irt_a_discrimination <= aMax,
        );
        if (candidates.length === 0) candidates = eligibleItems;

        // ─── Maximum Fisher Information ภายใน stratum ────────────────────
        let bestItem: any = null;
        let maxInfo = -1;

        for (const item of candidates) {
            const irtItem: IRTItem = {
                a: item.irt_a_discrimination,
                b: item.irt_b_difficulty,
                c: item.irt_c_guessing,
            };
            const info = this.irtService.information(currentTheta, irtItem);
            if (info > maxInfo) {
                maxInfo = info;
                bestItem = item;
            }
        }

        return bestItem;
    }

    /**
     * ตรวจสอบเงื่อนไขหยุด
     */
    checkStoppingRule(
        currentTheta: number,
        currentSE: number,
        numItems: number,
        options: CATOptions,
    ): StoppingRule {
        const minItems = options.minItems || 20;
        const maxItems = options.maxItems || 50;
        const targetSE = options.targetSE || 0.35;
        const cutScore = options.cutScore || 0.0;

        // 1. ถึงจำนวนสูงสุด
        if (numItems >= maxItems) {
            return {
                shouldStop: true,
                reason: `ครบจำนวนข้อสูงสุด (${maxItems} ข้อ)`,
            };
        }

        // 2. ยังไม่ถึงขั้นต่ำ
        if (numItems < minItems) {
            return { shouldStop: false, reason: '' };
        }

        // 3. SE ต่ำกว่าเป้าหมาย
        if (currentSE <= targetSE) {
            return {
                shouldStop: true,
                reason: `SE ต่ำกว่าเป้าหมาย (${currentSE.toFixed(3)})`,
            };
        }

        // 4. Confidence-based stopping
        const zScore = 1.96; // 95% CI
        const margin = zScore * currentSE;
        const ciLower = currentTheta - margin;
        const ciUpper = currentTheta + margin;

        if (ciLower > cutScore) {
            return { shouldStop: true, reason: 'มั่นใจว่าสอบผ่าน' };
        } else if (ciUpper < cutScore) {
            return { shouldStop: true, reason: 'มั่นใจว่าสอบไม่ผ่าน' };
        }

        return { shouldStop: false, reason: '' };
    }

    /**
     * ตัดสินผลการสอบ
     */
    makeDecision(finalTheta: number, cutScore: number = 0.0): boolean {
        return finalTheta >= cutScore;
    }

    /**
     * คำนวณเปอร์เซ็นต์การผ่าน (สำหรับแสดงผล)
     */
    calculatePassPercentile(theta: number): number {
        // ใช้ Cumulative Distribution Function ของ Normal Distribution
        // Approximation: P(X ≤ x) สำหรับ μ=0, σ=1
        const z = theta;
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const d = 0.3989423 * Math.exp((-z * z) / 2);
        const p =
            d *
            t *
            (0.3193815 +
                t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

        return z > 0 ? (1 - p) * 100 : p * 100;
    }
}
