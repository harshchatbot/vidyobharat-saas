"""RangManch Production Kit V1: immutable style and executable-plan validation.

Asset registry is deliberately empty until files, rights and checksums are verified.
"""
from __future__ import annotations
from copy import deepcopy

KIT = {
 "schema_version":"rangmanch-production-kit/v1",
 "identity":{"mascot":"cinematic_anime_shades_v1","status":"design_locked_asset_pending",
             "poses":["neutral","explain_left","explain_right","point","react"]},
 "palette":{"background":"#07060D","orange":"#FF6B35","blue":"#3B6CFF",
            "text":"#F5F2EE","success":"#3DDC84"},
 "fonts":{"display":"Poppins Bold","emphasis":"DM Serif Display Italic","technical":"JetBrains Mono"},
 "camera_presets":["dolly_in","three_quarter_orbit","tracking_follow","pull_back"],
 "hyperframes":["floating_data_card","event_pipeline"],
 "typography_presets":["kinetic_emphasis","word_reveal","hero_statement"],
 "audio":{"voice_profile":"rangmanch_voice_v1","voice_asset_status":"pending",
          "sfx_ids":["digital_ping","event_whoosh","soft_impact"],
          "sfx_asset_status":"pending","music_status":"pending"},
 "render":{"primary":"chromium_2_5d","optional":"blender","encoder":"ffmpeg"},
 "assets":{},
 "publish_authorized":False,
}

def production_kit():
    return deepcopy(KIT)

def validate_shot_plan(plan: dict, kit: dict | None = None) -> dict:
    """Fail closed: a creative proposal is not a render-ready production plan."""
    kit = kit or KIT
    problems = []
    shots = plan.get("shots")
    if not isinstance(shots,list) or not shots:
        return {"render_ready":False,"problems":["Missing shots"]}
    cursor = 0
    for index,shot in enumerate(shots):
        prefix = f"shots[{index}]"
        start,end = shot.get("start_frame"),shot.get("end_frame")
        if type(start) is not int or type(end) is not int or start != cursor or end <= start:
            problems.append(f"{prefix}: invalid or noncontiguous frame range")
        else:
            cursor=end
        for key,allowed in (("camera_preset",kit["camera_presets"]),
                            ("hyperframe",kit["hyperframes"]),
                            ("typography_preset",kit["typography_presets"]),
                            ("mascot_pose",kit["identity"]["poses"])):
            if shot.get(key) not in allowed:
                problems.append(f"{prefix}: unsupported {key}")
        for asset_id in shot.get("asset_ids",[]):
            asset=kit["assets"].get(asset_id)
            if not asset or not asset.get("verified") or not asset.get("license") or not asset.get("sha256"):
                problems.append(f"{prefix}: unverified asset {asset_id}")
    if plan.get("duration_frames") != cursor:
        problems.append("duration_frames mismatch")
    if kit["identity"]["status"] != "approved":
        problems.append("Mascot master asset not approved")
    if kit["audio"]["voice_asset_status"] != "approved":
        problems.append("Narration voice not approved")
    if kit["audio"]["sfx_asset_status"] != "approved":
        problems.append("SFX assets not approved")
    if not plan.get("narration_timing_verified"):
        problems.append("Narration timing not verified")
    return {"render_ready":not problems,"problems":problems,"publish_authorized":False}
