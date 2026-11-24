"""Resource package; never publishes or sends messages."""
import json
import re

def build(out, sources, segments, keyword):
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Preformatted
    from reportlab.lib.styles import getSampleStyleSheet
    from xml.sax.saxutils import escape
    if not re.fullmatch(r"[A-Z]{2,16}",keyword):
        raise ValueError("Keyword must be 2-16 uppercase letters")
    ids={i for s in segments for i in s["source_ids"]}
    selected=[s for s in sources if s["id"] in ids]
    if not selected:
        raise ValueError("Resource guide requires cited repositories")
    styles=getSampleStyleSheet()
    story=[Paragraph("AI tools: practical resource guide",styles["Title"]),Paragraph("RangManch AI | Review draft",styles["Normal"]),Spacer(1,12)]
    for s in selected:
        story.append(Paragraph(escape(s["name"]),styles["Heading2"]))
        story.append(Paragraph(escape(s["url"]),styles["Normal"]))
        story.append(Paragraph(escape(s.get("description") or "See official documentation."),styles["Normal"]))
        story.append(Paragraph("License: "+escape(s.get("license") or "Check repository"),styles["Normal"]))
        story.append(Paragraph("Official setup documentation: "+escape(s.get("readme_url") or s["url"]),styles["Normal"]))
        story.append(Paragraph("Review prerequisites, API costs and installation instructions in the official documentation before running commands.",styles["Normal"]))
        blocks=re.findall(r"```(?:bash|sh|shell|zsh)\s*\n(.*?)```",s.get("readme_excerpt",""),re.S)
        for block in blocks[:3]:
            story.append(Paragraph("README command excerpt (not independently tested):",styles["Heading3"]))
            story.append(Preformatted(escape(block.strip()),styles["Code"],maxLineLength=85))
        story.append(Spacer(1,12))
    SimpleDocTemplate(str(out/"resource_guide.pdf")).build(story)
    cta=f"Comment {keyword} and I'll send you the GitHub links and PDF guide."
    (out/"engagement_config.json").write_text(json.dumps({"keyword":keyword,"cta":cta,"delivery":"manual","resource":"resource_guide.pdf","repository_urls":[s["url"] for s in selected],"human_review_required":True,"publish_authorized":False},indent=2))
    (out/"social_caption.txt").write_text("Explore these AI tools: "+", ".join(s["name"] for s in selected)+"\n\n"+cta+"\n")
    return cta
