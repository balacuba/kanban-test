const B = "http://localhost:5174/planning/rest/entities/ProductSerialNumberTestHistory/search";
const wo = process.argv[2], st = process.argv[3];
if (!wo || !st) { console.log("Dung: node stagedup.mjs <WO> <cong doan>"); process.exit(1); }
const all = [];
for (let off = 0; ; off += 5000) {
  const r = await fetch(B, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    filter: { conditions: [{ property: "workOrderCode", operator: "=", value: wo },
      { group: "OR", conditions: [{ property: "preStageName", operator: "=", value: st }, { property: "stageName", operator: "=", value: st }, { property: "stageName", operator: "=", value: "R_" + st }] }] },
    sort: "id", limit: 5000, offset: off }) });
  if (!r.ok) { console.log("HTTP", r.status, await r.text()); process.exit(1); }
  const rows = await r.json(); all.push(...rows); if (rows.length < 5000) break;
}
console.log("records", all.length, "keys", Object.keys(all[0] || {}).join(","));
const pass = all.filter(x => x.preStageName === st && x.stageName !== "R_" + st);
const by = new Map(); pass.forEach(x => { if (!by.has(x.serialNumber)) by.set(x.serialNumber, []); by.get(x.serialNumber).push(x); });
console.log("pass records", pass.length, "distinct SN", by.size);
const dup = [...by].filter(([, v]) => v.length > 1);
console.log("SN pass >=2:", dup.length);
for (const [sn, v] of dup) {
  console.log("\n" + sn);
  all.filter(x => x.serialNumber === sn).forEach(x => console.log("  ", x.id, x.testTime, x.preStageName, "->", x.stageName, "result", x.testResult, x.errorCode || "", x.createdBy || ""));
}
