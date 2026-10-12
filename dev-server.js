// 로컬 확인용: node dev-server.js  →  http://localhost:3000
// 비밀번호는 환경변수로 전달:  ADMIN_PASSWORD=... node dev-server.js
// 저장소(Upstash) 환경변수가 없으면 메모리에 임시 저장됩니다(서버 재시작 시 초기화).
const http = require("http");
const fs = require("fs");
const path = require("path");
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "devpass"; // 로컬 테스트 전용 기본값
const handler = require("./api/data.js");

http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/api/data") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      req.body = raw ? JSON.parse(raw) : {};
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
      handler(req, res);
    });
    return;
  }
  const file = path.join(__dirname, url === "/" ? "index.html" : path.normalize(url));
  if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end("not found"); }
  const type = { ".html": "text/html; charset=utf-8", ".json": "application/json" }[path.extname(file)] || "application/octet-stream";
  res.setHeader("Content-Type", type);
  fs.createReadStream(file).pipe(res);
}).listen(3000, () => console.log("http://localhost:3000"));
