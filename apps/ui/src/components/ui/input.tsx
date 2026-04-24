import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export type InputProps = JSX.IntrinsicElements["input"] & {
	variant?: "default" | "pill";
};

export const Input = ({
	variant = "default",
	class: className,
	...props
}: InputProps) => {
	const variantClass =
		variant === "pill" ? "app-input app-input--pill" : "app-input";
	return <input {...props} class={cx(variantClass, "app-focus", className)} />;
};
