// Prüft, ob alle Gerichte aus js/data/food-classes.js exakt so in der Labelliste des Modells stehen.
// Ergebnis wird in build-info.json ergänzt (ohne den Build abzubrechen).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { FOOD_CLASSES } from '../js/data/food-classes.js';

const labelsPath = 'models/aiy_food_V1_labels.json';
const info = existsSync('build-info.json') ? JSON.parse(readFileSync('build-info.json', 'utf8')) : {};
if (existsSync(labelsPath)) {
  const known = new Set(JSON.parse(readFileSync(labelsPath, 'utf8')));
  const missing = [...FOOD_CLASSES.keys()].filter((l) => !known.has(l));
  info.foodClasses = FOOD_CLASSES.size;
  info.missingLabels = missing;
  console.log(missing.length ? `⚠ Unbekannte Labels: ${missing.join(', ')}` : `✓ Alle ${FOOD_CLASSES.size} Gerichte passen zum Modell`);
} else {
  info.missingLabels = 'Labelliste fehlt';
}
writeFileSync('build-info.json', JSON.stringify(info, null, 2));
