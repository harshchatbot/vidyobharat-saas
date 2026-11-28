import asyncio
import csv
from datetime import datetime, timezone
from pathlib import Path

from trend_research import Topic, own_performance, research, score, select, Signal

NOW = datetime(2026, 11, 27, tzinfo=timezone.utc)
TOPICS = [Topic("Save", "how data is saved", "Client–server model", ["howitworks"]), Topic("UPI", "how upi works", "Unified Payments Interface")]


def fake_trends(blocked=False):
    async def trends(topics, geo, anchor):
        if blocked:
            raise OSError("blocked by proxy")
        return [Signal("trends", tp.topic, "gt_interest", 10.0 * (i + 1), "u") for i, tp in enumerate(topics)]
    return trends


def fake_fetch(blocked=()):
    async def fetch(url, headers):
        if any(b in url for b in blocked):
            raise OSError("blocked by proxy")
        if "suggestqueries" in url:
            q = url.split("q=")[1]
            return [q, ["how upi works in india", "how upi works step by step", "how data is saved in cloud"]]
        if "wikimedia" in url:
            big = "Unified" in url
            return {"items": [{"views": (900 if big else 100) * (2 if i >= 31 else 1)} for i in range(61)]}
        if "reddit" in url:
            return {"data": {"children": [{"data": {"title": "How does UPI work?", "score": 120, "permalink": "/r/x/1"}}]}}
        if "algolia" in url:
            return {"hits": [{"points": 40}]}
        if "googleapis.com/youtube/v3/search" in url:
            return {"pageInfo": {"totalResults": 5000}, "items": [{"id": {"videoId": "a1"}}]}
        if "googleapis.com/youtube/v3/videos" in url:
            return {"items": [{"id": "a1", "statistics": {"viewCount": "100000"}, "snippet": {"publishedAt": "2026-11-17T00:00:00Z", "title": "UPI", "channelTitle": "c"}}]}
        raise OSError("unexpected " + url)
    return fetch


def test_research_ranks_and_reports_sources():
    rep = asyncio.run(research(TOPICS, fetch=fake_fetch(), now=NOW, env={"YOUTUBE_API_KEY": "k"}, trends_fn=fake_trends()))
    assert rep["sources"]["wikipedia"]["status"] == "ok"
    assert rep["sources"]["instagram"]["status"] == "skipped"
    assert rep["ranking"][0]["topic"] == "UPI"  # more wiki views, more suggestions
    yt = [s for s in rep["signals"] if s["metric"] == "yt_median_views_per_day"]
    assert yt and round(yt[0]["value"]) == 10000  # 100k views over 10 days
    assert all(r["evidence"] for r in rep["ranking"])


def test_blocked_sources_are_reported_not_faked():
    rep = asyncio.run(research(TOPICS, fetch=fake_fetch(blocked=("reddit", "algolia")), now=NOW, env={}, trends_fn=fake_trends()))
    assert rep["sources"]["reddit"]["status"] == "unavailable" and "blocked" in rep["sources"]["reddit"]["reason"]
    assert rep["sources"]["youtube"]["status"] == "skipped"
    assert not any(s["source"] in ("reddit", "hn", "youtube") for s in rep["signals"])


def test_everything_blocked_gives_no_ranking():
    rep = asyncio.run(research(TOPICS, fetch=fake_fetch(blocked=("http",)), now=NOW, env={}, discover=False, trends_fn=fake_trends(True)))
    assert rep["ranking"] == [] and "no ranking" in rep["limitations"].lower()


def test_own_performance_from_insights_csv(tmp_path: Path):
    p = tmp_path / "insights.csv"
    with p.open("w", newline="") as f:
        w = csv.writer(f); w.writerow(["Description", "Reach", "Likes", "Saves", "Shares", "Comments"])
        w.writerow(["How UPI works #upi", "1000", "100", "50", "40", "10"])
        w.writerow(["Cat video", "1000", "10", "0", "0", "1"])
    sig = own_performance(p, TOPICS)
    assert sig and sig[0].topic == "UPI" and sig[0].value > 1


def test_select_skips_posted_topics():
    ranked = score(TOPICS, [Signal("wikipedia", "Save", "wiki_views_30d", 10, "u"), Signal("wikipedia", "UPI", "wiki_views_30d", 99, "u")])
    rep = {"ranking": ranked}
    assert select(rep, set())["topic"] == "UPI"
    assert select(rep, {"upi"})["topic"] == "Save"


def test_partial_failure_is_flagged():
    async def flaky(url, headers):
        if "wikimedia" in url and "Unified" in url:
            raise OSError("429")
        return await fake_fetch()(url, headers)
    rep = asyncio.run(research(TOPICS, fetch=flaky, now=NOW, env={}, discover=False, trends_fn=fake_trends()))
    assert rep["sources"]["wikipedia"]["status"] == "partial" and "1 request" in rep["sources"]["wikipedia"]["reason"]


def test_reddit_block_names_the_fix():
    rep = asyncio.run(research(TOPICS, fetch=fake_fetch(blocked=("reddit",)), now=NOW, env={}, discover=False, trends_fn=fake_trends()))
    assert "REDDIT_CLIENT_ID" in rep["sources"]["reddit"]["reason"]


def test_trending_rss_is_discovery_only():
    rss = ("<rss><channel><item><title>chatgpt down</title><ht:approx_traffic>50K+</ht:approx_traffic>"
           "<ht:news_item_title>OpenAI outage</ht:news_item_title></item>"
           "<item><title>india vs australia</title><ht:approx_traffic>1M+</ht:approx_traffic></item></channel></rss>")
    async def fetch(url, headers):
        return rss if "trending/rss" in url else await fake_fetch()(url, headers)
    rep = asyncio.run(research(TOPICS, fetch=fetch, now=NOW, env={}, trends_fn=fake_trends()))
    assert [t["query"] for t in rep["trending_now"] if t["tech"]] == ["chatgpt down"]
    assert not any(s["source"] == "trending" for s in rep["signals"])


def test_suggestions_need_all_content_words():
    from trend_research import suggest_signal
    async def fetch(url, headers):
        return ["q", ["how upi works in india", "how gps works", "aqi today", "upi id"]]
    sig = asyncio.run(suggest_signal(fetch, Topic("UPI", "how upi works")))
    assert sig[0].value == 2  # "how gps works" no longer matches on "works"
