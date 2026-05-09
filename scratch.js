const start = Date.now();
let arr = Array(10000).fill({ typed: "", completed: false, skipped: false });
for (let i = 0; i < 3000; i++) {
  arr = [...arr];
}
console.log(Date.now() - start, "ms");
