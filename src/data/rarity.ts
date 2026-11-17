// Централізована система рідкісності. Кольори, назви та іконки визначені один раз.
export type Rarity = 'divine' | 'mythic' | 'legendary' | 'epic' | 'rare' | 'common';

export interface RarityDef {
  id: Rarity;
  name: string;
  color: string;
  glow: string;
  /** id SVG-іконки з assets/icons (див. components/Icons.tsx) */
  icon: 'crown' | 'flame' | 'star' | 'shield' | 'diamond' | null;
  iconName: string;
  order: number;
  /** Рамка картки та іконка з UI kit (локальні SVG) */
  frame: string;
  iconSrc: string;
}

export const RARITY: Record<Rarity, RarityDef> = {
  divine: { frame: 'assets/ui/cards/divine.svg', iconSrc: 'assets/ui/icons/rarity-divine.svg', id: 'divine', name: 'Божественний', color: '#F5C542', glow: 'rgba(245,197,66,.75)', icon: 'crown', iconName: 'Золота корона', order: 0 },
  mythic: { frame: 'assets/ui/cards/mythic.svg', iconSrc: 'assets/ui/icons/rarity-mythic.svg', id: 'mythic', name: 'Міфічний', color: '#914CFF', glow: 'rgba(145,76,255,.7)', icon: 'flame', iconName: 'Міфічне полум’я', order: 1 },
  legendary: { frame: 'assets/ui/cards/legendary.svg', iconSrc: 'assets/ui/icons/rarity-legendary.svg', id: 'legendary', name: 'Легендарний', color: '#F28C28', glow: 'rgba(242,140,40,.7)', icon: 'star', iconName: 'Помаранчева зірка', order: 2 },
  epic: { frame: 'assets/ui/cards/epic.svg', iconSrc: 'assets/ui/icons/rarity-epic.svg', id: 'epic', name: 'Епічний', color: '#347DE0', glow: 'rgba(52,125,224,.7)', icon: 'shield', iconName: 'Синій щит', order: 3 },
  rare: { frame: 'assets/ui/cards/rare.svg', iconSrc: 'assets/ui/icons/rarity-rare.svg', id: 'rare', name: 'Рідкісний', color: '#28B884', glow: 'rgba(40,184,132,.65)', icon: 'diamond', iconName: 'Зелений діамант', order: 4 },
  common: { frame: 'assets/ui/cards/common.svg', iconSrc: 'assets/ui/icons/rarity-common.svg', id: 'common', name: 'Звичайний', color: '#B0C0C9', glow: 'rgba(176,192,201,.4)', icon: null, iconName: '', order: 5 },
};
