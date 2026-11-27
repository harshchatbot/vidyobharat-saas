"""Compact procedural plans for renderer and QA benchmarks."""

FPS = 30


def action(object_id, name, start, end, before=(0, 0, 0), after=None,
           scale=(1, 1), opacity=(1, 1)):
    return {"object_id": object_id, "action": name, "start_frame": start, "end_frame": end,
            "from_position": list(before), "to_position": list(after or before),
            "from_scale": scale[0], "to_scale": scale[1],
            "from_opacity": opacity[0], "to_opacity": opacity[1]}


def scene(title, spoken, start, end, camera, transition, lighting, actions):
    return {"title": title, "spoken_text": spoken, "start_frame": start, "end_frame": end,
            "camera": camera, "transition": transition, "lighting": lighting, "actions": actions}


def fixtures():
    return {
        "technical_workflow": {
            "fps": FPS, "total_frames": 180, "background": "#0b1728",
            "objects": [
                {"id": "pipeline", "kind": "pipeline", "label": "Verified workflow", "color": "#4f9bd8"},
                {"id": "signal", "kind": "connector", "label": "Data flow", "color": "#f3a15f"},
            ],
            "sequences": [
                scene("Inputs become a workflow", "Connect each verified stage", 0, 90, "dolly_in", "continuous", "technical key fill rim", [
                    action("pipeline", "assemble", 0, 90), action("signal", "data_flow", 0, 90, opacity=(0, 1)),
                ]),
                scene("Data moves with purpose", "Follow the signal through the system", 90, 180, "track", "continuous", "technical key fill rim", [
                    action("pipeline", "path", 90, 180, after=(.7, 0, 0)), action("signal", "data_flow", 90, 180),
                ]),
            ],
        },
        "exploded_product": {
            "fps": FPS, "total_frames": 210, "background": "#17131d",
            "objects": [{"id": "product", "kind": "product", "label": "Modular product", "color": "#e58b62"}],
            "sequences": [scene("Reveal every working layer", "Separate the parts then resolve the whole", 0, 210, "orbit", "spatial", "product key fill rim", [
                action("product", "explode", 0, 105), action("product", "reassemble", 105, 210),
            ])],
        },
        "particle_transition": {
            "fps": FPS, "total_frames": 180, "background": "#0c1820",
            "objects": [{"id": "particles", "kind": "particle_field", "label": "Signal particles", "color": "#58c6b0"}],
            "sequences": [scene("A signal can change form", "Dissolve the old structure", 0, 90, "pull_back", "dissolve", "dramatic rim", [
                action("particles", "dissolve", 0, 90),
            ]), scene("Reassemble the useful idea", "Bring the signal back with clarity", 90, 180, "dolly_in", "dissolve", "warm key fill", [
                action("particles", "reassemble", 90, 180),
            ])],
        },
        "editorial_visual": {
            "fps": FPS, "total_frames": 180, "background": "#121722",
            "objects": [
                {"id": "visual", "kind": "document", "label": "ORIGINAL APPROVED VISUAL", "color": "#d9e4ee"},
                {"id": "metric", "kind": "chart", "label": "Measured result", "color": "#ff9b61"},
            ],
            "sequences": [scene("Evidence leads the composition", "Use the approved visual as the focal point", 0, 180, "crane", "directional", "warm key fill", [
                action("visual", "stagger", 0, 90, opacity=(.15, 1)), action("visual", "transform", 90, 180, opacity=(1, 1)),
                action("metric", "reveal", 0, 90, opacity=(0, 1)), action("metric", "rotate", 90, 180),
            ])],
        },
        "camera_continuity": {
            "fps": FPS, "total_frames": 180, "background": "#101928",
            "objects": [{"id": "subject", "kind": "model", "label": "Persistent subject", "color": "#799ee8"}],
            "sequences": [
                scene("Track one persistent subject", "The camera follows a meaningful change", 0, 90, "pan_right", "match_cut", "studio key fill", [
                    action("subject", "transform", 0, 90, after=(.5, 0, 0)),
                ]),
                scene("Continue without a camera jump", "The same subject completes its path", 90, 180, "track", "continuous", "studio key fill", [
                    action("subject", "path", 90, 180, before=(.5, 0, 0), after=(-.4, .25, 0)),
                ]),
            ],
        },
    }
