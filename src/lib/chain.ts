import { nanoid } from "nanoid/non-secure";
import { PRODUCT_INDEX, RECIPES, outputsRatePerMin } from "./buildIndex";
import type { ChainGraph, ChainNode, ProductIndex, ProductChoice, Recipe } from "../types";

function getRecipe(recipeId: string): Recipe | undefined {
  return RECIPES.find(r => r.recipeId === recipeId);
}

function pickRecipeForProduct(product: string, chosenRecipeId?: string | null): Recipe | undefined {
  if (chosenRecipeId) return getRecipe(chosenRecipeId);
  const list = PRODUCT_INDEX[product];
  if (!list || !list.length) return undefined;
  // default to first
  return getRecipe(list[0].recipeId);
}

function makeNodeId() { return nanoid(8); }

export function buildInitialChain(targets: ProductChoice[], choices: Record<string, string | null>): ChainGraph {
  const graph: ChainGraph = { nodes: [], edges: [] };
  for (const t of targets) {
    const recipe = pickRecipeForProduct(t.product, choices[t.product]);
    if (!recipe) continue;

    const node = recipeToNode(recipe, t.product, t.ratePerMin);
    graph.nodes.push(node);
    // one upstream hop by default
    expandNode(graph, node.id, 1, choices, new Set());
  }
  linkEdges(graph);
  return graph;
}

export function expandNode(graph: ChainGraph, nodeId: string, levels: number, choices: Record<string,string|null>, seen: Set<string>) {
  if (levels <= 0) return;
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) return;

  for (const input of node.inputs) {
    const craftable = !!PRODUCT_INDEX[input.name];
    if (!craftable) continue;

    // avoid simple cycles product->...->product
    const cycleKey = `${node.product}->${input.name}`;
    if (seen.has(cycleKey)) continue;
    seen.add(cycleKey);

    // create child only if not exists
    if (!node.children[input.name]) {
      const childRecipe = pickRecipeForProduct(input.name, choices[input.name]);
      if (!childRecipe) continue;
      const child = recipeToNode(childRecipe, input.name, input.ratePerMin);
      graph.nodes.push(child);
      node.children[input.name] = child.id;
    }
  }
  node.expandedDepth = Math.max(node.expandedDepth, node.depth + 1);
  linkEdges(graph);
  if (levels > 1) {
    for (const [iname, cid] of Object.entries(node.children)) {
      if (cid) expandNode(graph, cid, levels - 1, choices, seen);
    }
  }
}

function recipeToNode(recipe: Recipe, targetOutput: string, requiredRatePerMin: number): ChainNode {
  const outRatePerMin = outputsRatePerMin(recipe, targetOutput);
  const runsPerMin = outRatePerMin === 0 ? 0 : requiredRatePerMin / outRatePerMin;

  const inputs = recipe.inputs.map(i => ({
    name: i.name,
    ratePerMin: runsPerMin * i.qtyPerCycle,
  }));

  const outputs = recipe.outputs.map(o => ({
    name: o.name,
    ratePerMin: runsPerMin * (o.qtyPerCycle / recipe.timeSec) * 60,
    isTarget: o.name === targetOutput,
  }));

  const id = makeNodeId();
  return {
    id,
    product: targetOutput,
    recipeId: recipe.recipeId,
    building: recipe.building,
    timeSec: recipe.timeSec,
    runsPerMin,
    inputs,
    outputs,
    depth: 0,
    expandedDepth: 1,
    children: {},
  };
}

function linkEdges(graph: ChainGraph) {
  graph.edges = [];
  for (const parent of graph.nodes) {
    for (const [iname, childId] of Object.entries(parent.children)) {
      if (!childId) continue;
      graph.edges.push({
        id: `${parent.id}-${childId}`,
        from: parent.id,
        to: childId,
        label: iname,
      });
    }
  }
}

export function productHasMultipleRecipes(product: string, idx: ProductIndex = {} as any) {
  const list = (idx as any).ALL_PRODUCTS ? (idx as any)[product] : undefined;
  return list ? list.length > 1 : false;
}
