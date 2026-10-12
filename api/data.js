// 다운로드 목록 저장/조회 API (Vercel Serverless Function)
// 저장소: Upstash Redis (Vercel Marketplace > Upstash for Redis 연결 시 환경변수 자동 주입)
// 관리자 비밀번호: 환경변수 ADMIN_PASSWORD (코드에 넣지 않음)
const crypto = require("crypto");

const KEY = "ismp-poc-downloads";
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// 로컬 테스트용 임시 저장소(운영에서는 사용되지 않음)
const mem = globalThis.__ismpMem || (globalThis.__ismpMem = { value: null });

async function redis(command) {
  const r = await fetch(REST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error("storage error");
  return (await r.json()).result;
}

async function readData() {
  const raw = REST_URL ? await redis(["GET", KEY]) : mem.value;
  if (!raw) return { apps: [] };
  try { return JSON.parse(raw); } catch { return { apps: [] }; }
}

async function writeData(obj) {
  const raw = JSON.stringify(obj);
  if (REST_URL) await redis(["SET", KEY, raw]);
  else mem.value = raw;
}

function passwordOk(input) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof input !== "string") return false;
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const isHttp = (u) => /^https?:\/\//i.test(u);

function sanitize(input) {
  if (!input || !Array.isArray(input.apps) || input.apps.length > 100) return null;
  const apps = [];
  for (const a of input.apps) {
    const name = str(a.name, 100);
    if (!name || !Array.isArray(a.versions) || a.versions.length > 500) return null;
    const versions = [];
    for (const v of a.versions) {
      const item = {
        id: str(v.id, 32) || crypto.randomUUID().slice(0, 8),
        version: str(v.version, 50),
        fileName: str(v.fileName, 200),
        url: str(v.url, 2000),
        date: str(v.date, 10),
      };
      if (!item.version || !item.fileName || !isHttp(item.url)) return null;
      versions.push(item);
    }
    apps.push({ id: str(a.id, 32) || crypto.randomUUID().slice(0, 8), name, versions });
  }
  return { apps };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      return res.status(200).json(await readData());
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (!process.env.ADMIN_PASSWORD) {
        return res.status(500).json({ error: "서버에 ADMIN_PASSWORD 환경변수가 설정되지 않았습니다." });
      }
      if (!passwordOk(body.password)) {
        return res.status(401).json({ error: "unauthorized" });
      }
      if (body.action === "verify") return res.status(200).json({ ok: true });
      if (body.action === "save") {
        const clean = sanitize(body.data);
        if (!clean) return res.status(400).json({ error: "데이터 형식이 올바르지 않습니다." });
        await writeData(clean);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: "알 수 없는 요청입니다." });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};
