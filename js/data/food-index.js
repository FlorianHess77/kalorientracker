/** Alle mitgelieferten Lebensmittel und Gerichte nach ID ("generic:…", "dish:…") */
import { GENERIC_FOODS } from './generic-foods.js';
import { DISH_FOODS } from './food-classes.js';

const withPortions = (f) => f.portions ? f : {
  ...f,
  portions: { small_g: Math.max(1, Math.round(f.servingG * 0.6)), medium_g: f.servingG, large_g: Math.round(f.servingG * 1.5) },
};

export const FOOD_BY_ID = new Map([...GENERIC_FOODS, ...DISH_FOODS].map((f) => [f.id, withPortions(f)]));
