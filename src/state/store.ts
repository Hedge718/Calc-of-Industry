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
  id: string; // stable: product::recipeId
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

type State = {
  products: string[];
  recipes: Recipe[];
  targets: Target[];

  // user preferences
  choicesRecipe: Record<string, string | null>;
  choicesBuilding: Record<string, string>;

  // per-node expansion counters
  expandedByNode: Record<string, number>;

  // graph
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  totals: Totals;

  // focus/compact
  focusedNodeId: string | null;
  compactMode: boolean;

  // actions
  setTarget: (t: Target) => void;
  setChoiceRecipe: (product: string, recipeId: string | null) => void;
  setChoiceBuilding: (product: string, building: string) => void;

  build: () => void;
  resetExpansions: () => void;

  expandNodeOnce: (nodeId: string) => void;
  expandBranchBy: (nodeId: string, hops: number) => void;

  swapNodeRecipe: (nodeId: string, recipeId: string) => void;

  setFocusedNode: (id: string | null) => void;
  toggleFocus: (id: string) => void;
  toggleCompactMode: () => void;

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

  // NOTE: keep it defined even across HMR
  expandedByNode: {},

  graphNodes: [],
  graphEdges: [],
  totals: { raw: {}, byproducts: {} },

  focusedNodeId: null,
  compactMode: false,

  setTarget: (t) => set({ targets: [t] }),

  setChoiceRecipe: (product, recipeId) =>
    set((s) => {
      const list = PRODUCT_INDEX[product] ?? [];
      const chosen = recipeId ? list.find((r) => r.recipeId === recipeId) : undefined;
      const b = chosen?.building;
      return {
        choicesRecipe: { ...(s.choicesRecipe || {}), [product]: recipeId },
        choicesBuilding: b
          ? { ...(s.choicesBuilding || {}), [product]: b }
          : (s.choicesBuilding || {}),
      };
    }),

  setChoiceBuilding: (product, building) =>
    set((s) => ({ choicesBuilding: { ...(s.choicesBuilding || {}), [product]: building } })),

  build: () => {
    const s = get();
    const { targets, choicesRecipe, choicesBuilding } = s;
    const expandedByNode = s.expandedByNode || {};

    if (!targets || targets.length === 0) {
      set({ graphNodes: [], graphEdges: [], totals: { raw: {}, byproducts: {} } });
      return;
    }

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    const byKey = new Map<string, GraphNode>();
    const byId = new Map<string, GraphNode>();

    function ensureNode(
      product: string,
      requiredRatePerMin: number,
      depth: number,
      parentBuilding?: string
    ): GraphNode | undefined {
      const r = pickRecipeWithPrefs(
        product,
        choicesRecipe?.[product],
        choicesBuilding?.[product],
        parentBuilding
      );
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

    // roots + one hop
    for (const t of targets) {
      const root = ensureNode(t.product, t.ratePerMin, 0);
      if (!root) continue;
      for (const i of root.inputs) {
        if (!PRODUCT_INDEX[i.name]) continue;
        const child = ensureNode(i.name, i.ratePerMin, 1, root.building);
        if (child) connect(root, child, i.name);
      }
    }

    // BFS using per-node budgets
    type QItem = { id: string; rem: number };
    const bestRem = new Map<string, number>();
    const queue: QItem[] = [];

    for (const n of nodes) {
      const extra = expandedByNode[n.id] ?? 0;
      if (extra > 0) {
        bestRem.set(n.id, extra);
        queue.push({ id: n.id, rem: extra });
      }
    }

    while (queue.length) {
      const { id, rem } = queue.shift()!;
      if (rem <= 0) continue;
      const parent = byId.get(id);
      if (!parent) continue;

      const effParent = Math.max(rem, expandedByNode[parent.id] ?? 0);

      for (const i of parent.inputs) {
        if (!PRODUCT_INDEX[i.name]) continue;

        const child = ensureNode(i.name, i.ratePerMin, parent.depth + 1, parent.building);
        if (!child) continue;

        if (!edges.some((e) => e.source === parent.id && e.target === child.id)) {
          connect(parent, child, i.name);
        }

        const nextRem = effParent - 1;
        const childExtra = expandedByNode[child.id] ?? 0;
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
    });
  },

  resetExpansions: () => set({ expandedByNode: {} }),

  expandNodeOnce: (nodeId) => {
    const s = get();
    const map = s.expandedByNode || {};
    const cur = map[nodeId] ?? 0;
    set({ expandedByNode: { ...map, [nodeId]: cur + 1 } });
    s.build();
  },

  expandBranchBy: (nodeId, hops) => {
    const s = get();
    const map = s.expandedByNode || {};
    const cur = map[nodeId] ?? 0;
    set({ expandedByNode: { ...map, [nodeId]: cur + Math.max(1, hops) } });
    s.build();
  },

  swapNodeRecipe: (nodeId, recipeId) => {
    const s = get();
    const node = s.graphNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const list = PRODUCT_INDEX[node.product] ?? [];
    const chosen = list.find((r) => r.recipeId === recipeId);
    const building = chosen?.building;

    const prevBudget = (s.expandedByNode || {})[nodeId] ?? 0;
    const newId = nodeIdFor(node.product, recipeId);

    const nextExpanded = { ...(s.expandedByNode || {}) };
    if (prevBudget > 0) nextExpanded[newId] = Math.max(prevBudget, nextExpanded[newId] ?? 0);
    delete nextExpanded[nodeId];

    set({
      choicesRecipe: { ...(s.choicesRecipe || {}), [node.product]: recipeId },
      choicesBuilding: building ? { ...(s.choicesBuilding || {}), [node.product]: building } : (s.choicesBuilding || {}),
      expandedByNode: nextExpanded,
    });

    s.build();
  },

  setFocusedNode: (id) => set({ focusedNodeId: id }),
  toggleFocus: (id) =>
    set((st) => ({ focusedNodeId: st.focusedNodeId === id ? null : id })),
  toggleCompactMode: () => set((st) => ({ compactMode: !st.compactMode })),

  recomputeTotals: () => {
    const { graphNodes } = get();
    set({ totals: computeTotals(graphNodes) });
  },
}));
