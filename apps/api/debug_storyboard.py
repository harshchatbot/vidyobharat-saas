#!/usr/bin/env python3
"""
Storyboard Pipeline Diagnostic Script

Helps identify issues in the storyboard pipeline by testing each component independently.
Run this from the apps/api directory: python debug_storyboard.py
"""

import json
import sys
from datetime import datetime

# Test imports
print("=" * 60)
print("STORYBOARD PIPELINE DIAGNOSTIC")
print(f"Timestamp: {datetime.now().isoformat()}")
print("=" * 60)

print("\n[1/6] Testing Gemini Client...")
try:
    from app.providers.gemini import get_gemini_client
    gemini = get_gemini_client()

    # Test script generation
    script_response = gemini.generate_text("Generate a short script for a skincare ad")
    assert script_response.get("text"), "Script response is empty"
    print("✅ Gemini script generation works")
    print(f"   Response length: {len(script_response['text'])} chars")

    # Test storyboard generation
    storyboard_response = gemini.generate_text("storyboard for skincare product")
    assert storyboard_response.get("text"), "Storyboard response is empty"
    print("✅ Gemini storyboard generation works")

    # Test quality score
    quality_response = gemini.generate_text("score the quality of this script")
    quality_text = quality_response.get("text", "")
    assert quality_text, "Quality response is empty"
    print("✅ Gemini quality scoring works")

    # Try to parse quality score as JSON
    try:
        quality_data = json.loads(quality_text)
        assert "overall" in quality_data, "Quality data missing 'overall' field"
        print(f"✅ Quality score JSON valid: overall={quality_data.get('overall')}")
    except json.JSONDecodeError as e:
        print(f"❌ Quality score JSON invalid: {e}")
        print(f"   Raw response: {quality_text[:200]}")

except Exception as e:
    print(f"❌ Gemini client failed: {e}")
    sys.exit(1)

print("\n[2/6] Testing Quality Score Service...")
try:
    from app.services.quality_score_service import QualityScoreService
    quality_service = QualityScoreService()

    test_script = "This is a test skincare ad script. Try it today!"
    score = quality_service.score_script(test_script, "ugc_testimonial")

    assert score.overall > 0, "Score is zero or negative"
    print(f"✅ Quality score service works")
    print(f"   Overall score: {score.overall}/10")
    print(f"   Suggestions: {score.improvement_suggestions}")
except Exception as e:
    print(f"❌ Quality score service failed: {e}")
    sys.exit(1)

print("\n[3/6] Testing Storyboard Generation Service...")
try:
    from app.services.storyboard_generation_service import StoryboardGenerationService
    storyboard_service = StoryboardGenerationService()

    test_script = """Tired of dry skin?
    Our new moisturizer hydrates deeply.
    See results in one week.
    Get it today!"""

    scenes = storyboard_service.generate_storyboard(
        clean_script=test_script,
        ad_category="ugc_testimonial",
        avatar_description="young woman",
        business_context="skincare brand",
        platform="instagram_reels",
        language="en",
        tone="casual"
    )

    assert len(scenes) > 0, f"No scenes generated"
    print(f"✅ Storyboard generation works")
    print(f"   Generated {len(scenes)} scenes")
    for i, scene in enumerate(scenes, 1):
        print(f"   Scene {i}: {scene.scene_type} - {scene.spoken_line[:50]}")
except Exception as e:
    print(f"❌ Storyboard generation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n[4/6] Testing Firestore Connection...")
try:
    from app.db.repositories.storyboard_repository import StoryboardRepository
    from app.services.storyboard_pipeline_service import StoryboardWorkflowState

    db = StoryboardRepository()

    # Create test project
    test_project = db.create_project(
        user_id="debug-user",
        ad_category="ugc_testimonial",
        workflow_state=StoryboardWorkflowState.INITIALIZED,
        business_brief="Test skincare product",
        platform="instagram_reels",
        language="en",
        tone="casual",
        credits_estimated=100,
        credits_consumed=0,
    )

    print(f"✅ Firestore connection works")
    print(f"   Created project: {test_project.id}")

    # Try to retrieve project
    retrieved = db.get_project(test_project.id)
    assert retrieved, "Failed to retrieve project"
    print(f"✅ Project retrieval works")
    print(f"   State: {retrieved.workflow_state}")

    # Clean up
    # Note: Firestore doesn't have direct delete in this wrapper

except Exception as e:
    print(f"❌ Firestore connection failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n[5/6] Testing Pipeline Service...")
try:
    from app.services.storyboard_pipeline_service import StoryboardPipelineService
    pipeline = StoryboardPipelineService()

    # Initialize project
    init_result = pipeline.initialize_project(
        user_id="debug-user",
        ad_category="ugc_testimonial",
        business_brief="Test skincare",
        platform="instagram_reels",
        language="en",
        tone="casual"
    )

    project_id = init_result["project_id"]
    print(f"✅ Project initialization works")
    print(f"   Project ID: {project_id}")
    print(f"   State: {init_result['workflow_state']}")

except Exception as e:
    print(f"❌ Pipeline service failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n[6/6] Testing Celery Tasks...")
try:
    from app.workers.storyboard_tasks import generate_script_task
    from app.providers.redis_provider import get_redis_client

    redis = get_redis_client()

    # Check if Celery is configured
    print(f"✅ Celery task imports work")
    print(f"   generate_script_task available: {callable(generate_script_task)}")

except ImportError as e:
    print(f"⚠️  Celery import warning (may not be installed): {e}")
except Exception as e:
    print(f"❌ Celery task check failed: {e}")

print("\n" + "=" * 60)
print("DIAGNOSTIC COMPLETE")
print("=" * 60)
print("\nNotes:")
print("- If all tests pass (✅), the backend is configured correctly")
print("- If any test fails (❌), check the error message above")
print("- Make sure:")
print("  1. Backend server is NOT running (we're testing in isolation)")
print("  2. Firestore emulator is running (if using local)")
print("  3. All required Python packages are installed")
print("=" * 60)
