import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  useEdgesState,
  useNodesState,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { usePlanner } from "../state/store";
import { PRODUCT_INDEX } from "../lib/buildIndex";
import Modal from "./Modal";

/* ───────────────────────── Layout helper (adaptive) ───────────────────────── */

function autoLayout(nodes: Node[], edges: Edge[], opts: { compact: boolean }) {
  const compact = opts.compact;

  // Card footprint used by dagre for spacing (must match visual card)
  const width = compact ? 190 : 320;
  const height = compact ? 96 : 230;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: compact ? 16 : 40,
    ranksep: compact ? 64 : 120,
  });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => g.setNode(n.id, { width, height }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const laid = nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - width / 2, y: pos.y - height / 2 } };
  });
  return { nodes: laid, edges };
}

/* ───────────────────────── Small inline icons ───────────────────────── */

const GearIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5-3.5a7.4 7.4 0 0 0-.06-.96l2.1-1.64-2-3.46-2.52 1a7.6 7.6 0 0 0-1.68-.98l-.38-2.68h-4l-.38 2.68a7.6 7.6 0 0 0-1.68.98l-2.52-1-2 3.46 2.1 1.64c-.04.31-.06.63-.06.96 0 .33.02.65.06.96l-2.1 1.64 2 3.46 2.52-1c.52.4 1.09.74 1.68.98l.38 2.68h4l.38-2.68c.59-.24 1.16-.58 1.68-.98l2.52 1 2-3.46-2.1-1.64c.04-.31.06-.63.06-.96Z"
      fill="currentColor"
    />
  </svg>
);

/* ───────────────────────── Component ───────────────────────── */

