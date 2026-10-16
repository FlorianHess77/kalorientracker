/**
 * Zuordnung Foto-Modell-Klasse → Nährwerte pro 100 g und Portionsgrößen.
 * Die Schlüssel entsprechen exakt den Labels des Modells "AIY Vision Classifier Food V1"
 * (alle geprüft). RICHTWERTE für typische Zubereitung – vor einer Veröffentlichung
 * gegen eine Nährwertdatenbank prüfen. Neue Einträge einfach ergänzen.
 *
 * Format: label: [Name, kcal, Eiweiß g, Kohlenhydrate g, Fett g, Portion klein g, mittel g, groß g]
 */
const RAW = {
  'Schnitzel':        ['Schnitzel (paniert)',   235, 17.0, 13.0, 13.0, 120, 180, 250],
  'Cordon bleu':      ['Cordon bleu',           260, 19.0, 10.0, 16.0, 150, 220, 300],
  'Goulash':          ['Gulasch',               125, 12.0,  4.0,  7.0, 200, 300, 400],
  'Tafelspitz':       ['Tafelspitz',            150, 24.0,  0.5,  6.0, 120, 180, 250],
  'Leberkäse':        ['Leberkäse',             300, 12.0,  1.0, 27.0,  80, 130, 200],
  'Knödel':           ['Knödel',                170,  6.0, 28.0,  3.5, 100, 150, 220],
  'Spätzle':          ['Spätzle',               150,  5.0, 27.0,  2.5, 150, 250, 350],
  'Palatschinke':     ['Palatschinke',          200,  7.0, 24.0,  8.0,  80, 150, 220],
  'Apple strudel':    ['Apfelstrudel',          260,  3.0, 34.0, 12.0, 100, 150, 200],
  'Sachertorte':      ['Sachertorte',           380,  5.0, 48.0, 18.0,  70, 110, 150],
  'Neapolitan pizza': ['Pizza',                 250, 11.0, 31.0,  9.0, 150, 300, 450],
  'Spaghetti':        ['Spaghetti mit Sauce',   150,  5.5, 22.0,  4.5, 250, 350, 450],
  'Lasagne':          ['Lasagne',               135,  8.0, 13.0,  5.5, 200, 300, 400],
  'Hamburger':        ['Hamburger',             250, 13.0, 27.0, 10.0, 150, 220, 300],
  'White rice':       ['Reis, gekocht',         130,  2.7, 28.0,  0.3, 100, 180, 250],
  'Mashed potato':    ['Kartoffelpüree',        113,  2.0, 17.0,  4.2, 150, 250, 350],
  'Omelette':         ['Omelett',               155, 10.6,  0.6, 12.0, 100, 150, 220],
  'Pancake':          ['Pancakes',              227,  6.4, 28.0,  9.7,  80, 150, 220],
  'Greek salad':      ['Griechischer Salat',    105,  3.5,  4.0,  8.5, 150, 250, 350],
  'Sushi':            ['Sushi',                 145,  5.5, 28.0,  1.0, 100, 200, 300],
  'Muesli':           ['Müsli (trocken)',       365, 10.0, 64.0,  6.0,  40,  60,  90],
};

export const FOOD_CLASSES = new Map(
  Object.entries(RAW).map(([label, [nameDe, kcal, protein_g, carbs_g, fat_g, small_g, medium_g, large_g]]) => [
    label,
    {
      modelLabel: label,
      nameDe,
      per100g: { kcal, protein_g, carbs_g, fat_g },
      portions: { small_g, medium_g, large_g },
    },
  ]),
);
