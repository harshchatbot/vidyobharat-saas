"""JACK publish step: approved post packs -> Instagram Reels + YouTube Shorts.

Flow: ``cli queue`` (after QA) -> human OK -> ``cli approve`` -> the worker on
the prod server uploads the YouTube Short as private with ``publishAt`` and
publishes the Instagram Reel at the slot time (the Graph API cannot schedule).
Nothing publishes without an approval whose content hash still matches.
"""
