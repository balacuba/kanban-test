const B = "http://localhost:5174/planning/rest/entities/ProductSerialNumberTestHistory/search";
for (const sn of process.argv.slice(2)) {
  const r = await fetch(B, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    filter: { conditions: [{ property: "serialNumber", operator: "=", value: sn }] }, sort: "id", limit: 500 }) });
  const rows = await r.json();
  console.log("\n" + sn, "records", rows.length, "product", rows[0]?.productCode, "WO", [...new Set(rows.map(x=>x.workOrderCode))].join(","));
  rows.forEach(x => console.log(" ", x.id, x.testTime, (x.preStageName||"") , "->", x.stageName, "res", x.testResult, "op", x.operatorName||"", "by", x.testBy||"", "repair", x.repairTime||""));
}
