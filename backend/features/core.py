from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Callable, Iterable, Mapping
from urllib.parse import unquote


RouteHandler = Callable[[object, Mapping[str, str]], None]


class FeatureQueueFull(RuntimeError):
    def __init__(self, message: str, max_pending_jobs: int) -> None:
        super().__init__(message)
        self.max_pending_jobs = int(max_pending_jobs)


@dataclass(frozen=True)
class BackendFeatureDefinition:
    id: str
    create_service: Callable[[Mapping[str, object]], object]
    register_routes: Callable[["RouteRegistry"], None]
    resources: tuple[str, ...] = ()


@dataclass(frozen=True)
class _Route:
    method: str
    template: str
    pattern: re.Pattern[str]
    handler: RouteHandler
    name: str


def _compile_path(template: str) -> re.Pattern[str]:
    if not template.startswith("/"):
        raise ValueError(f"Route path must start with '/': {template}")
    cursor = 0
    parts: list[str] = ["^"]
    for match in re.finditer(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", template):
        parts.append(re.escape(template[cursor:match.start()]))
        parts.append(f"(?P<{match.group(1)}>[^/]+)")
        cursor = match.end()
    parts.append(re.escape(template[cursor:]))
    parts.append("$")
    return re.compile("".join(parts))


class RouteRegistry:
    def __init__(self) -> None:
        self._routes: list[_Route] = []
        self._keys: set[tuple[str, str]] = set()

    def add(self, method: str, path: str, handler: RouteHandler, *, name: str = "") -> None:
        normalized_method = method.upper()
        key = (normalized_method, path)
        if key in self._keys:
            raise ValueError(f"Duplicate route: {normalized_method} {path}")
        self._keys.add(key)
        self._routes.append(_Route(normalized_method, path, _compile_path(path), handler, name or path))

    def dispatch(self, method: str, path: str, request_handler: object) -> bool:
        normalized_method = method.upper()
        for route in self._routes:
            if route.method != normalized_method:
                continue
            match = route.pattern.fullmatch(path)
            if match is None:
                continue
            params = {key: unquote(value) for key, value in match.groupdict().items()}
            route.handler(request_handler, params)
            return True
        return False

    def routes(self) -> tuple[tuple[str, str, str], ...]:
        return tuple((route.method, route.template, route.name) for route in self._routes)


class FeatureServiceRegistry:
    def __init__(self, resources: Mapping[str, object]) -> None:
        self.resources = dict(resources)
        self._services: dict[str, object] = {}

    def register(self, definition: BackendFeatureDefinition) -> object:
        if definition.id in self._services:
            raise ValueError(f"Feature service already registered: {definition.id}")
        missing = [name for name in definition.resources if name not in self.resources]
        if missing:
            raise ValueError(f"Feature {definition.id} is missing resources: {', '.join(missing)}")
        service = definition.create_service(self.resources)
        self._services[definition.id] = service
        return service

    def register_all(self, definitions: Iterable[BackendFeatureDefinition]) -> None:
        for definition in definitions:
            self.register(definition)

    def get(self, feature_id: str) -> object:
        try:
            return self._services[feature_id]
        except KeyError as exc:
            raise KeyError(f"Unknown feature service: {feature_id}") from exc


def resolve_feature_service(request_handler, feature_id: str, legacy_manager_attribute: str | None = None):
    app_state = request_handler.app_state
    registry = getattr(app_state, "feature_services", None)
    if registry is not None:
        return registry.get(feature_id)
    if legacy_manager_attribute is None:
        raise AttributeError(f"App state has no service registry for {feature_id}")
    return getattr(app_state, legacy_manager_attribute)


def capture_ready_scene_generation(rt_runtime) -> int | None:
    from backend.rt.runtime import current_scene_generation

    rt_lock = getattr(rt_runtime, "lock", None)
    if rt_lock is None:
        rt_runtime.require_ready()
        return current_scene_generation(rt_runtime)
    with rt_lock:
        rt_runtime.require_ready()
        return current_scene_generation(rt_runtime)
