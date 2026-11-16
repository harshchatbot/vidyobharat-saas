"""V3.2 stage regression: deterministic seek and distinct acting/layout states."""
import json
import os
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1] / 'scripts' / 'illustrated_v30'


def test_storyboard_contract():
    import sys
    sys.path.insert(0, str(ROOT))
    from validate import load_and_validate
    _, report = load_and_validate(ROOT / 'example_illustrated_v30.json')
    assert report['frames'] == 600
    assert report['beats'] == 8
    assert report['sfx'] == 18


def test_stage_seek_deterministic():
    playwright = pytest.importorskip('playwright.sync_api')
    from playwright.sync_api import sync_playwright
    plan = json.loads((ROOT / 'example_illustrated_v30.json').read_text())
    with sync_playwright() as runner:
        try:
            browser = runner.chromium.launch(headless=True, executable_path=os.environ.get("CHROMIUM_PATH") or None)
        except Exception as exc:
            pytest.skip(f'Chromium not installed: {exc}')
        try:
            page = browser.new_page(viewport={'width': 1080, 'height': 1920})
            page.set_content((ROOT / 'stage.html').read_text(), wait_until='load')
            page.evaluate('(p) => window.loadPlan(p)', plan)
            page.evaluate('window.setFrame(420)')
            before = page.locator('#stage').inner_html()
            page.evaluate('window.setFrame(20)')
            page.evaluate('window.setFrame(420)')
            assert page.locator('#stage').inner_html() == before
            page.evaluate('window.setFrame(585)')
            assert page.locator('#scene').get_attribute('data-role') == 'cta'
            assert page.locator('.prop.envelope').count() == 1
            page.evaluate('window.setFrame(180)')
            assert page.locator('#scene').get_attribute('data-role') == 'reveal'
        finally:
            browser.close()
