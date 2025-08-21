import { usePlanner } from "../state/store";

export default function DebugHUD() {
  const { globalDepth, expandedByProduct } = usePlanner();
  return (
    <div style={{
      position: "fixed", bottom: 12, right: 12, zIndex: 1000,
      background: "rgba(15,23,42,.9)", color: "#fff",
      padding: "10px 12px", borderRadius: 10, fontSize: 12,
      maxWidth: 360, boxShadow: "0 8px 24px rgba(0,0,0,.25)"
    }}>
      <div style={{fontWeight:800, marginBottom:6}}>Debug</div>
      <div>Global depth: <b>{globalDepth}</b></div>
      <div style={{marginTop:6}}>expandedByProduct:</div>
      <pre style={{margin:0, whiteSpace:"pre-wrap"}}>
        {JSON.stringify(expandedByProduct, null, 2)}
      </pre>
    </div>
  );
}
