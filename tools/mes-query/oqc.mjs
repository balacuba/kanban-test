const B = "http://localhost:5174/planning/rest/entities/ProductSerialNumberTestHistory/search";
const day = process.argv[2] || "2026-11-25";
const r = await fetch(B, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
  filter: { conditions: [{ property: "stageName", operator: "=", value: "R_OQC" },
    { property: "testTime", operator: ">=", value: day+"T00:00:00" }, { property: "testTime", operator: "<", value: day+"T23:59:59" }] }, sort: "id", limit: 2000 }) });
const rows = await r.json();
console.log("R_OQC records", rows.length);
const by = {};
rows.forEach(x => { const k = x.workOrderCode + " err=" + (x.errorCode ? "Y" : "empty") + " sn=" + (x.serialNumber ? "Y" : "empty") + " qa=" + (x.qaNumber ? "Y":"empty"); by[k] = (by[k]||0)+1; });
console.log(by);
rows.slice(0,5).forEach(x => console.log(JSON.stringify(x)));
