from __future__ import annotations

import json
import logging
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import Request

from app.core.config import get_settings
from app.services.geo_service import resolve_country_code

logger = logging.getLogger(__name__)
PLAN_ORDER = ('starter', 'creator', 'growth', 'pro')


@dataclass
class PricingQuote:
    country: str
    region: str
    currency: str
    payment_provider: str
    plans: dict[str, int]
    credit_allocation: dict[str, int]
    action_costs: dict[str, int]


@dataclass
class CheckoutPlanSelection:
    plan_name: str
    country: str
    region: str
    currency: str
    payment_provider: str
    amount_minor: int
    allocated_credits: int





class PricingService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.credit_plans = self._load_json('credit_plans.json')
        self.credit_costs = self._load_json('credit_pricing.json')
        self.regional_pricing = self._load_json('regional_pricing.json')
        self._validate_pricing_ladder()

    def _load_json(self, filename: str) -> dict[str, Any]:
        path = Path(__file__).resolve().parents[1] / 'core' / filename
        return json.loads(path.read_text())

    def _validate_pricing_ladder(self) -> None:
        missing_plan_credits = [plan for plan in PLAN_ORDER if plan not in self.credit_plans]
        if missing_plan_credits:
            raise ValueError(f'Missing credit allocation for plans: {", ".join(missing_plan_credits)}')

        for plan in PLAN_ORDER:
            allocated = int(self.credit_plans[plan])
            if allocated <= 0:
                raise ValueError(f'Invalid credit allocation for plan "{plan}": {allocated}')

        for region, bucket in self.regional_pricing.items():
            plans = bucket.get('plans') or {}
            missing_region_plans = [plan for plan in PLAN_ORDER if plan not in plans]
            if missing_region_plans:
                raise ValueError(f'Missing pricing entries for region "{region}": {", ".join(missing_region_plans)}')

            previous_plan: str | None = None
            previous_cost_per_credit: float | None = None
            for plan in PLAN_ORDER:
                price = float(plans[plan])
                credits = float(self.credit_plans[plan])
                if price <= 0:
                    raise ValueError(f'Invalid price for region "{region}" plan "{plan}": {price}')
                cost_per_credit = price / credits
                if previous_cost_per_credit is not None and cost_per_credit > previous_cost_per_credit:
                    raise ValueError(
                        'Irrational pricing ladder detected for '
                        f'region "{region}": "{plan}" is worse value per credit than "{previous_plan}" '
                        f'({cost_per_credit:.4f} > {previous_cost_per_credit:.4f}).',
                    )
                previous_plan = plan
                previous_cost_per_credit = cost_per_credit

    def get_pricing_quote(self, request: Request) -> PricingQuote:
        country = self._extract_country(request)
        region = self._resolve_region(country)
        bucket = self.regional_pricing[region]
        currency = bucket['currency']
        payment_provider = 'razorpay' if region == 'south_asia' else 'stripe'

        return PricingQuote(
            country=country,
            region=region,
            currency=currency,
            payment_provider=payment_provider,
            plans={key: int(value) for key, value in bucket['plans'].items()},
            credit_allocation={key: int(value) for key, value in self.credit_plans.items()},
            action_costs={key: int(value) for key, value in self.credit_costs.items()},
        )

    def resolve_checkout_plan(self, request: Request, plan_name: str) -> CheckoutPlanSelection:
        quote = self.get_pricing_quote(request)
        normalized_plan = plan_name.strip().lower()

        if normalized_plan not in quote.plans or normalized_plan not in quote.credit_allocation:
            raise ValueError('Unsupported plan name')

        amount_major = quote.plans[normalized_plan]

        return CheckoutPlanSelection(
            plan_name=normalized_plan,
            country=quote.country,
            region=quote.region,
            currency=quote.currency,
            payment_provider=quote.payment_provider,
            amount_minor=self._to_minor_units(amount_major, quote.currency),
            allocated_credits=quote.credit_allocation[normalized_plan],
        )

    def make_stripe_placeholder_session_id(self) -> str:
        return f'stripe_placeholder_{secrets.token_hex(12)}'

    def _extract_country(self, request: Request) -> str:
        forwarded = request.headers.get('x-forwarded-for')
        client_host = request.client.host if request.client else None
        ip_candidate = (forwarded or client_host or '').split(',')[0].strip()

        try:
            country = resolve_country_code(ip_candidate)
            if not country or not isinstance(country, str):
                raise ValueError('Empty or invalid country code returned')
            return country.upper()
        except Exception as exc:
            logger.warning(
                'pricing_country_resolution_failed',
                extra={
                    'ip_candidate': ip_candidate,
                    'error': str(exc),
                    'fallback_country': 'IN',
                },
            )
            return 'IN'

    def _resolve_region(self, country: str) -> str:
        south_asia_countries = set(self.regional_pricing['south_asia']['countries'])
        return 'south_asia' if country in south_asia_countries else 'global'

    def _to_minor_units(self, amount_major: int | float, currency: str) -> int:
        # INR and USD both use 2 minor decimals in this MVP billing layer.
        return int(round(float(amount_major) * 100))
