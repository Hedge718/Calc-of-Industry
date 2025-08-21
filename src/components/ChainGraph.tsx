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

// ---- Adaptive auto-layout (compact vs detailed) ------------------------
function autoLayout(
  nodes: Node[],
  edges: Edge[],
  opts: { compact: boolean }
) {
  const compact = opts.compact;

  // Card footprint (must match the visual we render below)
  const width = compact ? 220 : 320;
  const height = compact ? 120 : 260;

  // Dagre graph spacing
  const nodesep = compact ? 24 : 56;
  const ranksep = compact ? 80 : 160;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep, ranksep });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => g.setNode(n.id, { width, height }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const laid = nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      // center alignment
      position: { x: pos.x - width / 2, y: pos.y - height / 2 },
    };
  });

  return { nodes: laid, edges };
}

export default function ChainGraph() {
  const {
    graphNodes,
    graphEdges,
    expandNodeOnce,
    expandBranchBy,
    expandBranchAll,
    collapseBranch,
    swapNodeRecipe,
    focusedNodeId,
    setFocusedNode,
    toggleFocus,
    compactMode,
    toggleCompactMode,
  } = usePlanner();

  // ------------ Focus Mode: compute upstream visibility sets ------------
  const visibleSets = useMemo(() => {
    if (!focusedNodeId) return null;

    const parentsByChild = new Map<string, string[]>();
    const edgeKeyToId = new Map<string, string>();

    for (const e of graphEdges) {
      const arr = parentsByChild.get(e.target);
      if (arr) arr.push(e.source);
      else parentsByChild.set(e.target, [e.source]);
      edgeKeyToId.set(`${e.source}::${e.target}`, e.id);
    }

    const keepNodeIds = new Set<string>();
    const keepEdgeIds = new Set<string>();

    const q: string[] = [focusedNodeId];
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

  // --------------------- Recipe picker -----------------------
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

  // ---------------------- Build React Flow nodes ------------------------
  const baseNodes: Node[] = useMemo(() => {
    return graphNodes.map((n) => {
      const isRoot = n.depth === 0;
      const recipeOptions = PRODUCT_INDEX[n.product] ?? [];

      // group by building
      const buildingMap: Record<string, typeof recipeOptions> = {};
      recipeOptions.forEach((r) => {
        (buildingMap[r.building] ||= []).push(r);
      });

      const currentRecipe = recipeOptions.find((r) => r.recipeId === n.recipeId);
      const buildingHasVariants =
        currentRecipe && buildingMap[currentRecipe.building]?.length > 1;

      const buildingsExact = n.runsPerMin;
      const buildingsCeil = Math.ceil(buildingsExact);

      // opacity if focused
      const nodeOpacity =
        !visibleSets ? 1 : visibleSets.keepNodeIds.has(n.id) ? 1 : 0.15;

      // ------- COMPACT LABEL -------
      const labelCompact = (
        <div
          className="node-card"
          onDoubleClick={() => toggleFocus(n.id)}
          title="Double-click to focus this branch"
          style={{
            width: 220,
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "var(--node-shadow)",
          }}
        >
          <div className="node-head" style={{ padding: "6px 10px" }}>
            <div
              className="node-title"
              style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.1 }}
            >
              {n.product}
              {isRoot && (
                <span
                  className="badge"
                  style={{
                    background: "#bfdbfe",
                    color: "#1e3a8a",
                    marginLeft: 6,
                    fontSize: 10,
                  }}
                >
                  Target
                </span>
              )}
            </div>
            <div
              className="node-sub"
              style={{ fontSize: 11, marginTop: 2, whiteSpace: "nowrap" }}
            >
              {n.building} · {n.timeSec}s
            </div>
          </div>
          <div className="node-body" style={{ padding: "8px 10px" }}>
            <div
              className="node-row"
              style={{ fontSize: 12, display: "flex", gap: 6, flexWrap: "wrap" }}
            >
              <span>Runs: <b>{n.runsPerMin.toFixed(2)}</b></span>
              <span>•</span>
              <span>Builds: <b>{buildingsCeil}</b></span>
            </div>

            <div
              className="node-actions"
              style={{ display: "flex", gap: 6, marginTop: 8 }}
            >
              <button className="node-btn" style={{ padding: 6 }} onClick={() => openPickerFor(n.id)}>Change…</button>
              <button className="node-btn" style={{ padding: 6 }} onClick={() => expandNodeOnce(n.id)}>+1</button>
              {[2, 3].map((k) => (
                <button
                  key={k}
                  className="node-btn"
                  style={{ padding: 6 }}
                  onClick={() => expandBranchBy(n.id, k)}
                  title={`Expand branch by ${k}`}
                >
                  +{k}
                </button>
              ))}
              <button className="node-btn" style={{ padding: 6 }} onClick={() => expandBranchAll(n.id)}>All</button>
            </div>
          </div>
        </div>
      );

      // ------- DETAILED LABEL -------
      const labelFull = (
        <div
          className="node-card"
          onDoubleClick={() => toggleFocus(n.id)}
          title="Double-click to focus this branch"
        >
          <div className="node-head">
            <div className="node-title">
              {n.product}{" "}
              {isRoot && (
                <span
                  className="badge"
                  style={{ background: "#bfdbfe", color: "#1e3a8a", marginLeft: 8 }}
                >
                  Target
                </span>
              )}
            </div>
            <div className="node-sub">
              {n.building} · {n.timeSec}s
            </div>
          </div>

          <div className="node-body">
            <div className="node-row">
              Runs/min: <b>{n.runsPerMin.toFixed(2)}</b>
            </div>
            <div className="node-row">
              Buildings needed: <b>{buildingsCeil}</b>{" "}
              <span style={{ color: "var(--muted)" }}>({buildingsExact.toFixed(2)})</span>
            </div>

            <div className="node-sec">Inputs</div>
            <div className="node-list">
              {n.inputs.length === 0 ? (
                <div className="node-kv">
                  <span>—</span>
                  <span />
                </div>
              ) : (
                n.inputs.map((i) => (
                  <div key={i.name} className="node-kv">
                    <span>{i.name}</span>
                    <span>
                      {i.ratePerMin.toFixed(2)}/min
                      {!PRODUCT_INDEX[i.name] && (
                        <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                          Raw
                        </span>
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
                    {o.isTarget ? (
                      <span className="badge badge-accent" style={{ marginLeft: 6 }}>
                        Target
                      </span>
                    ) : (
                      <span className="badge badge-success" style={{ marginLeft: 6 }}>
                        Byproduct
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="node-actions" style={{ gap: 6 }}>
              <button className="node-btn" onClick={() => expandNodeOnce(n.id)} title="Expand this product by 1 hop">
                Expand +1
              </button>
              <button className="node-btn" onClick={() => openPickerFor(n.id)} title="Choose building/variant">
                Change…
              </button>
              <button className="node-btn" onClick={() => expandBranchBy(n.id, 2)}>+2</button>
              <button className="node-btn" onClick={() => expandBranchBy(n.id, 3)}>+3</button>
              <button className="node-btn" onClick={() => expandBranchAll(n.id)}>All</button>
              <button className="node-btn" onClick={() => collapseBranch(n.id)}>Collapse</button>
            </div>

            {buildingHasVariants && (
              <div className="node-row" style={{ marginTop: 6, color: "var(--muted)" }}>
                This building has multiple variants.
              </div>
            )}
          </div>
        </div>
      );

      return {
        id: n.id,
        data: { label: compactMode ? labelCompact : labelFull },
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
    expandNodeOnce,
    expandBranchBy,
    expandBranchAll,
    collapseBranch,
    toggleFocus,
    visibleSets,
    compactMode,
  ]);

  const baseEdges: Edge[] = useMemo(() => {
    return graphEdges.map((e) => {
      const edgeOpacity =
        !visibleSets ? 1 : visibleSets.keepEdgeIds.has(e.id) ? 1 : 0.1;

      const stroke = "#6b88a6";
      const strokeWidth = compactMode ? 1.25 : 2;

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        type: "smoothstep",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: compactMode ? 14 : 18,
          height: compactMode ? 14 : 18,
          color: stroke,
        },
        style: { strokeWidth, stroke, opacity: edgeOpacity },
        labelStyle: {
          fill: "#0f172a",
          fontSize: compactMode ? 10 : 11,
          opacity: edgeOpacity,
        },
        labelBgPadding: [4, 3],
        labelBgBorderRadius: 6,
        labelBgStyle: {
          fill: "#ffffff",
          fillOpacity: 0.9 * edgeOpacity,
          stroke: "#cbd5e1",
          strokeWidth: 1,
        },
        animated: false,
      } as Edge;
    });
  }, [graphEdges, visibleSets, compactMode]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const { nodes: laidNodes, edges: laidEdges } = autoLayout(baseNodes, baseEdges, {
      compact: compactMode,
    });
    setNodes(laidNodes);
    setEdges(laidEdges);
  }, [baseNodes, baseEdges, compactMode, setNodes, setEdges]);

  return (
    <div style={{ flex: 1 }}>
      <div style={{ position: "absolute", right: 12, top: 12, zIndex: 10, display: "flex", gap: 8 }}>
        <button
          className="btn"
          style={{ width: "auto" }}
          onClick={() => {
            const { nodes: laidNodes } = autoLayout(nodes as Node[], edges as Edge[], {
              compact: compactMode,
            });
            setNodes(laidNodes);
          }}
          title="Re-run auto layout"
        >
          Auto-layout
        </button>

        <button className="btn" onClick={toggleCompactMode} title="Toggle compact node cards">
          {compactMode ? "Detailed mode" : "Compact mode"}
        </button>

        {focusedNodeId && (
          <button
            className="btn btn-ghost"
            onClick={() => setFocusedNode(null)}
            title="Show entire graph"
          >
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
        onPaneClick={() => setFocusedNode(null)}  // click background to clear focus
      >
        <MiniMap
          nodeStrokeColor="#2563eb"
          nodeColor="#93c5fd"
          maskColor="rgba(30, 41, 59, 0.1)"
        />
        <Controls />
        <Background variant="dots" color="#cbd5e1" gap={compactMode ? 14 : 18} size={1} />
      </ReactFlow>

      {/* Building/variant picker */}
      <Modal
        open={pickerOpen}
        title="Pick building / recipe"
        onClose={() => setPickerOpen(false)}
        footer={
          <>
            <button className="btn" onClick={() => setPickerOpen(false)} type="button">
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={applyPicker}
              disabled={!pickerRecipeId}
              type="button"
            >
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
