const DEFAULT_ALERT_TITLE = "OpenAirTwin";
const DEFAULT_CONFIRM_TITLE = "Confirm Action";

function toText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function normalizeVariant(value) {
  return ["error", "warning", "info"].includes(value) ? value : "info";
}

function normalizeOptions(type, options) {
  const payload = typeof options === "string" ? {message: options} : (options || {});
  return {
    type,
    title: toText(payload.title || (type === "confirm" ? DEFAULT_CONFIRM_TITLE : DEFAULT_ALERT_TITLE)),
    message: toText(payload.message),
    detail: toText(payload.detail),
    okLabel: toText(payload.okLabel || "OK"),
    confirmLabel: toText(payload.confirmLabel || "Confirm"),
    cancelLabel: toText(payload.cancelLabel || "Cancel"),
    variant: normalizeVariant(payload.variant),
  };
}

export function createAppDialogController(context) {
  const {ui} = context;
  const queue = [];
  let activeRequest = null;
  let lastFocusedElement = null;

  function focusableElements() {
    return [
      ui.appDialogClose,
      ui.appDialogSecondary?.classList.contains("hidden") ? null : ui.appDialogSecondary,
      ui.appDialogPrimary,
    ].filter((element) => element && !element.disabled);
  }

  function focusPrimaryButton() {
    ui.appDialogPrimary?.focus({preventScroll: true});
  }

  function restoreFocus() {
    if (lastFocusedElement && document.contains(lastFocusedElement)) {
      lastFocusedElement.focus({preventScroll: true});
    }
    lastFocusedElement = null;
  }

  function hideDialog() {
    ui.appDialog.classList.add("hidden");
    ui.appDialog.classList.remove("error", "warning", "info");
    ui.appDialog.setAttribute("aria-hidden", "true");
    ui.appDialogTitle.textContent = "";
    ui.appDialogMessage.textContent = "";
    ui.appDialogDetail.textContent = "";
    ui.appDialogDetail.classList.add("hidden");
    ui.appDialogSecondary.classList.add("hidden");
  }

  function finishDialog(result) {
    if (!activeRequest) {
      return;
    }
    const request = activeRequest;
    activeRequest = null;
    hideDialog();
    restoreFocus();
    request.resolve(result);
    window.setTimeout(showNextDialog, 0);
  }

  function cancelActiveDialog() {
    finishDialog(activeRequest?.type === "confirm" ? false : undefined);
  }

  function confirmActiveDialog() {
    finishDialog(activeRequest?.type === "confirm" ? true : undefined);
  }

  function handleGlobalKeydown(event) {
    if (!activeRequest) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelActiveDialog();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = focusableElements();
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const currentIndex = focusable.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
      : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
    event.preventDefault();
    focusable[nextIndex].focus({preventScroll: true});
  }

  function handleFocusIn(event) {
    if (!activeRequest || ui.appDialogCard.contains(event.target)) {
      return;
    }
    focusPrimaryButton();
  }

  function renderDialog(request) {
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ui.appDialogTitle.textContent = request.title;
    ui.appDialogMessage.textContent = request.message;
    ui.appDialogDetail.textContent = request.detail;
    ui.appDialogDetail.classList.toggle("hidden", !request.detail);
    ui.appDialogPrimary.textContent = request.type === "confirm" ? request.confirmLabel : request.okLabel;
    ui.appDialogSecondary.textContent = request.cancelLabel;
    ui.appDialogSecondary.classList.toggle("hidden", request.type !== "confirm");
    ui.appDialog.classList.remove("hidden", "error", "warning", "info");
    ui.appDialog.classList.add(request.variant);
    ui.appDialog.setAttribute("aria-hidden", "false");
    window.setTimeout(focusPrimaryButton, 0);
  }

  function showNextDialog() {
    if (activeRequest || queue.length === 0) {
      return;
    }
    activeRequest = queue.shift();
    renderDialog(activeRequest);
  }

  function enqueueDialog(request) {
    return new Promise((resolve) => {
      queue.push({...request, resolve});
      showNextDialog();
    });
  }

  document.addEventListener("keydown", handleGlobalKeydown, true);
  document.addEventListener("focusin", handleFocusIn, true);
  hideDialog();

  return {
    cancelActiveDialog,
    confirmActiveDialog,
    finishDialog,
    alert(options) {
      return enqueueDialog(normalizeOptions("alert", options)).then(() => {});
    },
    confirm(options) {
      return enqueueDialog(normalizeOptions("confirm", options)).then(Boolean);
    },
    dispose() {
      document.removeEventListener("keydown", handleGlobalKeydown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      if (activeRequest) {
        const request = activeRequest;
        activeRequest = null;
        request.resolve(request.type === "confirm" ? false : undefined);
      }
      for (const request of queue.splice(0)) {
        request.resolve(request.type === "confirm" ? false : undefined);
      }
      hideDialog();
    },
  };
}
