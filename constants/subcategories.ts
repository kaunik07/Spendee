// Subcategory taxonomy + per-subcategory detail fields.
// `details` are stored on the expense as a JSON bag and are only
// displayed when opening the expense — reserved for later stages.

// 'search-list' = searchable dropdown over field.options with an
// "Other — use as typed" fallback (same UX as the airline search).
// 'datetime' = date + time picker (stored as "YYYY-MM-DDTHH:mm" local).
// 'checkbox' = boolean toggle row.
// 'suggest-text' = free text with suggestions learned from the values
//                  previously saved under the same detail key.
export type DetailFieldType = 'text' | 'date' | 'datetime' | 'chips' | 'airport' | 'airline' | 'location' | 'store' | 'search-list' | 'checkbox' | 'suggest-text';

// Detail keys whose past values are collected for 'suggest-text' autocomplete
export const LEARNED_DETAIL_KEYS = ['restaurant'];

export interface DetailField {
  key: string;             // key inside expense.details
  label: string;
  type: DetailFieldType;
  options?: string[];      // for 'chips' / seed options for 'store'
  placeholder?: string;
  /** Field is only shown when this returns true for the current details */
  showIf?: (details: Record<string, any>) => boolean;
  /** checkbox only: detail keys wiped when the box is unchecked */
  clears?: string[];
}

export interface Subcategory {
  id: string;
  label: string;
  icon: string;
  fields?: DetailField[];
}

const FOOD_FIELDS: DetailField[] = [
  { key: 'restaurant', label: 'Restaurant', type: 'suggest-text', placeholder: 'Restaurant name' },
  { key: 'location',   label: 'Location',   type: 'location',     placeholder: 'Search a place...' },
];

export const Subcategories: Record<string, Subcategory[]> = {
  transport: [
    {
      id: 'cab', label: 'Cab', icon: 'taxi',
      fields: [{ key: 'provider', label: 'Service', type: 'chips', options: ['Lyft', 'Uber'] }],
    },
    { id: 'lime', label: 'Lime', icon: 'scooter' },
    {
      id: 'flight', label: 'Flight', icon: 'airplane',
      fields: [
        { key: 'airline', label: 'Airline', type: 'airline', placeholder: 'Search airline or code...' },
        { key: 'from',    label: 'From',    type: 'airport', placeholder: 'Search airport or code...' },
        { key: 'to',      label: 'To',      type: 'airport', placeholder: 'Search airport or code...' },
        { key: 'when',    label: 'When',    type: 'date' },
      ],
    },
    {
      id: 'car-rental', label: 'Car Rental', icon: 'car-key',
      fields: [
        {
          key: 'company', label: 'Rental company', type: 'search-list',
          options: ['Avis', 'Budget', 'Alamo', 'Enterprise', 'National', 'Hertz', 'Dollar', 'Thrifty', 'Fox'],
          placeholder: 'Search rental company...',
        },
        { key: 'start', label: 'Pick-up',  type: 'datetime' },
        { key: 'end',   label: 'Drop-off', type: 'datetime' },
        {
          key: 'pickup_location', label: 'Pick-up location', type: 'airport',
          placeholder: 'Search airport or code...',
        },
        {
          key: 'different_dropoff', label: 'Drop-off at a different location?', type: 'checkbox',
          clears: ['dropoff_location'],
        },
        {
          key: 'dropoff_location', label: 'Drop-off location', type: 'airport',
          placeholder: 'Search airport or code...',
          showIf: (d) => !!d.different_dropoff,
        },
      ],
    },
    { id: 'cruise', label: 'Cruise', icon: 'ferry' },
    {
      id: 'train', label: 'Train', icon: 'train',
      fields: [
        { key: 'train_name', label: 'Train name', type: 'text', placeholder: 'e.g. Amtrak Cascades' },
        { key: 'from',       label: 'From',       type: 'text', placeholder: 'Station / city' },
        { key: 'to',         label: 'To',         type: 'text', placeholder: 'Station / city' },
        { key: 'when',       label: 'When',       type: 'date' },
      ],
    },
    { id: 'other', label: 'Other', icon: 'dots-horizontal' },
  ],

  home: [
    { id: 'rent',        label: 'Rent',        icon: 'home-city-outline' },
    { id: 'internet',    label: 'Internet',    icon: 'wifi' },
    { id: 'utility',     label: 'Utility',     icon: 'water-pump' },
    { id: 'electricity', label: 'Electricity', icon: 'flash-outline' },
    { id: 'other',       label: 'Other',       icon: 'dots-horizontal' },
  ],

  food: [
    { id: 'uber-eats',    label: 'Uber Eats',    icon: 'moped',                  fields: FOOD_FIELDS },
    { id: 'doordash',     label: 'DoorDash',     icon: 'bike-fast',              fields: FOOD_FIELDS },
    { id: 'dining',       label: 'Dining',       icon: 'silverware-fork-knife',  fields: FOOD_FIELDS },
    { id: 'office-lunch', label: 'Office Lunch', icon: 'office-building',        fields: FOOD_FIELDS },
    { id: 'other',        label: 'Other',        icon: 'dots-horizontal' },
  ],

  entertainment: [
    { id: 'concert', label: 'Concert', icon: 'microphone-variant' },
    { id: 'movies',  label: 'Movies',  icon: 'filmstrip' },
    { id: 'theater', label: 'Theater', icon: 'drama-masks' },
    { id: 'arcade',  label: 'Arcade',  icon: 'gamepad-variant' },
    { id: 'other',   label: 'Other',   icon: 'dots-horizontal' },
  ],

  shopping: [
    { id: 'amazon',   label: 'Amazon',   icon: 'package-variant-closed' },
    {
      id: 'in-store', label: 'In-Store', icon: 'storefront-outline',
      fields: [{ key: 'store', label: 'Which store?', type: 'text', placeholder: 'Store name' }],
    },
    { id: 'other', label: 'Other', icon: 'dots-horizontal' },
  ],

  tech: [
    { id: 'gpt', label: 'GPT', icon: 'robot-outline' },
    {
      id: 'others', label: 'Others', icon: 'dots-horizontal',
      fields: [{ key: 'what', label: 'What was it?', type: 'text', placeholder: 'So we can categorize it later' }],
    },
  ],

  fitness: [
    { id: 'protein-powder', label: 'Protein Powder', icon: 'shaker-outline' },
    { id: 'gym-membership', label: 'Gym Membership', icon: 'dumbbell' },
    { id: 'equipment',      label: 'Equip',          icon: 'weight-lifter' },
    { id: 'other',          label: 'Other',          icon: 'dots-horizontal' },
  ],

  investment: [
    { id: '401k',  label: '401k', icon: 'bank-outline' },
    { id: 'etf',   label: 'ETF',  icon: 'chart-areaspline' },
    { id: 'other', label: 'Other', icon: 'dots-horizontal' },
  ],
};

// Detail fields asked at the category level (no subcategory needed).
export const CategoryDetailFields: Record<string, DetailField[]> = {
  groceries: [
    {
      key: 'store', label: 'Which store?', type: 'store',
      options: ['Safeway', "Trader Joe's", 'HMart', 'Indian'],
    },
  ],
};

export const getSubcategories = (categoryId: string): Subcategory[] =>
  Subcategories[categoryId] ?? [];

export const getSubcategoryById = (categoryId: string, subId?: string | null): Subcategory | null =>
  subId ? getSubcategories(categoryId).find((s) => s.id === subId) ?? null : null;
