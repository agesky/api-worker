import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export type CardProps = JSX.IntrinsicElements["div"] & {
	variant?: "default" | "compact";
};

export const Card = ({
	variant = "default",
	class: className,
	...props
}: CardProps) => {
	const baseClass =
		variant === "compact" ? "app-card app-card--compact" : "app-card";
	return <div {...props} class={cx(baseClass, className)} />;
};

export const CardHeader = ({
	class: className,
	...props
}: JSX.IntrinsicElements["div"]) => (
	<div
		{...props}
		class={cx("mb-4 flex items-start justify-between gap-3", className)}
	/>
);

export const CardTitle = ({
	class: className,
	...props
}: JSX.IntrinsicElements["h3"]) => (
	<h3 {...props} class={cx("app-title text-lg", className)} />
);

export const CardDescription = ({
	class: className,
	...props
}: JSX.IntrinsicElements["p"]) => (
	<p
		{...props}
		class={cx("text-sm text-[color:var(--app-ink-muted)]", className)}
	/>
);

export const CardContent = ({
	class: className,
	...props
}: JSX.IntrinsicElements["div"]) => (
	<div {...props} class={cx("space-y-4", className)} />
);

export const CardFooter = ({
	class: className,
	...props
}: JSX.IntrinsicElements["div"]) => (
	<div
		{...props}
		class={cx("mt-4 flex items-center justify-end gap-2", className)}
	/>
);
