// Material 3 Dark Theme
export const Colors = {
  // Backgrounds
  background:           '#0F0E17',
  surface:              '#1C1B23',
  surfaceContainer:     '#252336',
  surfaceContainerHigh: '#2E2C3B',

  // Primary
  primary:    '#A8EDBB',   // mint green — finance feel
  onPrimary:  '#003919',
  primaryMuted: '#A8EDBB22',

  // Text
  text:          '#E6E1E5',
  textSecondary: '#CAC4D0',
  textMuted:     '#49454F',

  // Utility
  border:  '#2E2C3B',
  danger:  '#F2B8B5',
  outline: '#938F99',

  // Tab bar
  tabBar: '#13121A',
};

export const Categories = [
  { id: 'food',          label: 'Food & Drink',  icon: 'food',                  emoji: '🍔', color: '#FFB4A2' },
  { id: 'transport',     label: 'Transport',     icon: 'car',                   emoji: '🚗', color: '#9ECAFF' },
  { id: 'shopping',      label: 'Shopping',      icon: 'shopping',              emoji: '🛍️', color: '#D7AAFF' },
  { id: 'bills',         label: 'Bills',         icon: 'lightning-bolt',        emoji: '⚡', color: '#FFD966' },
  { id: 'home',          label: 'Home',          icon: 'home-city',             emoji: '🏠', color: '#BCAAA4' },
  { id: 'entertainment', label: 'Entertainment', icon: 'movie-open',            emoji: '🎬', color: '#F28B82' },
  { id: 'health',        label: 'Health',        icon: 'heart-pulse',           emoji: '💊', color: '#81C995' },
  { id: 'groceries',     label: 'Groceries',     icon: 'cart',                  emoji: '🛒', color: '#FBBC04' },
  { id: 'tech',          label: 'Tech',          icon: 'laptop',                emoji: '💻', color: '#78D9EC' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'autorenew',             emoji: '🔁', color: '#7986CB' },
  { id: 'trip',          label: 'Trip',          icon: 'bag-suitcase',          emoji: '🧳', color: '#FFB74D' },
  { id: 'transfer',      label: 'Transfer',      icon: 'send',                  emoji: '💸', color: '#80CBC4' },
  { id: 'fitness',       label: 'Fitness',       icon: 'dumbbell',              emoji: '🏋️', color: '#F06292' },
  { id: 'investment',    label: 'Investment',    icon: 'chart-line-variant',    emoji: '📈', color: '#B39DDB' },
  { id: 'other',         label: 'Other',         icon: 'dots-horizontal-circle',emoji: '📦', color: '#CAC4D0' },
];

export const getCategoryById = (id: string) =>
  Categories.find((c) => c.id === id) ?? Categories[Categories.length - 1];
