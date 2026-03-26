export async function getHeatmap(){ const r = await fetch("http://127.0.0.1:8000/heatmap"); return r.json(); }
