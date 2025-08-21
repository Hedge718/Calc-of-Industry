import type { Recipe, RecipesFile, ProductIndex } from "../types";
import data from "../data/recipes.json";

// 1) Load recipes
export const RECIPES: Recipe[] = (data as unknown as RecipesFile).recipes;

// 2) Build product index (outputs -> recipes)
export const PRODUCT_INDEX: ProductIndex = RECIPES.reduce((acc, r) => {
  r.outputs.forEach(o => {
    const key = o.name.trim();
    (acc[key] ||= []).push(r);
  });
  return acc;
}, {} as ProductIndex);

// 3) Build ALL_PRODUCTS (union of inputs and outputs, sorted)
const names = new Set<string>();
for (const r of RECIPES) {
  r.inputs.forEach(i => names.add(i.name.trim()));
  r.outputs.forEach(o => names.add(o.name.trim()));
}
export const ALL_PRODUCTS = Array.from(names).sort();

// 4) Helpers
export function outputRatePerMin(r: Recipe, product: string): number {
  const out = r.outputs.find(o => o.name.trim().toLowerCase() === product.trim().toLowerCase());
  if (!out) return 0;
  return (out.qtyPerCycle / r.timeSec) * 60;
}

export function pickRecipeForProduct(product: string, preferredId?: string | null): Recipe | undefined {
  const list = PRODUCT_INDEX[product] || PRODUCT_INDEX[product.trim()] ||
               PRODUCT_INDEX[product.trim().replace(/\s+/g, " ")];
  if (!list || list.length === 0) return undefined;
  if (preferredId) {
    const exact = list.find(r => r.recipeId === preferredId);
    if (exact) return exact;
  }
  return list[0];
}

import type { Recipe } from "../types";

/** All recipes that output `product`, grouped by building name. */
export function recipesByBuildingForProduct(product: string): Record<string, Recipe[]> {
  const list = PRODUCT_INDEX[product] ?? [];
  const groups: Record<string, Recipe[]> = {};
  for (const r of list) {
    const key = r.building?.trim() || "Unknown";
    (groups[key] ||= []).push(r);
  }
  // optional: sort variants by time ascending to make 'faster' first
  for (const b of Object.keys(groups)) {
    groups[b].sort((a,b) => a.timeSec - b.timeSec);
  }
  return groups;
}