"""Legge i tabelloni EAV (La Trencia e Montesanto) e scrive live.json con i ritardi della Circumflegrea."""
import html, json, re, sys, urllib.parse, urllib.request
from datetime import datetime, timezone

URL = "https://orariotreni.eavsrl.it/teleindicatori/ws_getData_pis.php"

def tabellone(cod, tipo):
    data = urllib.parse.urlencode({"tipoLista": tipo, "codLoc": cod, "visualizzazione": "mobile"}).encode()
    req = urllib.request.Request(URL, data=data, headers={"User-Agent": "cumana-ste/1.0 (orari personali)"})
    t = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S):
        tds = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", td))).strip()
               for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(tds) >= 7 and re.fullmatch(r"\d{1,2}:\d{2}", tds[5]) and tds[0].startswith("5"):  # 5xxx = Circumflegrea
            rit = int(tds[6]) if tds[6].isdigit() else 0
            out.append({"treno": tds[0], "dest": tds[2], "ora": tds[5].zfill(5), "rit": rit, "info": tds[3]})
    return out

res = {"agg": datetime.now(timezone.utc).isoformat(timespec="seconds"), "ok": True}
try:
    res["trencia_p"] = [r for r in tabellone(823, "P") if r["dest"] == "MONTESANTO"]
    res["montesanto_a"] = tabellone(801, "A")
    res["montesanto_p"] = tabellone(801, "P")
    res["pianura_p"] = tabellone(824, "P")   # Pianura (stazione di Sabrina): passano entrambe le direzioni
except Exception as e:
    res["ok"] = False
    res["errore"] = str(e)[:200]
json.dump(res, sys.stdout, ensure_ascii=False, indent=1)
