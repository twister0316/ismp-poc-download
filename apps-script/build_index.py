# ../index.html 을 Apps Script용 Index.html 로 변환한다. (python build_index.py)
import base64, re, pathlib
here = pathlib.Path(__file__).parent
s = (here.parent / "index.html").read_text(encoding="utf-8")
logo = base64.b64encode((here.parent / "assets/logo-na-archives-white.png").read_bytes()).decode()
s = s.replace('src="assets/logo-na-archives-white.png"', 'src="data:image/png;base64,%s"' % logo)

load_new = '''function load() {
    return new Promise(function (resolve) {
      google.script.run
        .withSuccessHandler(function (d) { data = d && Array.isArray(d.apps) ? d : { apps: [] }; resolve(); })
        .withFailureHandler(function () { data = { apps: [] }; resolve(); })
        .getData();
    }).then(render);
  }'''
s, n1 = re.subn(r'function load\(\) \{.*?\.then\(render\);\n  \}', lambda m: load_new, s, flags=re.S)

api_new = '''function api(body) {
    return new Promise(function (resolve, reject) {
      var run = google.script.run
        .withSuccessHandler(function (res) { resolve({ ok: !!res.ok, status: res.status || 200, body: res }); })
        .withFailureHandler(reject);
      if (body.action === "verify") run.verify(body.password); else run.saveData(body.password, body.data);
    });
  }'''
s, n2 = re.subn(r'function api\(body\) \{.*?\n  \}', lambda m: api_new, s, flags=re.S)

# 샌드박스 iframe 에서 confirm() 이 막힐 수 있어 2단계 클릭 확인으로 대체
confirm_re = re.compile(r'el\("button", \{ class: "btn sm danger", text: "앱 삭제", onclick: function \(\) \{.*?\} \}\)', re.S)
confirm_new = '''el("button", { class: "btn sm danger", text: "앱 삭제", onclick: function () {
          if (!this.dataset.armed) { this.dataset.armed = "1"; this.textContent = "정말 삭제"; return; }
          draft.apps.splice(ai, 1); drawAdmin();
        } })'''
s, n3 = confirm_re.subn(lambda m: confirm_new, s)
assert (n1, n2, n3) == (1, 1, 1), (n1, n2, n3)
assert "var READ_ONLY = true;" in s
s = s.replace("var READ_ONLY = true;", "var READ_ONLY = false;", 1)
(here / "Index.html").write_text(s, encoding="utf-8")
print("ok", len(s))
