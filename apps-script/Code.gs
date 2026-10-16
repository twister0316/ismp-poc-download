// 국회기록원 ISMP 사업 PoC 다운로드 페이지 - Google Apps Script 웹앱
// 목록 데이터는 소유자 드라이브의 JSON 파일(ismp-poc-downloads.json)에 저장됩니다.
// 관리자 비밀번호는 코드에 넣지 않고 [프로젝트 설정 > 스크립트 속성]의 ADMIN_PASSWORD 에 저장합니다.

var FILE_PROP = 'DATA_FILE_ID';
var FILE_NAME = 'ismp-poc-downloads.json';

function doGet(e) {
  // ?api=data → 목록 JSON (Vercel 미러가 서버에서 읽어 간다)
  if (e && e.parameter && e.parameter.api === 'data') {
    return ContentService.createTextOutput(JSON.stringify(readData_()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('국회기록원 ISMP 사업 PoC 다운로드')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ----- 클라이언트(google.script.run)에서 호출하는 함수 -----

function getData() {
  return readData_();
}

function verify(password) {
  if (!passwordOk_(password)) return fail_(401, 'unauthorized');
  return { ok: true };
}

function saveData(password, data) {
  if (!passwordOk_(password)) return fail_(401, 'unauthorized');
  var clean = sanitize_(data);
  if (!clean) return fail_(400, '데이터 형식이 올바르지 않습니다.');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    writeData_(clean);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// ----- 내부 함수 -----

function fail_(status, error) {
  return { ok: false, status: status, error: error };
}

function passwordOk_(input) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!expected || typeof input !== 'string') {
    Utilities.sleep(500);
    return false;
  }
  var ok = digest_(input) === digest_(expected);
  if (!ok) Utilities.sleep(800); // 무차별 대입 완화
  return ok;
}

function digest_(s) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}

function readData_() {
  var id = PropertiesService.getScriptProperties().getProperty(FILE_PROP);
  if (!id) return { apps: [] };
  try {
    var parsed = JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
    return parsed && Array.isArray(parsed.apps) ? parsed : { apps: [] };
  } catch (e) {
    return { apps: [] };
  }
}

function writeData_(obj) {
  var props = PropertiesService.getScriptProperties();
  var json = JSON.stringify(obj);
  var id = props.getProperty(FILE_PROP);
  if (id) {
    try {
      DriveApp.getFileById(id).setContent(json);
      return;
    } catch (e) { /* 파일이 삭제된 경우 새로 만든다 */ }
  }
  var file = DriveApp.createFile(FILE_NAME, json, MimeType.PLAIN_TEXT);
  props.setProperty(FILE_PROP, file.getId());
}

function str_(v, max) {
  return String(v == null ? '' : v).replace(/^\s+|\s+$/g, '').slice(0, max);
}

function isHttp_(u) {
  return /^https?:\/\//i.test(u);
}

function sanitize_(input) {
  if (!input || !Array.isArray(input.apps) || input.apps.length > 100) return null;
  var apps = [];
  for (var i = 0; i < input.apps.length; i++) {
    var a = input.apps[i];
    var name = str_(a.name, 100);
    if (!name || !Array.isArray(a.versions) || a.versions.length > 500) return null;
    var versions = [];
    for (var j = 0; j < a.versions.length; j++) {
      var v = a.versions[j];
      var item = {
        id: str_(v.id, 32) || Utilities.getUuid().slice(0, 8),
        version: str_(v.version, 50),
        fileName: str_(v.fileName, 200),
        url: str_(v.url, 2000),
        date: str_(v.date, 10),
        note: str_(v.note, 200)
      };
      if (!item.version || !item.fileName || !isHttp_(item.url)) return null;
      versions.push(item);
    }
    apps.push({ id: str_(a.id, 32) || Utilities.getUuid().slice(0, 8), name: name, versions: versions });
  }
  return { apps: apps };
}
