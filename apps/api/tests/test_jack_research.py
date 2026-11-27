import pytest

from app.services.harshverse.jack_research import research_sources

URL = "https://developer.salesforce.com/docs"


def test_research_extracts_source_and_preserves_review_gate():
    result = research_sources([URL], fetch=lambda url: (
        "<html><nav>Ignore navigation</nav><main><h1>Change Data Capture</h1>"
        "<p>Change events can notify subscribers when Salesforce records change. "
        "Subscribers can process changes asynchronously.</p></main></html>"
    ))
    assert result["schema_version"] == "jack-research/v0.4"
    assert result["evidence"][0].source_url == URL
    assert "Change events" in result["evidence"][0].excerpt
    assert "Ignore navigation" not in result["evidence"][0].excerpt
    assert result["claims_verified"] is False


@pytest.mark.parametrize("url", [
    "http://developer.salesforce.com/docs",
    "https://developer.salesforce.com.evil.example/docs",
    "https://127.0.0.1/docs",
    "https://developer.salesforce.com:8443/docs",
    "https://user:pass@developer.salesforce.com/docs",
])
def test_rejects_untrusted_urls(url):
    with pytest.raises(ValueError, match="approved"):
        research_sources([url], fetch=lambda _: "<p>" + "text " * 20 + "</p>")


def test_empty_or_duplicate_urls_rejected():
    with pytest.raises(ValueError, match="distinct"):
        research_sources([])
    with pytest.raises(ValueError, match="distinct"):
        research_sources([URL, URL])


def test_empty_extracted_content_rejected():
    with pytest.raises(ValueError, match="Insufficient"):
        research_sources([URL], fetch=lambda _: "<script>" + "x" * 100 + "</script>")
