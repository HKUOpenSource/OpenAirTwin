# OpenAirTwin Icon Contract

> Status: Active production contract

Icons are governed by `oat-icon` and the `--oat-icon-*` tokens in `tokens.css`. Features may select a registered size but may not redefine the fill, stroke, line cap, or line join of shared SVG icons.

## Size and Stroke

| Use | Size token | Stroke token |
| --- | --- | --- |
| Compact chevron | `--oat-icon-size-xs` / `--oat-icon-size-sm` | `--oat-icon-stroke-chevron` |
| Default action icon | `--oat-icon-size-md` / `--oat-icon-size-base` | `--oat-icon-stroke-default` |
| Toolbar and navigation icon | `--oat-icon-size-lg` / `--oat-icon-size-xl` | `--oat-icon-stroke-medium` / `--oat-icon-stroke-strong` |
| Large shortcut action | `--oat-icon-size-2xl` | `--oat-icon-stroke-light` |

All icons use `currentColor`, `fill:none`, and round line caps and joins. An icon inside a button must occupy a stable centered container and must not change the button dimensions.

## Accessibility

- Icon-only buttons must provide `aria-label`; the SVG itself uses `aria-hidden="true"`.
- When an icon appears with visible text, the SVG uses `aria-hidden="true"` and the text provides the accessible name.
- Data-bearing chart SVGs are not decorative icons; they retain `role="img"` and a specific `aria-label`.
- Selected, error, or busy state must never be communicated only through icon color.
