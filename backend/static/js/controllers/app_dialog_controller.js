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
  const shellStore = context.featureServices.shellUi;
  const queue = [];
  let activeRequest = null;

  function publishClosed() {
    shellStore.patch((current) => ({
      ...current,
      dialog: {
        ...current.dialog,
        open: false,
        detail: "",
      },
    }));
  }

  function publishRequest(request) {
    shellStore.patch((current) => ({
      ...current,
      dialog: {
        open: true,
        type: request.type,
        variant: request.variant,
        title: request.title,
        message: request.message,
        detail: request.detail,
        primaryLabel: request.type === "confirm" ? request.confirmLabel : request.okLabel,
        secondaryLabel: request.cancelLabel,
      },
    }));
  }

  function finishDialog(result) {
    if (!activeRequest) {
      return;
    }
    const request = activeRequest;
    activeRequest = null;
    publishClosed();
    request.resolve(result);
    window.setTimeout(showNextDialog, 0);
  }

  function cancelActiveDialog() {
    finishDialog(activeRequest?.type === "confirm" ? false : undefined);
  }

  function confirmActiveDialog() {
    finishDialog(activeRequest?.type === "confirm" ? true : undefined);
  }

  function showNextDialog() {
    if (activeRequest || !queue.length) {
      return;
    }
    activeRequest = queue.shift();
    publishRequest(activeRequest);
  }

  function enqueueDialog(type, options) {
    const normalized = normalizeOptions(type, options);
    return new Promise((resolve) => {
      queue.push({...normalized, resolve});
      showNextDialog();
    });
  }

  return {
    alert(options) {
      return enqueueDialog("alert", options);
    },
    confirm(options) {
      return enqueueDialog("confirm", options);
    },
    confirmActiveDialog,
    cancelActiveDialog,
    finishDialog,
    isOpen() {
      return Boolean(activeRequest);
    },
    dispose() {
      queue.length = 0;
      activeRequest = null;
      publishClosed();
    },
  };
}
