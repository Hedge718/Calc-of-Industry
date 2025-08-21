import React, { useMemo, useState } from "react";
import { usePlanner } from "../state/store";

export default function TargetBuilder() {
  const {
    products,
    setTarget,
    build,
    targets,
    totals,
    frontierNeeds,
    compactMode,
    toggleCompactMode,
  } = usePlanner();

  // initial form state
  const [product, setProduct] = useState(targets[0]?.product ?? "");
  const [rate, setRate] = useState(() =>
    targets[0]?.ratePerMin ? String(targets[0].ratePerMin) : ""
  );

  // valid flag + parsed number
  const rateNum = Number(rate);
  const valid = product.trim().length > 0 && Number.isFinite(rateNum) && rateNum > 0;

  // submit
  const onGenerate = () => {
    if (!valid) return;
    setTarget({ product: product.trim(), ratePerMin: rateNum });
    build();
  };

  // allow Enter in either input to submit
  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") onGenerate();
  };

  // datalist options (keep it light: up to 600 visible to avoid massive DOM lists)
  const productOptions = useMemo(
    () => products.slice(0, 600),
    [products]
  );

  return (
    <aside
      className="panel"
      style={{
        // harden sidebar width so it never grows too wide
        width: 320,
        minWidth: 320,
        maxWidth: 320,
        padding: 12,
        boxSizing: "border-box",
        position: "relative",
        overflow: "auto",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>Target Builder</div>

      {/* Product selector: input + datalist (type to filter, click to pick) */}
      <label style={{ fontSize: 12 }}>Product</label>
      <input
        className="input"
        list="__products_list"
        value={product}
        onChange={(e) => setProduct(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type to search…"
        style={{ width: "100%" }}
      />
      <datalist id="__products_list">
        {productOptions.map((p) => (
          <option value={p} key={p} />
        ))}
      </datalist>

      <label style={{ fontSize: 12, marginTop: 8 }}>Required rate (units/min)</label>
      <input
        className="input"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        onKeyDown={onKeyDown}
        inputMode="decimal"
        placeholder="e.g. 144"
        style={{ width: "100%" }}
      />

      <button
        className="btn btn-primary"
        style={{ width: "100%", marginTop: 10, opacity: valid ? 1 : 0.6 }}
        onClick={onGenerate}
        disabled={!valid}
      >
        Generate / Update Chain
      </button>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn" onClick={toggleCompactMode} title="Toggle compact node cards">
          {compactMode ? "Detailed mode" : "Compact mode"}
        </button>
      </div>

      <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 12, lineHeight: 1.4 }}>
        <b>Tip:</b> The <i>Frontier requirements</i> show what you must supply to your current
        upstream frontier. Expanding branches pushes the frontier upstream and changes this list.
      </div>

      <hr style={{ margin: "12px 0", borderColor: "var(--border)" }} />

      {/* Frontier requirements */}
      <Section title="Frontier requirements (req/min)">
        {Object.keys(frontierNeeds).length === 0 ? (
          <Empty />
        ) : (
          <ul style={{ margin: "6px 0 0 16px" }}>
            {Object.entries(frontierNeeds)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, val]) => (
                <li key={name}>
                  {name}: {val}
                </li>
              ))}
          </ul>
        )}
      </Section>

      {/* Raw resources */}
      <Section title="Raw resources (req/min)" top={14}>
        {Object.keys(totals.raw).length === 0 ? (
          <Empty />
        ) : (
          <ul style={{ margin: "6px 0 0 16px" }}>
            {Object.entries(totals.raw)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, val]) => (
                <li key={name}>
                  {name}: {val}
                </li>
              ))}
          </ul>
        )}
      </Section>

      {/* Byproducts */}
      <Section title="Byproducts (prod/min)" top={14}>
        {Object.keys(totals.byproducts).length === 0 ? (
          <Empty />
        ) : (
          <ul style={{ margin: "6px 0 0 16px" }}>
            {Object.entries(totals.byproducts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, val]) => (
                <li key={name}>
                  {name}: {val}
                </li>
              ))}
          </ul>
        )}
      </Section>
    </aside>
  );
}

function Section({
  title,
  top = 0,
  children,
}: {
  title: string;
  top?: number;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: top }}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      {children}
    </section>
  );
}

function Empty() {
  return <div style={{ color: "var(--muted)" }}>—</div>;
}
