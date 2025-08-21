import { create } from "zustand";
import type { Recipe } from "../types";
import {
  ALL_PRODUCTS,
  RECIPES,
  PRODUCT_INDEX,
  outputRatePerMin,
} from "../lib/buildIndex";

// ========== Types ==========
export type NodeIO = { name: string; ratePerMin: number };

export type GraphNode = {
  id: string;                 // stable: product::recipeId
  product: string;
  recipeId: string;
  building: string;
  runsPerMin: number;
  timeSec: number;
  inputs: NodeIO[];
  outputs: (NodeIO & { isTarget: boolean })[];
  depth: number;
};

export type GraphEdge = { id: string; source: string; target: string; label: string };

type Target = { product: string; ratePerMin: number; recipeId?: string | null };

type Totals = {
  raw: Record<string, number>;
  byproducts: Record<string, number>;
};

// ========== State ==========
type State = {
  products: string[];
  recipes: Recipe[];
  targets: Target[];

  // user preferences
  choicesRecipe: Record<string, string | null>;   // exact recipe picked for product
  choicesBuilding: Record<string, string>;        // preferred building for product

  // per-product expansion counters (clicking "Expand upstream" adds 1)
  expandedByProduct: Record<string, number>;

  // graph
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  totals: Totals;

  // NEW: frontier needs (inputs of leaf nodes per minute)
  frontierNeeds: Record<string, number>;

  // NEW: focus & compact modes
  focusedNodeId: string | null;
  compactMode: boolean;

  setFocusedNode: (id: string | null) => void;
  toggleFocus: (id: string) => void;
  setCompactMode: (on: boolean) => void;
  toggleCompactMode: () => void;

  // actions
  setTarget: (t: Target) => void;
  setChoiceRecipe: (product: string, recipeId: string | null) => void;
  setChoiceBuilding: (product: string, building: string) => void;

  build: () => void;                             // builds current graph honoring expansions
  resetExpansions: () => void;                   // clear all per-product expansions
  expandNodeOnce: (nodeId: string) => void;      // +1 hop for node.product then rebuild
  expandBranchBy: (nodeId: string, hops: number) => void; // expand *upstream branch* by N
  expandBranchAll: (nodeId: string) => void;     // expand upstream branch to raw (large N)
  collapseBranch: (nodeId: string) => void;      // collapse upstream branch to 0
  swapNodeRecipe: (nodeId: string, recipeId: string) => void;

  recomputeTotals: () => void;
};

// ========== Helpers ==========
function nodeIdFor(product: string, recipeId: string) {
  return `${product}::${recipeId}`;
}

function makeNode(
  recipe: Recipe,
  targetProduct: string,
  requiredRatePerMin: number,
  depth = 0
): GraphNode {
  const rate = outputRatePerMin(recipe, targetProduct);
  const runs = rate ? requiredRatePerMin / rate : 0;

  const inputs: NodeIO[] = recipe.inputs.map((i) => ({
    name: i.name,
    ratePerMin: runs * i.qtyPerCycle,
  }));

  const outputs = recipe.outputs.map((o) => ({
    name: o.name,
    ratePerMin: runs * (o.qtyPerCycle / recipe.timeSec) * 60,
    isTarget: o.name.trim().toLowerCase() === targetProduct.trim().toLowerCase(),
  }));

  return {
    id: nodeIdFor(targetProduct, recipe.recipeId),
    product: targetProduct,
    recipeId: recipe.recipeId,
    building: recipe.building,
    runsPerMin: runs,
    timeSec: recipe.timeSec,
    inputs,
    outputs,
    depth,
  };
}

