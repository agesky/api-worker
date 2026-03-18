import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export type SelectProps = JSX.IntrinsicElements["select"] & {
	variant?: "default" | "pill";
};

export const Select = ({
	variant = "default",
	class: className,
	...props
}: SelectProps) => {
	const variantClass =
		variant === "pill" ? "app-input app-input--pill" : "app-input";
	return (
		<select
			{...props}
			class={cx(variantClass, "app-select app-focus", className)}
		/>
	);
};
