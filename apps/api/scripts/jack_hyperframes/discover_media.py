"""Discover README image candidates without downloading or granting rights."""
import argparse,json,re
from pathlib import Path
from urllib.parse import urljoin,urlparse
import hashlib
def discover(sources):
    candidates=[]
    for s in sources:
        body=s.get("readme_excerpt","")
        base=s.get("readme_url",s.get("url",""))
        for alt,url in re.findall(r"!\[([^\]]*)\]\(([^\s)]+)",body)+[("README image",u) for u in re.findall(r'<img[^>]+src=["\']([^"\']+)',body,re.I)]:
            url=urljoin(base,url)
            if urlparse(url).scheme!="https": continue
            if any(x in url.lower() for x in ("shields.io","badge","visitor","tracking")): continue
            if any(x["url"]==url for x in candidates): continue
            candidates.append({"id":hashlib.sha256(url.encode()).hexdigest()[:16],"repository":s["name"],"title":alt,"url":url,"evidence":base,"approved":False,"license":None,"kind":"product_visual","review_status":"pending","description":"README image candidate; visual content not verified"})
    return candidates
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--research",required=True);p.add_argument("--output",required=True);a=p.parse_args()
    Path(a.output).write_text(json.dumps({"candidates":discover(json.loads(Path(a.research).read_text()))},indent=2))
