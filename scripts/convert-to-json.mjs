// scripts/convert-to-json.mjs
import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const INPUT = path.resolve("src/data/Data of Industry.xlsx");
const OUTPUT = path.resolve("src/data/recipes.json");

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function collectIO(row, prefix) {
  const ios = [];
  for (let i = 1; i <= 9; i++) {
    const name = row[`${prefix}${i}Name`];
    const qty  = row[`${prefix}${i}Qty`];
    if (name != null && qty != null && toNumber(qty) !== 0) {
      ios.push({ name: String(name).trim(), qtyPerCycle: toNumber(qty) });
    }
  }
  return ios;
}

function convert() {
  if (!fs.existsSync(INPUT)) {
    console.error(`❌ Missing file: ${INPUT}`);
    process.exit(1);
  }
  const wb = xlsx.readFile(INPUT);
  const sheet = wb.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: null });

  const recipes = [];
  for (const row of rows) {
    const recipeId = row["RecipeId"];
    const time = toNumber(row["Time"]);
    if (!recipeId || !time) continue;

    const recipe = {
      recipeId: String(recipeId).trim(),
      building: row["Building"] != null ? String(row["Building"]).trim() : "",
      timeSec: time,
      inputs: collectIO(row, "Input"),
      outputs: collectIO(row, "Output"),
    };
    if (recipe.outputs.length === 0) continue; // skip rows with no outputs
    recipes.push(recipe);
  }

  const payload = { recipes };
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(`✅ Wrote ${recipes.length} recipes to ${OUTPUT}`);
}

convert();
