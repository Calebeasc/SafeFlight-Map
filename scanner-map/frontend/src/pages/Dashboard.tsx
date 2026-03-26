import React, { useEffect, useState } from "react";
import Controls from "../components/Controls";
import MapView from "../components/MapView";

export default function Dashboard(){
  const [geo, setGeo] = useState<any>({type:"FeatureCollection", features:[]});
  const [targets, setTargets] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [since, setSince] = useState("3600000");

  useEffect(() => { fetch("http://127.0.0.1:8000/targets").then(r=>r.json()).then(d=>setTargets([...(d.wifi||[]), ...(d.ble||[])])); }, []);
  useEffect(() => {
    const now = Date.now();
    const qs = new URLSearchParams({ since: String(now - Number(since)) });
    if (target) qs.set("target", target);
    fetch(`http://127.0.0.1:8000/heatmap?${qs.toString()}`).then(r=>r.json()).then(setGeo);
  }, [target, since]);

  return <div>
    <h1>Scanner Map Dashboard</h1>
    <Controls target={target} setTarget={setTarget} since={since} setSince={setSince} targets={targets} />
    <MapView geojson={geo} />
  </div>;
}
