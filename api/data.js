// 다운로드 목록 API (Vercel Serverless Function) - 읽기 전용 미러
// 원본 데이터는 구글 Apps Script 웹앱에 있고, 여기서는 서버가 그 목록을 읽어서 전달한다.
// 등록·수정은 구글 사이트(Apps Script) 관리자 화면에서만 한다.
//
// 환경변수(선택)
//   APPS_SCRIPT_URL        Apps Script 웹앱 주소 (기본값 아래)
//   KV_REST_API_URL/TOKEN  Upstash Redis - 설정되어 있으면 마지막으로 읽은 목록을 보관했다가
//                          Apps Script 장애 시 대신 보여준다.

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycby2Z2HogOfQq49-qXGTF3p9CVOECFh66qKCCJ-paJLttRFEDAO-9uAW9R1yyUgOHAkFbA/exec";

const CACHE_KEY = "ismp-poc-downloads-mirror";
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  const r = await fetch(REST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error("storage error");
  return (await r.json()).result;
}

async function fetchOrigin() {
  const url = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + "api=data";
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("origin " + r.status);
  const data = await r.json();
  if (!data || !Array.isArray(data.apps)) throw new Error("bad origin data");
  return data;
}

async function readCache() {
  if (!REST_URL) return null;
  try {
    const raw = await redis(["GET", CACHE_KEY]);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function writeCache(data) {
  if (!REST_URL) return;
  try { await redis(["SET", CACHE_KEY, JSON.stringify(data)]); } catch { /* 보관 실패는 무시 */ }
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      try {
        const data = await fetchOrigin();
        await writeCache(data);
        res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
        return res.status(200).json(data);
      } catch (e) {
        const cached = await readCache();
        if (cached) {
          res.setHeader("Cache-Control", "no-store");
          return res.status(200).json(cached);
        }
        res.setHeader("Cache-Control", "no-store");
        return res.status(502).json({ error: "원본 목록을 불러오지 못했습니다." });
      }
    }
    res.setHeader("Allow", "GET");
    res.setHeader("Cache-Control", "no-store");
    return res.status(403).json({ error: "이 사이트는 읽기 전용입니다. 구글 사이트(Apps Script)에서 등록하세요." });
  } catch (e) {
    return res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};
