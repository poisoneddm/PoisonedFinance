INSERT INTO users (id, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'owner@poisonedfinance.local')
ON CONFLICT (id) DO NOTHING;
