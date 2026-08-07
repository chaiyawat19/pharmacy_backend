SELECT 
    status, 
    COUNT(*) as count
FROM items
GROUP BY status;
