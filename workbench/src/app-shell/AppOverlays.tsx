import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { useUiCommand } from "../app/use-ui-command.ts";
import type {
  AppDialogState,
  LoadingOverlayState,
} from "../runtime/workbench-store.ts";

export function LoadingOverlay({
  loading,
}: {
  readonly loading: LoadingOverlayState;
}) {
  const dispatch = useUiCommand();
  return (
    <div
      id="loadingScreen"
      className="oat-loading-overlay"
      data-testid="loading-overlay"
      data-hidden={!loading.visible}
      aria-hidden={!loading.visible}
      role="status"
      aria-live="polite"
    >
      <div className="oat-loading-card">
        <HStack hAlign="between" vAlign="center" gap={2}>
          <Text type="label" weight="semibold">
            {loading.title}
          </Text>
          {!loading.indeterminate ? (
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {`${String(Math.round(loading.percent))}%`}
            </Text>
          ) : null}
        </HStack>
        <ProgressBar
          label={loading.title}
          value={loading.percent}
          max={100}
          isIndeterminate={loading.indeterminate}
          isLabelHidden
          variant="accent"
        />
        <div className="oat-loading-message" title={loading.message}>
          <Text type="supporting" color="secondary">
            {loading.message}
          </Text>
        </div>
        {loading.cancellable ? (
          <HStack hAlign="end">
            <Button
              label={loading.cancelLabel || "Cancel"}
              size="sm"
              variant="secondary"
              onClick={() => {
                void dispatch({ name: "loading.cancel", payload: undefined });
              }}
            />
          </HStack>
        ) : null}
      </div>
    </div>
  );
}

export function AppAlertDialog({
  dialog,
}: {
  readonly dialog: AppDialogState;
}) {
  const dispatch = useUiCommand();

  if (dialog.type === "confirm" && !dialog.detail) {
    return (
      <AlertDialog
        isOpen={dialog.open}
        onOpenChange={(open) => {
          if (!open) {
            void dispatch({ name: "dialog.close", payload: undefined });
          }
        }}
        title={dialog.title}
        description={dialog.message}
        actionLabel={dialog.primaryLabel}
        cancelLabel={dialog.secondaryLabel}
        actionVariant={dialog.variant === "error" ? "destructive" : "primary"}
        onAction={() => {
          void dispatch({ name: "dialog.primary", payload: undefined });
        }}
      />
    );
  }

  const badgeVariant =
    dialog.variant === "error"
      ? "error"
      : dialog.variant === "warning"
        ? "warning"
        : "info";

  return (
    <Dialog
      isOpen={dialog.open}
      onOpenChange={(open) => {
        if (!open) {
          void dispatch({ name: "dialog.close", payload: undefined });
        }
      }}
      width={440}
      padding={4}
      purpose="info"
    >
      <VStack gap={3}>
        <HStack hAlign="between" vAlign="center" gap={2}>
          <Text type="large" weight="semibold">
            {dialog.title}
          </Text>
          <Badge label={dialog.variant.toUpperCase()} variant={badgeVariant} />
        </HStack>
        <Text type="body">{dialog.message}</Text>
        {dialog.detail ? (
          <pre
            style={{
              margin: 0,
              padding: "8px 10px",
              borderRadius: "6px",
              background: "#f1f5f9",
              fontSize: "11px",
              maxHeight: "180px",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {dialog.detail}
          </pre>
        ) : null}
        <HStack hAlign="end" gap={2}>
          {dialog.type === "confirm" ? (
            <Button
              label={dialog.secondaryLabel}
              size="sm"
              variant="secondary"
              onClick={() => {
                void dispatch({ name: "dialog.secondary", payload: undefined });
              }}
            />
          ) : null}
          <Button
            label={dialog.primaryLabel}
            size="sm"
            variant={dialog.variant === "error" ? "destructive" : "primary"}
            onClick={() => {
              void dispatch({ name: "dialog.primary", payload: undefined });
            }}
          />
        </HStack>
      </VStack>
    </Dialog>
  );
}
