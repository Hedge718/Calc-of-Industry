export type IO = { name: string; qtyPerCycle: number };

export type Recipe = {
  recipeId: string;
  building: string;
  timeSec: number;   // seconds per craft
  inputs: IO[];
  outputs: IO[];
};

export type RecipesFile = { recipes: Recipe[] };

export type ProductIndex = Record<string, Recipe[]>; // product -> recipes that output it