export default function ChainGraph() {
  const {
    graphNodes,
    graphEdges,
    expandNodeOnce,
    expandBranchBy,
    swapNodeRecipe,
    focusedNodeId,
    setFocusedNode,
    toggleFocus,
    compactMode,
    toggleCompactMode,
  } = usePlanner();

  /* Focus visibility (dim non-upstream nodes) */
  const visibleSets = useMemo(() => {
    if (!focusedNodeId) return null;
    const parentsByChild = new Map<string, string[]>();
    const edgeKeyToId = new Map<string, string>();
    for (const e of graphEdges) {
      (parentsByChild.get(e.target) || parentsByChild.set(e.target, []).get(e.target)!)?.push(e.source);
      edgeKeyToId.set(`${e.source}::${e.target}`, e.id);
    }
    const keepNodeIds = new Set<string>();
    const keepEdgeIds = new Set<string>();
    const q = [focusedNodeId];
    while (q.length) {
      const child = q.shift()!;
      if (keepNodeIds.has(child)) continue;
      keepNodeIds.add(child);
      const parents = parentsByChild.get(child) || [];
      for (const p of parents) {
        const eId = edgeKeyToId.get(`${p}::${child}`);
        if (eId) keepEdgeIds.add(eId);
        q.push(p);
      }
    }
    return { keepNodeIds, keepEdgeIds };
  }, [focusedNodeId, graphEdges]);

  /* Recipe picker modal */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerNodeId, setPickerNodeId] = useState<string | null>(null);
  const [pickerBuilding, setPickerBuilding] = useState<string>("");
  const [pickerRecipeId, setPickerRecipeId] = useState<string>("");

  const openPickerFor = (nodeId: string) => {
    const n = graphNodes.find((x) => x.id === nodeId);
    if (!n) return;
    const options = PRODUCT_INDEX[n.product] ?? [];
    const byBuilding: Record<string, typeof options> = {};
    options.forEach((r) => (byBuilding[r.building] ||= []).push(r));
    const curr = options.find((r) => r.recipeId === n.recipeId);
    const b = curr?.building || Object.keys(byBuilding)[0] || "";
    setPickerNodeId(nodeId);
    setPickerBuilding(b);
    setPickerRecipeId(curr?.recipeId || byBuilding[b]?.[0]?.recipeId || "");
    setPickerOpen(true);
  };
  const applyPicker = () => {
    if (!pickerNodeId || !pickerRecipeId) return;
    setPickerOpen(false);
    const id = pickerNodeId;
    setPickerNodeId(null);
    swapNodeRecipe(id, pickerRecipeId);
  };

  /* Nodes */
  const baseNodes: Node[] = useMemo(() => {
    return graphNodes.map((n) => {
      const isRoot = n.depth === 0;
      const recipeOptions = PRODUCT_INDEX[n.product] ?? [];
      const buildingMap: Record<string, typeof recipeOptions> = {};
      recipeOptions.forEach((r) => (buildingMap[r.building] ||= []).push(r));
      const currentRecipe = recipeOptions.find((r) => r.recipeId === n.recipeId);
      const buildingsExact = n.runsPerMin;
      const buildingsCeil = Math.ceil(buildingsExact);

      const nodeOpacity =
        !visibleSets ? 1 : visibleSets.keepNodeIds.has(n.id) ? 1 : 0.15;

      /* ── Compact label ── */
      const compactLabel = (
        <div
          className="node-card"
          onDoubleClick={() => toggleFocus(n.id)}
          style={{
            width: 190,
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "var(--node-shadow)",
          }}
          title="Double-click to focus this branch"
        >
          <div className="node-head" style={{ padding: "6px 10px" }}>
            <div className="node-title" style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.1 }}>
              {n.product}
              {isRoot && (
                <span className="badge" style={{ background: "#bfdbfe", color: "#1e3a8a", marginLeft: 6, fontSize: 10 }}>
                  Target
                </span>
              )}
            </div>
            <div className="node-sub" style={{ fontSize: 10, marginTop: 2 }}>
              {n.building} · {n.timeSec}s
            </div>
          </div>
          <div className="node-body" style={{ padding: "6px 8px" }}>
            <div style={{ fontSize: 11, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span>Runs: <b>{n.runsPerMin.toFixed(2)}</b></span>
              <span>•</span>
              <span>Builds: <b>{buildingsCeil}</b></span>
            </div>
            {/* horizontal action row: gear, +1, +3 */}
            <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "center", flexWrap: "nowrap" }}>
              <IconBtn title="Change building/recipe" onClick={() => openPickerFor(n.id)}><GearIcon/></IconBtn>
              <IconBtn title="Expand +1" onClick={() => expandNodeOnce(n.id)}>+1</IconBtn>
              <IconBtn title="Expand +3" onClick={() => expandBranchBy(n.id, 3)}>+3</IconBtn>
            </div>
          </div>
        </div>
      );

      /* ── Detailed label (normal mode) ── */
      const fullLabel = (
        <div
          className="node-card"
          onDoubleClick={() => toggleFocus(n.id)}
          title="Double-click to focus this branch"
        >
          <div className="node-head">
            <div className="node-title">
              {n.product}
              {isRoot && (
                <span className="badge" style={{ background: "#bfdbfe", color: "#1e3a8a", marginLeft: 8 }}>
                  Target
                </span>
              )}
            </div>
            <div className="node-sub">{n.building} · {n.timeSec}s</div>
          </div>

          <div className="node-body">
            <div className="node-row">Runs/min: <b>{n.runsPerMin.toFixed(2)}</b></div>
            <div className="node-row">
              Buildings needed: <b>{buildingsCeil}</b>{" "}
              <span style={{ color: "var(--muted)" }}>({buildingsExact.toFixed(2)})</span>
            </div>

            <div className="node-sec">Inputs</div>
            <div className="node-list">
              {n.inputs.length === 0 ? (
                <div className="node-kv"><span>—</span><span /></div>
              ) : (
                n.inputs.map((i) => (
                  <div key={i.name} className="node-kv">
                    <span>{i.name}</span>
                    <span>
                      {i.ratePerMin.toFixed(2)}/min
                      {!PRODUCT_INDEX[i.name] && (
                        <span className="badge badge-warn" style={{ marginLeft: 6 }}>Raw</span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="node-sec">Outputs</div>
            <div className="node-list">
              {n.outputs.map((o) => (
                <div key={o.name} className="node-kv">
                  <span>{o.name}</span>
                  <span>
                    {o.ratePerMin.toFixed(2)}/min
                    {o.isTarget
                      ? <span className="badge badge-accent" style={{ marginLeft: 6 }}>Target</span>
                      : <span className="badge badge-success" style={{ marginLeft: 6 }}>Byproduct</span>}
                  </span>
                </div>
              ))}
            </div>

            {/* horizontal action row: gear, +1, +3 */}
            <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "center", flexWrap: "nowrap" }}>
              <IconBtn title="Change building/recipe" onClick={() => openPickerFor(n.id)}><GearIcon/></IconBtn>
              <IconBtn title="Expand +1" onClick={() => expandNodeOnce(n.id)}>+1</IconBtn>
              <IconBtn title="Expand +3" onClick={() => expandBranchBy(n.id, 3)}>+3</IconBtn>
            </div>

            {currentRecipe && buildingMap[currentRecipe.building]?.length > 1 && (
              <div className="node-row" style={{ marginTop: 6, color: "var(--muted)" }}>
                Multiple variants available for this building.
              </div>
            )}
          </div>
        </div>
      );

      return {
        id: n.id,
        data: { label: compactMode ? compactLabel : fullLabel },
        position: { x: 0, y: 0 },
        style: {
          border: "none",
          background: "transparent",
          color: "var(--text)",
          opacity: nodeOpacity,
        },
        draggable: true,
      } as Node;
    });
  }, [
    graphNodes,
    visibleSets,
    compactMode,
    expandNodeOnce,
    expandBranchBy,
    toggleFocus,
  ]);

  /* Edges */
  const baseEdges: Edge[] = useMemo(() => {
    return graphEdges.map((e) => {
      const show = !visibleSets || visibleSets.keepEdgeIds.has(e.id);
      const stroke = "#6b88a6";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        type: "smoothstep",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: compactMode ? 12 : 16,
          height: compactMode ? 12 : 16,
          color: stroke,
        },
        style: { strokeWidth: compactMode ? 1.1 : 1.8, stroke, opacity: show ? 1 : 0.12 },
        labelStyle: { fill: "#0f172a", fontSize: compactMode ? 9.5 : 11, opacity: show ? 1 : 0.12 },
        labelBgPadding: [3, 2],
        labelBgBorderRadius: 6,
        labelBgStyle: { fill: "#fff", fillOpacity: show ? 0.9 : 0.2, stroke: "#cbd5e1", strokeWidth: 1 },
        animated: false,
      } as Edge;
    });
  }, [graphEdges, visibleSets, compactMode]);

  /* React Flow state */
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const { nodes: laidNodes, edges: laidEdges } = autoLayout(baseNodes, baseEdges, { compact: compactMode });
    setNodes(laidNodes);
    setEdges(laidEdges);
  }, [baseNodes, baseEdges, compactMode, setNodes, setEdges]);

  /* UI */
  return (
    <div style={{ flex: 1 }}>
      <div style={{ position: "absolute", right: 12, top: 12, zIndex: 10, display: "flex", gap: 8 }}>
        <button
          className="btn"
          onClick={() => {
            const { nodes: laidNodes } = autoLayout(nodes as Node[], edges as Edge[], { compact: compactMode });
            setNodes(laidNodes);
          }}
        >
          Auto-layout
        </button>
        <button className="btn" onClick={toggleCompactMode}>
          {compactMode ? "Detailed mode" : "Compact mode"}
        </button>
        {focusedNodeId && (
          <button className="btn btn-ghost" onClick={() => setFocusedNode(null)}>
            Show all
          </button>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        nodesDraggable
        panOnDrag
        zoomOnScroll
        onPaneClick={() => setFocusedNode(null)}
      >
        <MiniMap nodeStrokeColor="#2563eb" nodeColor="#93c5fd" maskColor="rgba(30, 41, 59, 0.1)" />
        <Controls />
        <Background variant="dots" color="#cbd5e1" gap={compactMode ? 12 : 18} size={1} />
      </ReactFlow>

      {/* Modal: building / recipe picker */}
      <Modal
        open={pickerOpen}
        title="Pick building / recipe"
        onClose={() => setPickerOpen(false)}
        footer={
          <>
            <button className="btn" onClick={() => setPickerOpen(false)} type="button">
              Cancel
            </button>
            <button className="btn btn-primary" onClick={applyPicker} disabled={!pickerRecipeId} type="button">
              Apply
            </button>
          </>
        }
      >
        {pickerNodeId ? (
          (() => {
            const n = graphNodes.find((x) => x.id === pickerNodeId);
            if (!n) return <div style={{ padding: 12, color: "var(--muted)" }}>Node not found.</div>;
            const options = PRODUCT_INDEX[n.product] ?? [];
            const byBuilding: Record<string, typeof options> = {};
            options.forEach((r) => (byBuilding[r.building] ||= []).push(r));
            const buildings = Object.keys(byBuilding);

            return (
              <div className="modal-cards">
                {buildings.map((b) => {
                  const variants = byBuilding[b];
                  const checked = pickerBuilding === b;
                  const active = checked
                    ? variants.find((v) => v.recipeId === pickerRecipeId) || variants[0]
                    : variants[0];

                  return (
                    <label key={b} className="panel" style={{ padding: 12, cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 800 }}>{b}</div>
                        <input
                          type="radio"
                          name="nodeBuilding"
                          checked={checked}
                          onChange={() => {
                            setPickerBuilding(b);
                            setPickerRecipeId(variants[0]?.recipeId ?? "");
                          }}
                        />
                      </div>

                      <div className="node-sub" style={{ marginTop: 4 }}>
                        {variants.length > 1 ? `${variants.length} recipe variants` : `${active?.timeSec ?? "-"}s`}
                      </div>

                      {active && (
                        <div className="node-row" style={{ marginTop: 4, color: "var(--muted)" }}>
                          {active.timeSec}s
                        </div>
                      )}

                      <div className="node-row" style={{ marginTop: 8, fontWeight: 700 }}>
                        Inputs
                      </div>
                      <div className="node-list">
                        {(active?.inputs?.length ?? 0) === 0 ? (
                          <div>—</div>
                        ) : (
                          active!.inputs.map((i) => (
                            <div key={i.name}>
                              <span>{i.name}</span>
                              <span>{i.qtyPerCycle}/cy</span>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="node-row" style={{ marginTop: 8, fontWeight: 700 }}>
                        Outputs
                      </div>
                      <div className="node-list">
                        {active?.outputs?.map((o) => (
                          <div key={o.name}>
                            <span>{o.name}</span>
                            <span>{o.qtyPerCycle}/cy</span>
                          </div>
                        ))}
                      </div>

                      {checked && variants.length > 1 && (
                        <select
                          className="node-select-variant"
                          style={{ marginTop: 10 }}
                          value={pickerRecipeId}
                          onChange={(e) => setPickerRecipeId(e.target.value)}
                          title="Choose a variant for this building"
                        >
                          {variants.map((v) => (
                            <option key={v.recipeId} value={v.recipeId}>
                              {v.recipeId} • {v.timeSec}s
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  );
                })}
              </div>
            );
          })()
        ) : (
          <div style={{ padding: 12, color: "var(--muted)" }}>No node selected.</div>
        )}
      </Modal>
    </div>
  );
}

/* ───────────────────────── Tiny icon button (fixed size; horizontal row) ───────────────────────── */

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      className="btn"
      title={title}
      onClick={onClick}
      style={{
        minWidth: 36,
        height: 28,
        padding: "0 8px",
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
      }}
    >
      {typeof children === "string" ? <span style={{ fontSize: 12 }}>{children}</span> : children}
    </button>
  );
}
