class BrollProvider:
    def fetch_clip(self, topic: str) -> str:
        return f'mock://broll/{topic.lower().replace(" ", "-")}'
