import React, { useMemo, useState } from "react";
import { usePlanner } from "../state/store";
import { ALL_PRODUCTS } from "../lib/buildIndex";

export default function TargetBuilder() {
  const {
    products,
    targets,
    totals,
    setTarget,
    build,
    choicesRecipe,
    choicesBuilding,
  } = usePlanner();

  // safe fallbacks for any possibly undefined store slices
  const safeTotals = totals ?? { raw: {}, byproducts: {} };
  const rawMap = safeTotals.raw ?? {};
  const byMap = safeTotals.byproducts ?? {};
  const safeProducts = (products && products.length ? products : ALL_PRODUCTS) ?? [];

  // local form state
  const [product, setProduct] = useState<string>(targets?.[0]?.product ?? "");
  const [rateStr, setRateStr] = useState<string>(
    targets?.[0]?.ratePerMin != null ? String(targets[0].ratePerMin) : ""
  );

  const currentRate = useMemo(() => {
    const v = parseFloat(rateStr);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }, [rateStr]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || currentRate <= 0) return;
    setTarget({ product, ratePerMin: currentRate, recipeId: null });
    build(); // rebuild graph
  };

  // Derived debug/meta info (defensively guarded)
  const recipePrefCount = Object.keys(choicesRecipe ?? {}).length;
  const buildingPrefCount = Object.keys(choicesBuilding ?? {}).length;

  return (
    <aside
      className="panel"
      style={{
        width: "100%",
        maxWidth: 360,             // keep panel narrow again
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      <h3 style={{ margin: "4px 0 10px 0" }}>Target Builder</h3>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8 }}>
        <label style={{ fontSize: 12, color: "var(--muted)" }}>Product</label>
        <input
          className="input"
          list="product-list"
          placeholder="Start typing…"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        />
        <datalist id="product-list">
          {safeProducts.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <label style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          Required rate (units/min)
        </label>
        <input
          className="input"
          inputMode="decimal"
          placeholder="e.g. 144"
          value={rateStr}
          onChange={(e) => setRateStr(e.target.value)}
        />

        <button type="submit" className="btn btn-primary" style={{ marginTop: 6 }}>
          Generate / Update Chain
        </button>
      </form>

      {/* Small helpers (optional) */}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          className="btn"
          title="Decrease upstream depth"
          onClick={() => {
            // no global depth anymore; user expands from nodes
            // this is kept for layout consistency – no-op
          }}
        >
          - Depth
        </button>
        <button
          className="btn"
          title="Increase upstream depth"
          onClick={() => {
            // no global depth anymore; user expands from nodes
          }}
        >
          + Depth
        </button>
      </div>

      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
        Tip: You’ll pick the building/recipe in a popup on each card. Default view shows one
        upstream hop – expand with the + buttons on any node.
      </p>

      <hr style={{ margin: "12px 0" }} />

      <h4 style={{ margin: "0 0 6px 0" }}>Totals</h4>

      <div style={{ fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginTop: 6 }}>Raw resources (req/min)</div>
        <ul style={{ margin: "6px 0 0 16px" }}>
          {Object.keys(rawMap).length === 0 && <li>—</li>}
          {Object.keys(rawMap).map((k) => (
            <li key={k}>
              {k}: {rawMap[k].toFixed ? rawMap[k].toFixed(2) : rawMap[k]}
            </li>
          ))}
        </ul>

        <div style={{ fontWeight: 700, marginTop: 10 }}>Byproducts (prod/min)</div>
        <ul style={{ margin: "6px 0 0 16px" }}>
          {Object.keys(byMap).length === 0 && <li>—</li>}
          {Object.keys(byMap).map((k) => (
            <li key={k}>
              {k}: {byMap[k].toFixed ? byMap[k].toFixed(2) : byMap[k]}
            </li>
          ))}
        </ul>
      </div>

      {/* Optional: show small debug line for prefs (safe-guarded) */}
      <div style={{ marginTop: 12, fontSize: 11, color: "var(--muted)" }}>
        Prefs — recipes: {recipePrefCount}, buildings: {buildingPrefCount}
      </div>
    </aside>
  );
}
