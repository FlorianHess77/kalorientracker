/**
 * Grobe Schätzwerte für Gerichte des Foto-Modells, zu denen (noch) keine genauen Nährwerte
 * hinterlegt sind. Der Gerichtstyp wird am Namen erkannt (Suppe, Nudeln, Kuchen …).
 * So landet jede Erkennung bei brauchbaren Werten statt in einer Sackgasse – die App kennzeichnet
 * sie aber deutlich als Schätzung.
 *
 * Reine Funktion, getestet.
 */

import { normalize } from '../lib/stats.js';

// [Typ, Wörter im Namen, kcal, Eiweiß, Kohlenhydrate, Fett, Portion klein, mittel, groß]
const RULES = [
  ['Sandwich / Burger', ['sandwich', 'burger', 'wrap', 'taco', 'burrito', 'kebab', 'gyro', 'doner', 'hot dog', 'po boy', '=sub', 'banh mi', '=torta', 'arepa', '=pita'], 230, 11, 24, 10, 150, 220, 300],
  ['Nudelsuppe', ['noodle soup', 'ramen', 'udon', 'soba', '=pho', 'bun bo', 'bun rieu', 'laksa', '=mi', '=mee', '=mie', 'guksu', '=mian', 'lamian'], 85, 5, 10, 2.5, 400, 550, 700],
  ['Suppe', ['soup', 'suppe', 'broth', 'chowder', 'bisque', 'consomme', 'caldo', '=sopa', '=soto', '=tom', '=guk', '=tang', 'jjigae', 'potage', 'shchi', 'borscht', 'ciorba', 'zuppa', 'minestra', 'gazpacho', 'velout'], 50, 3, 5, 2, 300, 400, 500],
  ['Kuchen / Süßspeise', ['cake', 'torte', '=tart', '=pie', 'gateau', 'kuchen', 'strudel', 'pudding', 'cookie', 'biscuit', 'brownie', 'cobbler', 'crumble', 'mochi', 'halwa', 'halva', 'baklava', 'dessert', 'candy', 'sweet', 'kulfi', 'sundae', 'custard', 'flan', 'meringue', 'donut', 'doughnut', 'waffle', 'pastry', '=ice cream', 'jalebi', 'barfi', 'ladoo', 'laddu', 'fudge', 'toffee', 'truffle', 'praline', 'macaron', 'eclair', 'cream puff'], 330, 5, 45, 15, 60, 100, 150],
  ['Pizza', ['pizza', 'flatbread', 'flammekueche', 'pide', 'lahmacun'], 260, 11, 30, 10, 150, 300, 450],
  ['Teigtaschen', ['dumpling', 'gyoza', 'jiaozi', 'wonton', '=bao', '=momo', 'pierogi', 'ravioli', 'mandu', 'xiaolongbao', 'shumai', 'siu mai', 'empanada', 'samosa', 'pastel', 'knish', 'manti', 'khinkali', 'pelmeni', 'vareniki'], 200, 8, 25, 7, 120, 200, 300],
  ['Nudelgericht', ['noodle', 'pasta', 'spaghetti', 'macaroni', 'mein', '=pad', 'pancit', 'yakisoba', '=fen', 'kway', 'japchae', 'lasagn', 'gnocchi', 'tagliatelle', 'penne', 'fusilli', 'linguine', 'fettuccine', 'orzo', 'spatzle'], 160, 6, 22, 5, 250, 350, 450],
  ['Reisgericht', ['rice', 'risotto', 'pilaf', 'biryani', 'paella', 'congee', 'nasi', 'arroz', '=bap', '=bab', '=don', 'jollof', 'pulao', 'pilau', '=com', 'onigiri', 'sushi', 'kimbap', 'gimbap'], 160, 5, 25, 4.5, 250, 350, 450],
  ['Curry', ['curry', 'masala', 'korma', 'vindaloo', 'rendang', 'gulai', '=kari', 'tikka', '=dal', 'dhal', 'sambar', 'kadhi', 'paneer'], 140, 8, 9, 8, 250, 350, 450],
  ['Salat', ['salad', 'salat', 'slaw', 'salade', 'ensalada', 'som tam', 'tabbouleh', 'fattoush', 'ceviche', 'poke'], 90, 3, 6, 6, 150, 250, 350],
  ['Brot / Gebäck', ['bread', 'brot', 'naan', 'roti', 'paratha', 'loaf', 'focaccia', 'bagel', 'tortilla', 'chapati', 'lavash', '=bun', '=roll', 'pretzel', 'brioche', 'croissant', 'scone', 'muffin', 'biscotti'], 280, 8, 48, 6, 50, 80, 120],
  ['Frittiertes', ['fried', 'fritter', 'tempura', 'katsu', 'pakora', 'croquette', 'bhaji', 'karaage', 'nugget', 'chips', 'fries', 'crispy'], 260, 10, 20, 15, 100, 180, 250],
  ['Eintopf / Schmorgericht', ['stew', 'ragout', 'goulash', 'casserole', 'braise', 'hotpot', 'hot pot', 'tagine', 'chili', 'gumbo', 'cassoulet', 'feijoada', 'eintopf', '=pot'], 120, 9, 8, 6, 250, 350, 450],
  ['Fisch / Meeresfrüchte', ['fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'crab', 'lobster', 'squid', 'octopus', 'clam', 'mussel', 'oyster', '=cod', 'seafood', 'ikan', 'bacalhau', 'herring', 'sardine', '=eel', 'unagi', 'anchov', 'scallop'], 150, 18, 5, 6, 150, 220, 300],
  ['Geflügel', ['chicken', 'duck', '=hen', 'turkey', 'poultry', '=gai', 'ayam', 'pollo', 'frango', 'goose', 'quail'], 180, 20, 4, 9, 150, 250, 350],
  ['Fleischgericht', ['beef', 'steak', 'pork', 'lamb', 'mutton', 'veal', '=ham', 'sausage', 'bacon', 'ribs', 'meat', 'bulgogi', 'galbi', 'roast', 'brisket', 'schnitzel', 'cutlet', 'meatball', 'wurst', 'chorizo', 'salami', 'jerky', 'liver'], 220, 20, 4, 14, 150, 250, 350],
  ['Eiergericht', ['=egg', '=eggs', 'omelet', 'frittata', 'shakshuka', 'quiche'], 160, 10, 3, 12, 120, 200, 280],
  ['Hülsenfrüchte / Tofu', ['tofu', 'bean', 'lentil', 'chickpea', 'hummus', 'falafel', 'edamame', 'tempeh', 'natto'], 140, 8, 15, 5, 150, 250, 350],
  ['Gemüsegericht', ['vegetable', 'eggplant', 'aubergine', 'zucchini', 'cabbage', 'spinach', 'mushroom', 'potato', 'okra', 'pumpkin', 'squash', 'pepper', 'tomato', 'greens'], 110, 3, 12, 5, 150, 250, 350],
];

const DEFAULT = ['Gericht', [], 170, 8, 18, 7, 200, 300, 400];

/** "=wort" passt nur als ganzes Wort (auch Mehrzahl), sonst überall im Namen */
function matches(text, word) {
  if (word.startsWith('=')) {
    const w = word.slice(1);
    return text.includes(` ${w} `) || text.includes(` ${w}s `) || text.includes(` ${w}es `);
  }
  return text.includes(word);
}

export function estimateDish(label) {
  const text = ` ${normalize(label).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const rule = RULES.find(([, words]) => words.some((w) => matches(text, w))) ?? DEFAULT;
  const [type, , kcal, protein_g, carbs_g, fat_g, small_g, medium_g, large_g] = rule;
  return {
    modelLabel: label,
    nameDe: label,
    type,
    estimated: true,
    per100g: { kcal, protein_g, carbs_g, fat_g },
    portions: { small_g, medium_g, large_g },
  };
}
