import React from "react";

export default function Controls({ target, setTarget, since, setSince, targets }: any) {
  return <div style={{display:"flex", gap:12, marginBottom:12}}>
    <select value={since} onChange={e => setSince(e.target.value)}>
      <option value="900000">Last 15m</option>
      <option value="3600000">Last 1h</option>
      <option value="86400000">Last 24h</option>
    </select>
    <select value={target} onChange={e => setTarget(e.target.value)}>
      <option value="">All targets</option>
      {targets.map((t: string) => <option key={t} value={t}>{t}</option>)}
    </select>
  </div>;
}
