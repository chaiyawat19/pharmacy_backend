import { MSTRoutingService } from './mst-routing.service';
import { Item } from '../items-bank/entities/items.entity';

describe('MSTRoutingService', () => {
    let service: MSTRoutingService;

    beforeEach(() => {
        service = new MSTRoutingService();
    });

    describe('determineNextDifficulty', () => {
        it('should route Stage 1 to hard when theta >= 0.5', () => {
            const result = service.determineNextDifficulty(0.65, 1, 'medium');
            expect(result).toBe('hard');
        });

        it('should route Stage 1 to easy when theta <= -0.5', () => {
            const result = service.determineNextDifficulty(-0.75, 1, 'medium');
            expect(result).toBe('easy');
        });

        it('should route Stage 1 to medium when theta is between -0.5 and 0.5', () => {
            const result = service.determineNextDifficulty(0.1, 1, 'medium');
            expect(result).toBe('medium');
        });

        it('should route Stage 2 in 3-stage model appropriately', () => {
            // From Hard stage with high theta
            expect(service.determineNextDifficulty(1.2, 2, 'hard')).toBe('hard');
            // From Hard stage with dropped theta
            expect(service.determineNextDifficulty(0.4, 2, 'hard')).toBe('medium');
            // From Easy stage with very low theta
            expect(service.determineNextDifficulty(-1.0, 2, 'easy')).toBe('easy');
            // From Easy stage with improved theta
            expect(service.determineNextDifficulty(-0.2, 2, 'easy')).toBe('medium');
        });
    });

    describe('assembleStageItems', () => {
        const mockItems: Item[] = [
            // Standalone Easy Items
            {
                item_id: 1,
                question_text: 'Easy 1',
                irt_a_discrimination: 1.0,
                irt_b_difficulty: -1.2,
                irt_c_guessing: 0.2,
                situation_id: null,
            } as Item,
            {
                item_id: 2,
                question_text: 'Easy 2',
                irt_a_discrimination: 1.1,
                irt_b_difficulty: -0.9,
                irt_c_guessing: 0.2,
                situation_id: null,
            } as Item,
            // Standalone Medium Items
            {
                item_id: 3,
                question_text: 'Med 1',
                irt_a_discrimination: 1.2,
                irt_b_difficulty: 0.0,
                irt_c_guessing: 0.2,
                situation_id: null,
            } as Item,
            {
                item_id: 4,
                question_text: 'Med 2',
                irt_a_discrimination: 0.9,
                irt_b_difficulty: 0.1,
                irt_c_guessing: 0.2,
                situation_id: null,
            } as Item,
            // Standalone Hard Items
            {
                item_id: 5,
                question_text: 'Hard 1',
                irt_a_discrimination: 1.5,
                irt_b_difficulty: 1.2,
                irt_c_guessing: 0.2,
                situation_id: null,
            } as Item,
            // Situation Testlet (Sit ID: 100 with 2 sub-items)
            {
                item_id: 10,
                question_text: 'Situation Sub 1',
                irt_a_discrimination: 1.0,
                irt_b_difficulty: 0.1,
                irt_c_guessing: 0.2,
                situation_id: 100,
                situation: { situation_id: 100, situation_text: 'Case text' } as any,
            } as Item,
            {
                item_id: 11,
                question_text: 'Situation Sub 2',
                irt_a_discrimination: 1.1,
                irt_b_difficulty: 0.2,
                irt_c_guessing: 0.2,
                situation_id: 100,
                situation: { situation_id: 100, situation_text: 'Case text' } as any,
            } as Item,
        ];

        it('should assemble stage targeting Medium difficulty and bundle situations together', () => {
            const usedIds = new Set<number>();
            const result = service.assembleStageItems(mockItems, usedIds, 'medium', 4);

            expect(result.items.length).toBeGreaterThanOrEqual(1);
            expect(result.difficulty_level).toBe('medium');

            // If a situation item is included, its sister item in the same situation must also be included
            const hasSub1 = result.item_ids.includes(10);
            const hasSub2 = result.item_ids.includes(11);
            if (hasSub1 || hasSub2) {
                expect(hasSub1 && hasSub2).toBe(true);
            }
        });

        it('should not include previously used items', () => {
            const usedIds = new Set<number>([1, 2, 3, 4, 5]);
            const result = service.assembleStageItems(mockItems, usedIds, 'medium', 2);

            expect(result.item_ids).not.toContain(1);
            expect(result.item_ids).not.toContain(2);
            expect(result.item_ids).not.toContain(3);
            expect(result.item_ids).not.toContain(4);
            expect(result.item_ids).not.toContain(5);
            expect(result.item_ids).toContain(10);
            expect(result.item_ids).toContain(11);
        });

        it('should return empty items when all items are used', () => {
            const usedIds = new Set<number>([1, 2, 3, 4, 5, 10, 11]);
            const result = service.assembleStageItems(mockItems, usedIds, 'medium', 4);

            expect(result.items).toHaveLength(0);
            expect(result.item_ids).toHaveLength(0);
        });
    });
});
