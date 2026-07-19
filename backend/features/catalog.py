from __future__ import annotations

from backend.features.core import RouteRegistry
from backend.features.deepmimo import DEEPMIMO_FEATURE
from backend.features.link import LINK_FEATURE
from backend.features.mobility import MOBILITY_FEATURE
from backend.features.radiomap import RADIOMAP_FEATURE


BACKEND_FEATURE_CATALOG = (
    LINK_FEATURE,
    MOBILITY_FEATURE,
    RADIOMAP_FEATURE,
    DEEPMIMO_FEATURE,
)


def build_feature_routes(definitions=BACKEND_FEATURE_CATALOG) -> RouteRegistry:
    routes = RouteRegistry()
    for definition in definitions:
        definition.register_routes(routes)
    return routes


FEATURE_ROUTES = build_feature_routes()
