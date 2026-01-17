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
     * เลือกข้อถัดไป (Maximum Information)
     * @param currentTheta ความสามารถปัจจุบันของผู้สอบ
     * @param itemBank คลังข้อสอบทั้งหมด
     * @param usedItemIds ข้อที่ใช้ไปแล้ว
     */
    selectNextItem(
        currentTheta: number,
        itemBank: any[],
        usedItemIds: Set<number>,
    ): any | null {
        // หาข้อที่ยังไม่ได้ใช้
        const eligibleItems = itemBank.filter(
            (item) => !usedItemIds.has(item.item_id),
        );

        if (eligibleItems.length === 0) {
            return null;
        }

        // เลือกข้อที่ให้ Information สูงสุด
        let bestItem: any = null;
        let maxInfo = -1;

        for (const item of eligibleItems) {
            const irtItem: IRTItem = {
                a: item.irt_a_discrimination,
                b: item.irt_b_difficulty,
                c: item.irt_c_guessing,
            };

            const info = this.irtService.information(currentTheta, irtItem);
            const infoWithNoise = info * (0.95 + Math.random() * 0.1); // เพิ่ม randomization

            if (infoWithNoise > maxInfo) {
                maxInfo = infoWithNoise;
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
