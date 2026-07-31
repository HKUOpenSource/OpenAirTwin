const TOOLTIP_MARGIN_PX = 12;
const TOOLTIP_GAP_PX = 10;

export function createParamTooltipController(context) {
  const {ui} = context;
  let activeTip = null;
  let attached = false;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function tooltipTextFor(tip) {
    return tip.querySelector(".tipBubble")?.textContent?.trim() || "";
  }

  function tipFromTarget(target) {
    return target instanceof Element ? target.closest(".infoTip") : null;
  }

  function positionTooltip(tip) {
    const layer = ui.paramTooltipLayer;
    const iconRect = tip.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const centeredLeft = iconRect.left + iconRect.width / 2 - layerRect.width / 2;
    const left = clamp(
      centeredLeft,
      TOOLTIP_MARGIN_PX,
      Math.max(TOOLTIP_MARGIN_PX, viewportWidth - layerRect.width - TOOLTIP_MARGIN_PX),
    );
    const topPlacement = iconRect.top - layerRect.height - TOOLTIP_GAP_PX;
    const bottomPlacement = iconRect.bottom + TOOLTIP_GAP_PX;
    const useBottom = topPlacement < TOOLTIP_MARGIN_PX
      && bottomPlacement + layerRect.height <= viewportHeight - TOOLTIP_MARGIN_PX;
    const top = useBottom
      ? bottomPlacement
      : clamp(topPlacement, TOOLTIP_MARGIN_PX, Math.max(TOOLTIP_MARGIN_PX, viewportHeight - layerRect.height - TOOLTIP_MARGIN_PX));
    const arrowLeft = clamp(
      iconRect.left + iconRect.width / 2 - left,
      12,
      Math.max(12, layerRect.width - 12),
    );

    layer.style.left = `${left}px`;
    layer.style.top = `${top}px`;
    layer.style.setProperty("--param-tooltip-arrow-left", `${arrowLeft}px`);
    layer.dataset.placement = useBottom ? "bottom" : "top";
  }

  function hideTooltip() {
    activeTip?.removeAttribute("aria-describedby");
    activeTip = null;
    ui.paramTooltipLayer.classList.add("hidden");
    ui.paramTooltipLayer.classList.remove("visible");
    ui.paramTooltipLayer.setAttribute("aria-hidden", "true");
  }

  function showTooltip(tip) {
    const text = tooltipTextFor(tip);
    if (!text) {
      hideTooltip();
      return;
    }

    activeTip = tip;
    tip.setAttribute("aria-describedby", "paramTooltipLayer");
    ui.paramTooltipText.textContent = text;
    ui.paramTooltipLayer.classList.remove("hidden");
    ui.paramTooltipLayer.setAttribute("aria-hidden", "false");
    positionTooltip(tip);
    ui.paramTooltipLayer.classList.add("visible");
  }

  function repositionTooltip() {
    if (!activeTip) {
      return;
    }
    if (!document.contains(activeTip)) {
      hideTooltip();
      return;
    }
    positionTooltip(activeTip);
  }

  function handleMouseMove(event) {
    const tip = tipFromTarget(document.elementFromPoint(event.clientX, event.clientY));
    if (tip) {
      if (tip === activeTip) repositionTooltip();
      else showTooltip(tip);
    } else if (activeTip && document.activeElement !== activeTip) {
      hideTooltip();
    }
  }

  function handleMouseOver(event) {
    const tip = tipFromTarget(event.target);
    if (tip) showTooltip(tip);
  }

  function handleMouseOut(event) {
    const tip = tipFromTarget(event.target);
    if (tip && (!event.relatedTarget || !tip.contains(event.relatedTarget))) {
      hideTooltip();
    }
  }

  function handleFocusIn(event) {
    const tip = tipFromTarget(event.target);
    if (tip) showTooltip(tip);
  }

  function handleFocusOut(event) {
    const tip = tipFromTarget(event.target);
    if (tip) hideTooltip();
  }

  function handleKeydown(event) {
    if (event.key === "Escape") hideTooltip();
  }

  function attach() {
    if (attached) return;
    attached = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
  }

  function dispose() {
    if (!attached) return;
    attached = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseover", handleMouseOver);
    document.removeEventListener("mouseout", handleMouseOut);
    document.removeEventListener("focusin", handleFocusIn);
    document.removeEventListener("focusout", handleFocusOut);
    document.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("resize", hideTooltip);
    window.removeEventListener("scroll", hideTooltip, true);
    hideTooltip();
  }

  return {
    attach,
    dispose,
    hideTooltip,
    repositionTooltip,
  };
}
