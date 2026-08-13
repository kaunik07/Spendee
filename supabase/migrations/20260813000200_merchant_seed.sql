-- Statement import — seed the global merchant map.
--
-- Data, not structure, which is why it's its own migration. Two reasons it
-- earns its place beyond convenience:
--   * a first import is mostly pre-categorized instead of a wall of "other",
--   * the whole pipeline can be exercised with the categorizer Worker switched
--     off entirely, because these rows answer without any model call.
--
-- Keys must be exactly what lib/statement/merchant.ts normalizeMerchant()
-- produces, or they will never match and the seed is dead weight. That is an
-- invariant a test asserts (every key here is a normalization fixed point),
-- not something to eyeball. In particular: uppercase, apostrophes deleted
-- rather than spaced (MCDONALDS, PEETS, TRADER JOES), '&' becomes a space
-- (AT T, H M, STOP SHOP, DAVE BUSTERS), and no store numbers or city/state.
--
-- ON CONFLICT DO NOTHING: never clobber a row the Worker or a user correction
-- already wrote. Re-running the seed is a no-op.

INSERT INTO public.merchant_categories (merchant_key, category, source, confidence) VALUES
  -- ── Food & drink: coffee, fast food, delivery ───────────
  ('STARBUCKS',            'food',          'seed', 1),
  ('DUNKIN',               'food',          'seed', 1),
  ('PEETS COFFEE',         'food',          'seed', 1),
  ('BLUE BOTTLE COFFEE',   'food',          'seed', 1),
  ('MCDONALDS',            'food',          'seed', 1),
  ('CHIPOTLE',             'food',          'seed', 1),
  ('SUBWAY',               'food',          'seed', 1),
  ('TACO BELL',            'food',          'seed', 1),
  ('WENDYS',               'food',          'seed', 1),
  ('BURGER KING',          'food',          'seed', 1),
  ('PANERA BREAD',         'food',          'seed', 1),
  ('SHAKE SHACK',          'food',          'seed', 1),
  ('FIVE GUYS',            'food',          'seed', 1),
  ('IN N OUT BURGER',      'food',          'seed', 1),
  ('CHICK FIL A',          'food',          'seed', 1),
  ('POPEYES',              'food',          'seed', 1),
  ('DOMINOS',              'food',          'seed', 1),
  ('PIZZA HUT',            'food',          'seed', 1),
  ('PANDA EXPRESS',        'food',          'seed', 1),
  ('SWEETGREEN',           'food',          'seed', 1),
  ('DOORDASH',             'food',          'seed', 1),
  ('UBER EATS',            'food',          'seed', 1),
  ('GRUBHUB',              'food',          'seed', 1),
  ('POSTMATES',            'food',          'seed', 1),
  ('SEAMLESS',             'food',          'seed', 1),
  ('CAVIAR',               'food',          'seed', 1),

  -- ── Groceries ───────────────────────────────────────────
  ('WHOLE FOODS',          'groceries',     'seed', 1),
  ('TRADER JOES',          'groceries',     'seed', 1),
  ('SAFEWAY',              'groceries',     'seed', 1),
  ('KROGER',               'groceries',     'seed', 1),
  ('PUBLIX',               'groceries',     'seed', 1),
  ('ALDI',                 'groceries',     'seed', 1),
  ('COSTCO',               'groceries',     'seed', 1),
  ('SAMS CLUB',            'groceries',     'seed', 1),
  ('WEGMANS',              'groceries',     'seed', 1),
  ('SPROUTS FARMERS MKT',  'groceries',     'seed', 1),
  ('RALPHS',               'groceries',     'seed', 1),
  ('VONS',                 'groceries',     'seed', 1),
  ('ALBERTSONS',           'groceries',     'seed', 1),
  ('FOOD LION',            'groceries',     'seed', 1),
  ('STOP SHOP',            'groceries',     'seed', 1),
  ('INSTACART',            'groceries',     'seed', 1),

  -- ── Transport: rideshare, fuel, air, rail, rental ───────
  ('UBER',                 'transport',     'seed', 1),
  ('LYFT',                 'transport',     'seed', 1),
  ('SHELL',                'transport',     'seed', 1),
  ('CHEVRON',              'transport',     'seed', 1),
  ('EXXONMOBIL',           'transport',     'seed', 1),
  ('MOBIL',                'transport',     'seed', 1),
  ('ARCO',                 'transport',     'seed', 1),
  ('VALERO',               'transport',     'seed', 1),
  ('SUNOCO',               'transport',     'seed', 1),
  ('TEXACO',               'transport',     'seed', 1),
  ('DELTA AIR LINES',      'transport',     'seed', 1),
  ('UNITED AIRLINES',      'transport',     'seed', 1),
  ('AMERICAN AIRLINES',    'transport',     'seed', 1),
  ('SOUTHWEST AIRLINES',   'transport',     'seed', 1),
  ('JETBLUE',              'transport',     'seed', 1),
  ('ALASKA AIRLINES',      'transport',     'seed', 1),
  ('AMTRAK',               'transport',     'seed', 1),
  ('HERTZ',                'transport',     'seed', 1),
  ('AVIS',                 'transport',     'seed', 1),
  ('ENTERPRISE RENT A CAR','transport',     'seed', 1),
  ('ZIPCAR',               'transport',     'seed', 1),
  ('LIME',                 'transport',     'seed', 1),

  -- ── Shopping ────────────────────────────────────────────
  ('AMAZON',               'shopping',      'seed', 1),
  ('AMZN MKTP US',         'shopping',      'seed', 1),
  ('TARGET',               'shopping',      'seed', 1),
  ('WALMART',              'shopping',      'seed', 1),
  ('EBAY',                 'shopping',      'seed', 1),
  ('ETSY',                 'shopping',      'seed', 1),
  ('MACYS',                'shopping',      'seed', 1),
  ('NORDSTROM',            'shopping',      'seed', 1),
  ('TJ MAXX',              'shopping',      'seed', 1),
  ('MARSHALLS',            'shopping',      'seed', 1),
  ('ROSS STORES',          'shopping',      'seed', 1),
  ('OLD NAVY',             'shopping',      'seed', 1),
  ('UNIQLO',               'shopping',      'seed', 1),
  ('H M',                  'shopping',      'seed', 1),
  ('ZARA',                 'shopping',      'seed', 1),
  ('NIKE',                 'shopping',      'seed', 1),
  ('ADIDAS',               'shopping',      'seed', 1),
  ('LULULEMON',            'shopping',      'seed', 1),
  ('REI',                  'shopping',      'seed', 1),
  ('SHEIN',                'shopping',      'seed', 1),
  ('TEMU',                 'shopping',      'seed', 1),

  -- ── Home & hardware ─────────────────────────────────────
  ('HOME DEPOT',           'home',          'seed', 1),
  ('LOWES',                'home',          'seed', 1),
  ('ACE HARDWARE',         'home',          'seed', 1),
  ('IKEA',                 'home',          'seed', 1),
  ('WAYFAIR',              'home',          'seed', 1),
  ('BED BATH BEYOND',      'home',          'seed', 1),

  -- ── Bills: telecom, utilities, insurance ────────────────
  ('COMCAST',              'bills',         'seed', 1),
  ('XFINITY',              'bills',         'seed', 1),
  ('VERIZON',              'bills',         'seed', 1),
  ('AT T',                 'bills',         'seed', 1),
  ('T MOBILE',             'bills',         'seed', 1),
  ('SPECTRUM',             'bills',         'seed', 1),
  ('CON EDISON',           'bills',         'seed', 1),
  ('DUKE ENERGY',          'bills',         'seed', 1),
  ('NATIONAL GRID',        'bills',         'seed', 1),
  ('GEICO',                'bills',         'seed', 1),
  ('STATE FARM',           'bills',         'seed', 1),
  ('PROGRESSIVE',          'bills',         'seed', 1),
  ('ALLSTATE',             'bills',         'seed', 1),

  -- ── Health ──────────────────────────────────────────────
  ('CVS PHARMACY',         'health',        'seed', 1),
  ('WALGREENS',            'health',        'seed', 1),
  ('RITE AID',             'health',        'seed', 1),
  ('QUEST DIAGNOSTICS',    'health',        'seed', 1),
  ('LABCORP',              'health',        'seed', 1),
  ('ONE MEDICAL',          'health',        'seed', 1),

  -- ── Fitness ─────────────────────────────────────────────
  ('PLANET FITNESS',       'fitness',       'seed', 1),
  ('EQUINOX',              'fitness',       'seed', 1),
  ('LA FITNESS',           'fitness',       'seed', 1),
  ('ORANGETHEORY FITNESS', 'fitness',       'seed', 1),
  ('CLASSPASS',            'fitness',       'seed', 1),
  ('PELOTON',              'fitness',       'seed', 1),
  ('GOLDS GYM',            'fitness',       'seed', 1),
  ('CRUNCH FITNESS',       'fitness',       'seed', 1),

  -- ── Entertainment ───────────────────────────────────────
  ('AMC THEATRES',         'entertainment', 'seed', 1),
  ('REGAL CINEMAS',        'entertainment', 'seed', 1),
  ('CINEMARK',             'entertainment', 'seed', 1),
  ('TICKETMASTER',         'entertainment', 'seed', 1),
  ('STUBHUB',              'entertainment', 'seed', 1),
  ('EVENTBRITE',           'entertainment', 'seed', 1),
  ('DAVE BUSTERS',         'entertainment', 'seed', 1),
  ('TOPGOLF',              'entertainment', 'seed', 1),
  ('STEAMGAMES',           'entertainment', 'seed', 1),
  ('PLAYSTATION NETWORK',  'entertainment', 'seed', 1),
  ('XBOX',                 'entertainment', 'seed', 1),
  ('NINTENDO',             'entertainment', 'seed', 1),

  -- ── Subscriptions ───────────────────────────────────────
  ('NETFLIX',              'subscriptions', 'seed', 1),
  ('SPOTIFY',              'subscriptions', 'seed', 1),
  ('HULU',                 'subscriptions', 'seed', 1),
  ('DISNEY PLUS',          'subscriptions', 'seed', 1),
  ('HBO MAX',              'subscriptions', 'seed', 1),
  ('PARAMOUNT PLUS',       'subscriptions', 'seed', 1),
  ('PEACOCK',              'subscriptions', 'seed', 1),
  ('AMAZON PRIME',         'subscriptions', 'seed', 1),
  ('YOUTUBE PREMIUM',      'subscriptions', 'seed', 1),
  ('AUDIBLE',              'subscriptions', 'seed', 1),
  ('PATREON',              'subscriptions', 'seed', 1),
  ('DROPBOX',              'subscriptions', 'seed', 1),
  ('ADOBE',                'subscriptions', 'seed', 1),
  ('MICROSOFT 365',        'subscriptions', 'seed', 1),
  ('NOTION',               'subscriptions', 'seed', 1),
  ('OPENAI',               'subscriptions', 'seed', 1),
  ('ANTHROPIC',            'subscriptions', 'seed', 1),
  ('GITHUB',               'subscriptions', 'seed', 1),
  ('NYTIMES',              'subscriptions', 'seed', 1),
  ('DUOLINGO',             'subscriptions', 'seed', 1),

  -- ── Tech ────────────────────────────────────────────────
  ('APPLE STORE',          'tech',          'seed', 1),
  ('BEST BUY',             'tech',          'seed', 1),
  ('MICRO CENTER',         'tech',          'seed', 1),
  ('NEWEGG',               'tech',          'seed', 1),
  ('LOGITECH',             'tech',          'seed', 1),

  -- ── Trip: lodging and booking ───────────────────────────
  ('AIRBNB',               'trip',          'seed', 1),
  ('VRBO',                 'trip',          'seed', 1),
  ('BOOKING',              'trip',          'seed', 1),
  ('EXPEDIA',              'trip',          'seed', 1),
  ('HOTELS',               'trip',          'seed', 1),
  ('MARRIOTT',             'trip',          'seed', 1),
  ('HILTON',               'trip',          'seed', 1),
  ('HYATT',                'trip',          'seed', 1),

  -- ── Investment ──────────────────────────────────────────
  ('VANGUARD',             'investment',    'seed', 1),
  ('FIDELITY',             'investment',    'seed', 1),
  ('CHARLES SCHWAB',       'investment',    'seed', 1),
  ('ROBINHOOD',            'investment',    'seed', 1),
  ('COINBASE',             'investment',    'seed', 1),
  ('BETTERMENT',           'investment',    'seed', 1),
  ('WEALTHFRONT',          'investment',    'seed', 1),

  -- ── Transfer: person-to-person money movement ───────────
  ('VENMO',                'transfer',      'seed', 1),
  ('ZELLE',                'transfer',      'seed', 1),
  ('PAYPAL',               'transfer',      'seed', 1),
  ('CASH APP',             'transfer',      'seed', 1),
  ('WISE',                 'transfer',      'seed', 1)
ON CONFLICT (merchant_key) DO NOTHING;
