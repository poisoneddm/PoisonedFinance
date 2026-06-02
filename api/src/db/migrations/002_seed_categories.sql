INSERT INTO categories (name, meta_bucket, color_hex) VALUES
  ('Groceries',         'needs',   '#60a5fa'),
  ('Transport',         'needs',   '#bfdbfe'),
  ('Fuel',              'needs',   '#dbeafe'),
  ('Bills & Utilities', 'needs',   '#93c5fd'),
  ('Health',            'needs',   '#a5f3fc'),
  ('Eating Out',        'wants',   '#f472b6'),
  ('Shopping',          'wants',   '#c084fc'),
  ('Subscriptions',     'wants',   '#fbcfe8'),
  ('Entertainment',     'wants',   '#fce7f3'),
  ('Travel',            'wants',   '#99f6e4'),
  ('Savings',           'savings', '#4ade80')
ON CONFLICT (name) DO NOTHING;
