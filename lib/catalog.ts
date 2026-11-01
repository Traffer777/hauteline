export type Product = {
  color?: string;
  colorHex?: string;
  gender?: string;
  category?: string;
  id: string;
  name: string;
  brand: string;
  price: number;
  compareAt?: number; // старая цена — показывается зачёркнутой, если больше текущей
  availability: 'preorder' | 'stock';
  condition: string;
  sizes: string[];
  stock: number;
  image: string;
  sprite?: number;
  gallery?: string[];
  description: string;
  published: boolean;
  promo: boolean;
};
export const initialProducts: Product[] = [
  {
    id: 'HL-JK-001',
    name: 'Техническая куртка с капюшоном',
    brand: 'Moncler',
    price: 18900,
    availability: 'preorder',
    condition: 'Новое',
    sizes: ['S', 'M', 'L'],
    stock: 3,
    image: '/figma/94-2357/aa64e.png',
    gallery: ['/figma/94-2357/aa64e.png', '/figma/94-2357/89453.png', '/figma/94-2357/e4969.png'],
    description: 'Техническая куртка с капюшоном. Подробности и замеры уточняйте у менеджера.',
    published: true,
    promo: false,
  },
  {
    id: 'HL-SH-002',
    name: 'Кожаные кеды на платформе',
    brand: '',
    price: 12500,
    availability: 'preorder',
    condition: 'Новое',
    sizes: ['38', '39', '40', '41', '42'],
    stock: 5,
    image: '/figma/init0/f19cc.png',
    sprite: 1,
    description: 'Кожаные кеды на платформе.',
    published: true,
    promo: false,
  },
  {
    id: 'HL-JN-003',
    name: 'Джинсы широкого кроя',
    brand: 'Balenciaga',
    price: 9900,
    availability: 'preorder',
    condition: 'Идеальное',
    sizes: ['S', 'M', 'L'],
    stock: 2,
    image: '/figma/init0/f19cc.png',
    sprite: 2,
    description: 'Джинсы широкого кроя Balenciaga.',
    published: true,
    promo: false,
  },
  {
    id: 'HL-BG-004',
    name: 'Сумка на плечо из гладкой кожи',
    brand: '',
    price: 7500,
    availability: 'stock',
    condition: 'Хорошее',
    sizes: ['One size'],
    stock: 1,
    image: '/figma/init0/f19cc.png',
    sprite: 3,
    description: 'Сумка на плечо из гладкой кожи.',
    published: true,
    promo: false,
  },
];
export const stages = [
  'Едет на склад за рубежом',
  'Приехало на склад',
  'Готовится к отправке в РФ',
  'Отправлено со склада в РФ',
  'Проходит проверку таможни',
  'Прошло проверку, едет в РФ',
  'Принято на складе в РФ',
  'Отправлено к вам',
];
/** Короткие предлоги и союзы не остаются в конце строки: «куртка с\u00a0капюшоном». */
export const nbspShort = (s: string) =>
  s.replace(/(^|\s)(в|и|к|с|у|о|а|на|по|за|от|до|из|не|для|без|при|или|об)\s/gi, '$1$2\u00a0');
export const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(n) + '\u00a0₽';

// Разделы меню (Одежда, Обувь, Аксессуары, Парфюмерия) — по категории и названию вещи.
export const departments = ['Одежда', 'Обувь', 'Аксессуары', 'Парфюмерия'] as const;
const departmentWords: [string, RegExp][] = [
  ['Парфюмерия', /парфюм|дух[иа]|аромат|туалетн|eau de|parfum|fragrance/i],
  ['Обувь', /обув|кроссов|кед|туфл|ботин|сапог|лофер|сандал|слипон|мокасин|мюли|шлепан|sneaker|shoe|boot/i],
  [
    'Аксессуары',
    /аксессуар|сумк|клатч|рюкзак|ремен|ремн|очк|кошел|портмоне|шарф|платок|шапк|кепк|бейсболк|перчат|украшен|серьг|кольц|браслет|часы|bag|wallet|belt/i,
  ],
];
export function department(p: Pick<Product, 'name' | 'category'>): string {
  const text = (p.category || '') + ' ' + p.name;
  return departmentWords.find(([, re]) => re.test(text))?.[0] || 'Одежда';
}
/** Поиск по словам с учётом окончаний: «футболки» находит «футболку», «джинсы» — «джинсовую». */
export function matchesQuery(p: Product, q: string) {
  const hay = (p.name + ' ' + p.brand + ' ' + (p.category || '') + ' ' + (p.color || '') + ' ' + department(p))
    .toLowerCase()
    .replace(/ё/g, 'е');
  return q
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[\s,]+/)
    .filter(Boolean)
    .every((w) => hay.includes(w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w));
}
export const genderLabels: Record<string, string> = { men: 'мужские', women: 'женские', unisex: 'унисекс' };
