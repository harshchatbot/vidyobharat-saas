from app.schemas.catalog import TemplateResponse


class TemplateService:
    def __init__(self) -> None:
        self._templates = [
            TemplateResponse(
                id='tpl-clean-corporate',
                name='Clean Corporate',
                category='business',
                aspect_ratio='16:9',
                thumbnail_url='https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80',
            ),
            TemplateResponse(
                id='tpl-social-launch',
                name='Social Launch',
                category='marketing',
                aspect_ratio='9:16',
                thumbnail_url='https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=1200&q=80',
            ),
            TemplateResponse(
                id='tpl-product-demo',
                name='Product Demo',
                category='product',
                aspect_ratio='16:9',
                thumbnail_url='https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1200&q=80',
            ),
            TemplateResponse(
                id='tpl-course-snippet',
                name='Course Snippet',
                category='education',
                aspect_ratio='9:16',
                thumbnail_url='https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
            ),
        ]

    def list_templates(
        self,
        search: str | None = None,
        category: str | None = None,
        aspect_ratio: str | None = None,
    ) -> list[TemplateResponse]:
        result = self._templates

        if category:
            normalized_category = category.strip().lower()
            result = [item for item in result if item.category.lower() == normalized_category]

        if aspect_ratio:
            normalized_ratio = aspect_ratio.strip().lower()
            result = [item for item in result if item.aspect_ratio.lower() == normalized_ratio]

        if search:
            keyword = search.strip().lower()
            result = [
                item
                for item in result
                if keyword in item.name.lower() or keyword in item.category.lower()
            ]

        return result
