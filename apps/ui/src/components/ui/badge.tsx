import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export type BadgeProps = JSX.IntrinsicElements["span"] & {
	variant?: "default" | "accent" | "muted";
};

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
	default: "app-badge",
	accent: "app-badge app-badge--accent",
	muted: "app-badge app-badge--muted",
};

export const Badge = ({
	variant = "default",
	class: className,
	...props
}: BadgeProps) => {
	return <span {...props} class={cx(variantStyles[variant], className)} />;
};
