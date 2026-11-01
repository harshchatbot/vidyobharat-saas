"""Separation is deliberately unavailable until its model and weights are audited."""
class SeparationUnavailableError(RuntimeError): pass
def separate_recording(*_args, **_kwargs):
    raise SeparationUnavailableError("Single-recording separation is experimental and unavailable in this local MVP. Upload separate vocal and instrumental tracks instead.")
