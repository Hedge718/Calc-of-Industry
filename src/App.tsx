import TargetBuilder from "./components/TargetBuilder";
import ChainGraph from "./components/ChainGraph";
import DebugHUD from "./components/DebugHUD";



export default function App() {
  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", background: "#f7f7f8", color: "#111" }}>
      <TargetBuilder />
      <ChainGraph />
    </div>
  );
}
