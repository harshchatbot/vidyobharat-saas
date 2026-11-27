"""Social trend research for JACK topic selection.

The older ``content_intelligence.trends`` step only reads GitHub activity and
Hacker News, which says nothing about what short-form viewers want. This module
collects audience signals from the places Reels/Shorts viewers actually are and
ranks candidate topics by demand, momentum, competition and the channel's own
past results.

Sources (each optional; a missing key or blocked host is reported, never faked):
  youtube      YouTube Data API v3: recent Shorts per topic, views/day, result count  (YOUTUBE_API_KEY)
  suggest      YouTube/Google autocomplete: what people are typing                    (no key)
  wikipedia    Wikimedia pageviews: 30-day attention and growth per article            (no key)
  reddit       Reddit search in tech/learning subreddits over the last month          (no key)
  hn           Hacker News stories over the last 30 days                               (no key)
  trends       Google Trends interest via pytrends, if installed                       (no key)
  instagram    Instagram Graph API hashtag top media                                   (IG_ACCESS_TOKEN, IG_USER_ID)
  own          Instagram Insights CSV export of the channel's own posts                (--insights)

Usage:
  python trend_research.py run --topics topics.json --out trend_report.json [--insights insights.csv]
  python trend_research.py select --report trend_report.json --history posted.txt
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import math
import os
import re
import statistics
import urllib.parse
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable

import httpx

Fetch = Callable[[str, dict[str, str] | None], Awaitable[Any]]
UA = "jack-trend-research/1.0 (+topic research for an explainer channel)"
SUBREDDITS = ("explainlikeimfive", "learnprogramming", "computerscience", "programming", "technology", "AskComputerScience")
DISCOVERY_SEEDS = ("what happens when you", "how does", "why does my phone", "how does the internet")


@dataclass
class Topic:
    topic: str
    query: str
    wiki: str | None = None
    hashtags: list[str] = field(default_factory=list)


@dataclass
class Signal:
    source: str
    topic: str
    metric: str
    value: float
    url: str
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass
class SourceStatus:
    source: str
    status: str  # ok | unavailable | skipped
    reason: str = ""
    signals: int = 0


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def http_fetch(client: httpx.AsyncClient, url: str, headers: dict[str, str] | None = None) -> Any:
    resp = await client.get(url, headers={"User-Agent": UA, **(headers or {})}, timeout=20)
    resp.raise_for_status()
    ctype = resp.headers.get("content-type", "")
    return resp.json() if "json" in ctype or resp.text[:1] in "[{" else resp.text


# ---------------------------------------------------------------- sources
async def youtube_shorts(fetch: Fetch, t: Topic, key: str, now: datetime) -> list[Signal]:
    since = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    q = urllib.parse.urlencode({"part": "snippet", "type": "video", "videoDuration": "short", "order": "viewCount",
                                "publishedAfter": since, "maxResults": 15, "q": t.query, "key": key})
    search = await fetch("https://www.googleapis.com/youtube/v3/search?" + q, None)
    ids = [i["id"]["videoId"] for i in search.get("items", []) if i.get("id", {}).get("videoId")]
    total = float(search.get("pageInfo", {}).get("totalResults", 0))
    page = "https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": t.query})
    out = [Signal("youtube", t.topic, "yt_result_count", total, page)]
    if not ids:
        return out
    stats = await fetch("https://www.googleapis.com/youtube/v3/videos?" + urllib.parse.urlencode(
        {"part": "statistics,snippet", "id": ",".join(ids), "key": key}), None)
    rates, top = [], []
    for v in stats.get("items", []):
        published = datetime.fromisoformat(v["snippet"]["publishedAt"].replace("Z", "+00:00"))
        days = max(1.0, (now - published).total_seconds() / 86400)
        views = float(v.get("statistics", {}).get("viewCount", 0))
        rates.append(views / days)
        top.append({"title": v["snippet"]["title"], "channel": v["snippet"]["channelTitle"], "views": int(views),
                    "views_per_day": round(views / days), "url": f"https://www.youtube.com/shorts/{v['id']}"})
    top.sort(key=lambda x: -x["views_per_day"])
    out.append(Signal("youtube", t.topic, "yt_median_views_per_day", statistics.median(rates), page, {"top": top[:5]}))
    return out


async def suggestions(fetch: Fetch, query: str, ds: str = "yt") -> list[str]:
    url = "https://suggestqueries.google.com/complete/search?" + urllib.parse.urlencode({"client": "firefox", "ds": ds, "q": query})
    data = await fetch(url, None)
    if isinstance(data, str):
        data = json.loads(data)
    return [s for s in data[1]] if isinstance(data, list) and len(data) > 1 else []


async def suggest_signal(fetch: Fetch, t: Topic) -> list[Signal]:
    found = await suggestions(fetch, t.query)
    stem = [w for w in re.findall(r"[a-z0-9]+", t.query.lower()) if len(w) > 3]
    hits = [s for s in found if any(w in s.lower() for w in stem)]
    url = "https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": t.query})
    return [Signal("suggest", t.topic, "yt_suggestions", float(len(hits)), url, {"suggestions": found[:10]})]


async def wikipedia_attention(fetch: Fetch, t: Topic, now: datetime) -> list[Signal]:
    if not t.wiki:
        return []
    end, start = now - timedelta(days=1), now - timedelta(days=61)
    art = urllib.parse.quote(t.wiki.replace(" ", "_"), safe="")
    url = (f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{art}/daily/"
           f"{start:%Y%m%d}/{end:%Y%m%d}")
    data = await fetch(url, None)
    views = [float(i["views"]) for i in data.get("items", [])]
    if len(views) < 20:
        return []
    recent, prior = sum(views[-30:]), sum(views[:-30]) or 1.0
    page = f"https://en.wikipedia.org/wiki/{art}"
    return [Signal("wikipedia", t.topic, "wiki_views_30d", recent, page),
            Signal("wikipedia", t.topic, "wiki_growth", recent / prior, page, {"prior_30d": prior})]


async def reddit_mentions(fetch: Fetch, t: Topic) -> list[Signal]:
    url = f"https://www.reddit.com/r/{'+'.join(SUBREDDITS)}/search.json?" + urllib.parse.urlencode(
        {"q": t.query, "restrict_sr": "1", "sort": "top", "t": "month", "limit": "25"})
    data = await fetch(url, None)
    posts = [c["data"] for c in data.get("data", {}).get("children", [])]
    score = sum(float(p.get("score", 0)) for p in posts)
    top = [{"title": p["title"], "score": p.get("score"), "url": "https://www.reddit.com" + p["permalink"]} for p in posts[:5]]
    return [Signal("reddit", t.topic, "reddit_posts_30d", float(len(posts)), url.replace(".json", ""), {"top": top}),
            Signal("reddit", t.topic, "reddit_score_30d", score, url.replace(".json", ""))]


async def hn_mentions(fetch: Fetch, t: Topic, now: datetime) -> list[Signal]:
    since = int((now - timedelta(days=30)).timestamp())
    url = "https://hn.algolia.com/api/v1/search?" + urllib.parse.urlencode(
        {"query": t.query, "tags": "story", "numericFilters": f"created_at_i>{since}", "hitsPerPage": "20"})
    data = await fetch(url, None)
    hits = data.get("hits", [])
    return [Signal("hn", t.topic, "hn_points_30d", float(sum(h.get("points") or 0 for h in hits)),
                   "https://hn.algolia.com/?" + urllib.parse.urlencode({"query": t.query, "dateRange": "pastMonth"}),
                   {"stories": len(hits)})]


async def google_trends(topics: list[Topic], geo: str) -> list[Signal]:
    try:
        from pytrends.request import TrendReq  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError("pytrends not installed") from exc

    def run() -> list[Signal]:
        out: list[Signal] = []
        py = TrendReq(hl="en-US", tz=330)
        for i in range(0, len(topics), 5):  # Google Trends compares at most 5 terms at once
            group = topics[i:i + 5]
            py.build_payload([t.query for t in group], timeframe="today 3-m", geo=geo)
            df = py.interest_over_time()
            for t in group:
                if df.empty or t.query not in df:
                    continue
                s = df[t.query].astype(float)
                recent, prior = s.tail(4).mean(), s.head(len(s) - 4).mean() or 1.0
                url = "https://trends.google.com/trends/explore?" + urllib.parse.urlencode({"q": t.query, "geo": geo, "date": "today 3-m"})
                out.append(Signal("trends", t.topic, "gt_interest", float(recent), url))
                out.append(Signal("trends", t.topic, "gt_growth", float(recent / prior), url))
        return out
    return await asyncio.to_thread(run)


async def instagram_hashtags(fetch: Fetch, t: Topic, token: str, user: str) -> list[Signal]:
    out = []
    for tag in t.hashtags[:2]:
        base = "https://graph.facebook.com/v21.0/"
        found = await fetch(base + "ig_hashtag_search?" + urllib.parse.urlencode({"user_id": user, "q": tag, "access_token": token}), None)
        if not found.get("data"):
            continue
        hid = found["data"][0]["id"]
        media = await fetch(base + f"{hid}/top_media?" + urllib.parse.urlencode(
            {"user_id": user, "fields": "like_count,comments_count,permalink,media_type", "limit": "30", "access_token": token}), None)
        likes = [float(m.get("like_count") or 0) for m in media.get("data", [])]
        if likes:
            out.append(Signal("instagram", t.topic, "ig_top_median_likes", statistics.median(likes),
                              f"https://www.instagram.com/explore/tags/{tag}/", {"hashtag": tag, "sampled": len(likes)}))
    return out


def own_performance(path: Path, topics: list[Topic]) -> list[Signal]:
    """Match Instagram Insights rows (any column naming) to topics by keyword."""
    def num(row: dict[str, str], *names: str) -> float:
        for k, v in row.items():
            if k and any(n in k.lower() for n in names):
                try:
                    return float(str(v).replace(",", "") or 0)
                except ValueError:
                    continue
        return 0.0
    rows = list(csv.DictReader(path.open(encoding="utf-8-sig")))
    scored = []
    for r in rows:
        text = " ".join(v for k, v in r.items() if k and re.search(r"desc|caption|title", k, re.I)).lower()
        reach = num(r, "reach", "plays", "views") or 1.0
        eng = (num(r, "save") * 3 + num(r, "share") * 3 + num(r, "comment") * 2 + num(r, "like")) / reach
        scored.append((text, eng))
    if not scored:
        return []
    mean = statistics.mean(e for _, e in scored) or 1e-9
    out = []
    for t in topics:
        words = [w for w in re.findall(r"[a-z0-9]+", t.query.lower()) if len(w) > 3]
        mine = [e for text, e in scored if words and sum(w in text for w in words) >= max(1, len(words) // 2)]
        if mine:
            out.append(Signal("own", t.topic, "own_engagement_vs_avg", statistics.mean(mine) / mean, str(path), {"posts": len(mine)}))
    return out


# ---------------------------------------------------------------- scoring
WEIGHTS = {"demand": .35, "momentum": .35, "openness": .15, "own": .15}
FEATURES = {
    "demand": [("wiki_views_30d", "log"), ("yt_suggestions", "lin"), ("gt_interest", "lin"), ("ig_top_median_likes", "log")],
    "momentum": [("wiki_growth", "lin"), ("gt_growth", "lin"), ("yt_median_views_per_day", "log"), ("reddit_score_30d", "log"), ("hn_points_30d", "log")],
    "openness": [("yt_result_count", "inv_log")],
    "own": [("own_engagement_vs_avg", "lin")],
}


def score(topics: list[Topic], signals: list[Signal]) -> list[dict[str, Any]]:
    by: dict[str, dict[str, float]] = {t.topic: {} for t in topics}
    for s in signals:
        by.setdefault(s.topic, {})[s.metric] = s.value
    def norm(metric: str, kind: str) -> dict[str, float]:
        raw = {k: v[metric] for k, v in by.items() if metric in v}
        if not raw:
            return {}
        tx = {k: (math.log10(1 + x) if kind in ("log", "inv_log") else x) for k, x in raw.items()}
        lo, hi = min(tx.values()), max(tx.values())
        out = {k: (x - lo) / (hi - lo) if hi > lo else .5 for k, x in tx.items()}
        return {k: 1 - x for k, x in out.items()} if kind == "inv_log" else out
    normed = {m: norm(m, kind) for parts in FEATURES.values() for m, kind in parts}
    ranked = []
    for t in topics:
        parts, used = {}, []
        for name, feats in FEATURES.items():
            vals = [normed[m][t.topic] for m, _ in feats if t.topic in normed[m]]
            if vals:
                parts[name] = sum(vals) / len(vals)
                used += [m for m, _ in feats if t.topic in normed[m]]
        w = sum(WEIGHTS[k] for k in parts)
        opportunity = sum(WEIGHTS[k] * v for k, v in parts.items()) / w if w else None
        sources = sorted({s.source for s in signals if s.topic == t.topic})
        ranked.append({"topic": t.topic, "query": t.query, "opportunity": None if opportunity is None else round(opportunity, 3),
                       "components": {k: round(v, 3) for k, v in parts.items()}, "metrics": by.get(t.topic, {}),
                       "sources": sources, "confidence": "high" if len(sources) >= 4 else "medium" if len(sources) >= 2 else "low",
                       "evidence": sorted({s.url for s in signals if s.topic == t.topic})})
    def key(r: dict[str, Any]) -> float:
        v = r["opportunity"]
        return -float(v) if isinstance(v, (int, float)) else 1.0
    ranked.sort(key=key)
    return ranked


# ---------------------------------------------------------------- runner
async def research(topics: list[Topic], *, fetch: Fetch, now: datetime | None = None, geo: str = "IN",
                   insights: Path | None = None, env: dict[str, str] | None = None, discover: bool = True) -> dict[str, Any]:
    now = now or _now()
    env = dict(os.environ if env is None else env)
    signals: list[Signal] = []
    status: dict[str, SourceStatus] = {}

    async def collect(name: str, jobs: Iterable[Awaitable[list[Signal]]]) -> None:
        got, errors = 0, []
        for res in await asyncio.gather(*jobs, return_exceptions=True):
            if isinstance(res, BaseException):
                errors.append(f"{type(res).__name__}: {str(res)[:120]}")
            else:
                signals.extend(res)
                got += len(res)
        status[name] = SourceStatus(name, "ok" if got else "unavailable", "; ".join(sorted(set(errors)))[:300] or ("" if got else "no data"), got)

    if env.get("YOUTUBE_API_KEY"):
        await collect("youtube", [youtube_shorts(fetch, t, env["YOUTUBE_API_KEY"], now) for t in topics])
    else:
        status["youtube"] = SourceStatus("youtube", "skipped", "YOUTUBE_API_KEY not set")
    await collect("suggest", [suggest_signal(fetch, t) for t in topics])
    await collect("wikipedia", [wikipedia_attention(fetch, t, now) for t in topics])
    await collect("reddit", [reddit_mentions(fetch, t) for t in topics])
    await collect("hn", [hn_mentions(fetch, t, now) for t in topics])
    try:
        await collect("trends", [google_trends(topics, geo)])
    except RuntimeError as exc:
        status["trends"] = SourceStatus("trends", "skipped", str(exc))
    if env.get("IG_ACCESS_TOKEN") and env.get("IG_USER_ID"):
        await collect("instagram", [instagram_hashtags(fetch, t, env["IG_ACCESS_TOKEN"], env["IG_USER_ID"]) for t in topics if t.hashtags])
    else:
        status["instagram"] = SourceStatus("instagram", "skipped", "IG_ACCESS_TOKEN / IG_USER_ID not set (needs a Business or Creator account)")
    if insights:
        own = own_performance(insights, topics)
        signals.extend(own)
        status["own"] = SourceStatus("own", "ok" if own else "unavailable", "" if own else "no posts matched topics", len(own))
    else:
        status["own"] = SourceStatus("own", "skipped", "no --insights CSV yet")

    discovered: list[str] = []
    if discover:
        for seed in DISCOVERY_SEEDS:
            try:
                discovered += await suggestions(fetch, seed)
            except Exception as exc:  # noqa: BLE001 - discovery is best-effort and reported
                status.setdefault("discovery", SourceStatus("discovery", "unavailable", type(exc).__name__))
        discovered = list(dict.fromkeys(discovered))

    ok = [s.source for s in status.values() if s.status == "ok"]
    return {
        "observed_at": now.isoformat(), "geo": geo, "window_days": 30,
        "sources": {k: asdict(v) for k, v in status.items()},
        "ranking": score(topics, signals) if ok else [],
        "discovered_queries": discovered[:40],
        "signals": [asdict(s) for s in signals],
        "limitations": ("Signals are observed proxies for audience interest, not view predictions. "
                        "Sources marked skipped/unavailable contributed nothing; nothing is estimated in their place. "
                        + ("" if ok else "No source returned data, so no ranking was produced.")),
    }


def select(report: dict[str, Any], posted: set[str], min_conf: str = "low") -> dict[str, Any] | None:
    order = {"low": 0, "medium": 1, "high": 2}
    for r in report.get("ranking", []):
        if r["topic"].lower() not in posted and r["opportunity"] is not None and order[r["confidence"]] >= order[min_conf]:
            return r
    return None


def load_topics(path: Path) -> list[Topic]:
    return [Topic(**t) if isinstance(t, dict) else Topic(topic=t, query=t) for t in json.loads(path.read_text())]


def to_markdown(report: dict[str, Any]) -> str:
    lines = [f"# Trend report ({report['observed_at'][:10]}, geo {report['geo']})", "", "| Source | Status | Note |", "| --- | --- | --- |"]
    lines += [f"| {s['source']} | {s['status']} | {s['reason']} |" for s in report["sources"].values()]
    lines += ["", "| # | Topic | Opportunity | Confidence | Demand | Momentum | Openness | Own |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for i, r in enumerate(report["ranking"], 1):
        c = r["components"]
        lines.append(f"| {i} | {r['topic']} | {r['opportunity']} | {r['confidence']} | {c.get('demand', '')} | {c.get('momentum', '')} | {c.get('openness', '')} | {c.get('own', '')} |")
    if report["discovered_queries"]:
        lines += ["", "Discovered queries: " + "; ".join(report["discovered_queries"][:20])]
    return "\n".join(lines + ["", report["limitations"]])


async def _main_run(a: argparse.Namespace) -> None:
    async with httpx.AsyncClient(follow_redirects=True) as client:
        async def fetch(url: str, headers: dict[str, str] | None) -> Any:
            return await http_fetch(client, url, headers)
        report = await research(load_topics(Path(a.topics)), fetch=fetch, geo=a.geo,
                                insights=Path(a.insights) if a.insights else None, discover=not a.no_discovery)
    Path(a.out).write_text(json.dumps(report, indent=1))
    Path(a.out).with_suffix(".md").write_text(to_markdown(report))
    print(to_markdown(report))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--topics", required=True); r.add_argument("--out", default="trend_report.json")
    r.add_argument("--geo", default="IN"); r.add_argument("--insights"); r.add_argument("--no-discovery", action="store_true")
    s = sub.add_parser("select")
    s.add_argument("--report", required=True); s.add_argument("--history"); s.add_argument("--min-confidence", default="low")
    a = p.parse_args()
    if a.cmd == "run":
        asyncio.run(_main_run(a))
    else:
        posted = {l.strip().lower() for l in Path(a.history).read_text().splitlines()} if a.history else set()
        print(json.dumps(select(json.loads(Path(a.report).read_text()), posted, a.min_confidence), indent=1))


if __name__ == "__main__":
    main()
