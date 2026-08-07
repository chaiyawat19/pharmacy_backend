SELECT 
    COUNT(*) as total_items,
    COUNT(CASE WHEN irt_a_discrimination > 0 THEN 1 END) as has_a,
    COUNT(CASE WHEN irt_b_difficulty IS NOT NULL THEN 1 END) as has_b,
    COUNT(CASE WHEN irt_c_guessing IS NOT NULL THEN 1 END) as has_c,
    COUNT(CASE WHEN status = 'published' THEN 1 END) as published,
    COUNT(CASE WHEN irt_a_discrimination > 0 AND irt_b_difficulty IS NOT NULL AND irt_c_guessing IS NOT NULL AND status = 'published' THEN 1 END) as ready_for_cat
FROM items;