function computeTotals(nodes: GraphNode[]): Totals {
  const raw: Record<string, number> = {};
  const byproducts: Record<string, number> = {};
  for (const n of nodes) {
    for (const i of n.inputs) {
      if (!PRODUCT_INDEX[i.name]) raw[i.name] = (raw[i.name] || 0) + i.ratePerMin;
    }
    for (const o of n.outputs) {
      if (!o.isTarget) byproducts[o.name] = (byproducts[o.name] || 0) + o.ratePerMin;
    }
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (const k in raw) raw[k] = r2(raw[k]);
  for (const k in byproducts) byproducts[k] = r2(byproducts[k]);
  return { raw, byproducts };
}

/** Inputs needed at the current frontier (sum inputs of all leaf nodes). */
function computeFrontierNeeds(nodes: GraphNode[], edges: GraphEdge[]) {
  const hasChild = new Set(edges.map((e) => e.source));
  const leaves = nodes.filter((n) => !hasChild.has(n.id));
  const needs: Record<string, number> = {};
  for (const leaf of leaves) {
    for (const i of leaf.inputs) {
      needs[i.name] = (needs[i.name] || 0) + i.ratePerMin;
    }
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (const k in needs) needs[k] = r2(needs[k]);
  return needs;
}

/** Preference order: explicit recipe -> parent building -> stored building -> default */
function pickRecipeWithPrefs(
  product: string,
  explicitRecipe: string | null | undefined,
  preferredBuilding: string | undefined,
  parentBuildingPreferred?: string
): Recipe | undefined {
  const list = PRODUCT_INDEX[product] ?? [];
  if (explicitRecipe) {
    const r = list.find((x) => x.recipeId === explicitRecipe);
    if (r) return r;
  }
  if (parentBuildingPreferred) {
    const r = list.find((x) => x.building === parentBuildingPreferred);
    if (r) return r;
  }
  if (preferredBuilding) {
    const r = list.find((x) => x.building === preferredBuilding);
    if (r) return r;
  }
  return list[0];
}

// ========== Store ==========
export const usePlanner = create<State>((set, get) => ({
  products: ALL_PRODUCTS,
  recipes: RECIPES,
  targets: [],

  choicesRecipe: {},
  choicesBuilding: {},

  expandedByProduct: {},

  graphNodes: [],
  graphEdges: [],
  totals: { raw: {}, byproducts: {} },

  frontierNeeds: {},

  // focus & compact
  focusedNodeId: null,
  compactMode: false,
  setFocusedNode: (id) => set({ focusedNodeId: id }),
  toggleFocus: (id) => set((s) => ({ focusedNodeId: s.focusedNodeId === id ? null : id })),
  setCompactMode: (on) => set({ compactMode: on }),
  toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),

  setTarget: (t) => set({ targets: [t] }),

  setChoiceRecipe: (product, recipeId) =>
    set((s) => {
      const list = PRODUCT_INDEX[product] ?? [];
      const chosen = recipeId ? list.find((r) => r.recipeId === recipeId) : undefined;
      const b = chosen?.building;
      return {
        choicesRecipe: { ...s.choicesRecipe, [product]: recipeId },
        choicesBuilding: b ? { ...s.choicesBuilding, [product]: b } : s.choicesBuilding,
      };
    }),

  setChoiceBuilding: (product, building) =>
    set((s) => ({ choicesBuilding: { ...s.choicesBuilding, [product]: building } })),

  /** Build the graph once:
   *  - Always render roots + 1 upstream hop (default collapsed view)
   *  - Then expand per-product according to `expandedByProduct` counters
   */
  build: () => {
    const s = get();
    const { targets, choicesRecipe, choicesBuilding, expandedByProduct } = s;

    if (!targets.length) {
      set({
        graphNodes: [],
        graphEdges: [],
        totals: { raw: {}, byproducts: {} },
        frontierNeeds: {},
      });
      return;
    }

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Merge identical (product, recipeId) into a single node
    const byKey = new Map<string, GraphNode>();
    const byId = new Map<string, GraphNode>();

    function ensureNode(
      product: string,
      requiredRatePerMin: number,
      depth: number,
      parentBuilding?: string
    ): GraphNode | undefined {
      const r = pickRecipeWithPrefs(product, choicesRecipe[product], choicesBuilding[product], parentBuilding);
      if (!r) return undefined;

      const key = nodeIdFor(product, r.recipeId);
      let n = byKey.get(key);
      if (!n) {
        n = makeNode(r, product, requiredRatePerMin, depth);
        byKey.set(key, n);
        byId.set(n.id, n);
        nodes.push(n);
      }
      return n;
    }

    function connect(parent: GraphNode, child: GraphNode, label: string) {
      const id = `${parent.id}=>${child.id}#${edges.length}`;
      edges.push({ id, source: parent.id, target: child.id, label });
    }

    // --- Step 1: build roots + one hop (baseline)
    for (const t of targets) {
      const root = ensureNode(t.product, t.ratePerMin, 0);
      if (!root) continue;
      for (const i of root.inputs) {
        if (!PRODUCT_INDEX[i.name]) continue; // raw
        const child = ensureNode(i.name, i.ratePerMin, 1, root.building);
        if (child) connect(root, child, i.name);
      }
    }

    // --- Step 2: seed BFS from every node using only per-product expansion counters
    type QItem = { id: string; rem: number };
    const bestRem = new Map<string, number>();
    const queue: QItem[] = [];

    for (const n of nodes) {
      const extra = expandedByProduct[n.product] ?? 0;
      if (extra > 0) {
        bestRem.set(n.id, extra);
        queue.push({ id: n.id, rem: extra });
      }
    }

    // --- Step 3: BFS expand while we have remaining hops
    while (queue.length) {
      const { id, rem } = queue.shift()!;
      if (rem <= 0) continue;
      const parent = byId.get(id);
      if (!parent) continue;

      const effParent = Math.max(rem, expandedByProduct[parent.product] ?? 0);

      for (const i of parent.inputs) {
        if (!PRODUCT_INDEX[i.name]) continue;

        const child = ensureNode(i.name, i.ratePerMin, parent.depth + 1, parent.building);
        if (!child) continue;

        if (!edges.some((e) => e.source === parent.id && e.target === child.id)) {
          connect(parent, child, i.name);
        }

        const nextRem = effParent - 1;
        const childExtra = expandedByProduct[child.product] ?? 0;
        const childAllowance = Math.max(nextRem, childExtra);

        if (childAllowance > 0) {
          const prev = bestRem.get(child.id) ?? -1;
          if (childAllowance > prev) {
            bestRem.set(child.id, childAllowance);
            queue.push({ id: child.id, rem: childAllowance });
          }
        }
      }
    }

    set({
      graphNodes: nodes,
      graphEdges: edges,
      totals: computeTotals(nodes),
      frontierNeeds: computeFrontierNeeds(nodes, edges),
    });
  },

  resetExpansions: () => set({ expandedByProduct: {} }),

  expandNodeOnce: (nodeId) => {
    const s = get();
    const node = s.graphNodes.find((n) => n.id === nodeId);
    if (!node) return;
    const cur = s.expandedByProduct[node.product] ?? 0;
    set({ expandedByProduct: { ...s.expandedByProduct, [node.product]: cur + 1 } });
    s.build();
  },

  expandBranchBy: (nodeId, hops) => {
    const s = get();
    if (hops <= 0) return;
    const nodeById = new Map(s.graphNodes.map((n) => [n.id, n] as const));
    const parentsByChild = new Map<string, string[]>();
    for (const e of s.graphEdges) {
      const list = parentsByChild.get(e.target);
      if (list) list.push(e.source);
      else parentsByChild.set(e.target, [e.source]);
    }

    const next = { ...s.expandedByProduct };
    const best = new Map<string, number>();
    const q: Array<{ id: string; rem: number }> = [{ id: nodeId, rem: hops }];

    while (q.length) {
      const { id, rem } = q.shift()!;
      const n = nodeById.get(id);
      if (!n) continue;

      const prev = best.get(id) ?? -1;
      if (rem > prev) {
        best.set(id, rem);
        const curAllow = next[n.product] ?? 0;
        if (rem > curAllow) next[n.product] = rem;
        if (rem - 1 > 0) {
          const parents = parentsByChild.get(id) || [];
          parents.forEach((p) => q.push({ id: p, rem: rem - 1 }));
        }
      }
    }

    set({ expandedByProduct: next });
    s.build();
  },

  expandBranchAll: (nodeId) => {
    get().expandBranchBy(nodeId, 50);
  },

  collapseBranch: (nodeId) => {
    const s = get();
    const nodeById = new Map(s.graphNodes.map((n) => [n.id, n] as const));
    const parentsByChild = new Map<string, string[]>();
    for (const e of s.graphEdges) {
      const list = parentsByChild.get(e.target);
      if (list) list.push(e.source);
      else parentsByChild.set(e.target, [e.source]);
    }

    const toZero = new Set<string>(); // product names to zero out
    const seen = new Set<string>();
    const q: string[] = [nodeId];
    while (q.length) {
      const id = q.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const n = nodeById.get(id);
      if (n) {
        toZero.add(n.product);
        const parents = parentsByChild.get(id) || [];
        parents.forEach((p) => q.push(p));
      }
    }

    const next = { ...s.expandedByProduct };
    for (const p of toZero) next[p] = 0;

    set({ expandedByProduct: next });
    s.build();
  },

  swapNodeRecipe: (nodeId, recipeId) => {
    const s = get();
    const node = s.graphNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const list = PRODUCT_INDEX[node.product] ?? [];
    const chosen = list.find((r) => r.recipeId === recipeId);
    const building = chosen?.building;

    set({
      choicesRecipe: { ...s.choicesRecipe, [node.product]: recipeId },
      choicesBuilding: building ? { ...s.choicesBuilding, [node.product]: building } : s.choicesBuilding,
    });

    s.build();
  },

  recomputeTotals: () => {
    const { graphNodes, graphEdges } = get();
    set({
      totals: computeTotals(graphNodes),
      frontierNeeds: computeFrontierNeeds(graphNodes, graphEdges),
    });
  },
}));
