"""JACK V0.4 research: retrieve excerpts from explicitly approved HTTPS sources.

No arbitrary URL fetching, search-engine discovery, or claim verification.
Restricts hosts, redirects, response sizes and HTML extraction.
"""
from __future__ import annotations

from html.parser import HTMLParser
from urllib.parse import urlsplit
import re

from app.services.harshverse.jack_scriptwriter import Evidence, validate_evidence

TRUSTED_HOSTS = frozenset({
    "developer.salesforce.com", "help.salesforce.com",
    "trailhead.salesforce.com", "architect.salesforce.com",
})
MAX_BYTES = 300_000


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "footer", "noscript"):
            self.skip += 1
        if tag in ("p", "h1", "h2", "h3", "li"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "footer", "noscript"):
            self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def _validate_url(url: str) -> None:
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.hostname not in TRUSTED_HOSTS
            or parts.username or parts.password or parts.port
            or len(url) > 500):
        raise ValueError("Research URL must be an approved Salesforce HTTPS host")


def research_sources(urls: list[str], *, fetch=None) -> dict:
    """Fetch approved URLs and return unverified excerpts with provenance.

    fetch is an injectable function(url)->str for tests. Production requests
    disable redirects and enforce byte limits before parsing.
    """
    if not 1 <= len(urls) <= 5 or len(set(urls)) != len(urls):
        raise ValueError("Supply 1..5 distinct URLs")
    for url in urls:
        _validate_url(url)

    if fetch is None:
        import httpx

        def fetch(url):
            with httpx.Client(follow_redirects=False, timeout=15) as client:
                with client.stream("GET", url, headers={"Accept": "text/html"}) as response:
                    response.raise_for_status()
                    if response.is_redirect:
                        raise ValueError("Research redirects are not permitted")
                    if "text/html" not in response.headers.get("content-type", ""):
                        raise ValueError("Expected HTML research source")
                    chunks, size = [], 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > MAX_BYTES:
                            raise ValueError("Research response exceeds byte limit")
                        chunks.append(chunk)
                    return b"".join(chunks).decode("utf-8", errors="replace")

    evidence = []
    for index, url in enumerate(urls, 1):
        html = fetch(url)
        if not isinstance(html, str) or len(html.encode("utf-8")) > MAX_BYTES:
            raise ValueError("Invalid or oversized research HTML")
        parser = _Text()
        parser.feed(html)
        plain = re.sub(r"\s+", " ", " ".join(parser.parts)).strip()
        if len(plain) < 40:
            raise ValueError(f"Insufficient extractable source text: {url}")
        evidence.append(Evidence(f"source{index}", url, plain[:1500]))
    validate_evidence(evidence)
    return {
        "schema_version": "jack-research/v0.4",
        "status": "requires_human_fact_check",
        "source_discovery": "operator_supplied_urls",
        "evidence": evidence,
        "claims_verified": False,
    }
