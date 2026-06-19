import type { JSX } from "hono/jsx";
import { cx } from "./utils";

type ButtonVariant = "default" | "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = JSX.IntrinsicElements["button"] & {
	variant?: ButtonVariant;
	size?: ButtonSize;
};

const variantStyles: Record<ButtonVariant, string> = {
	default: "",
	primary: "app-button-primary",
	ghost: "app-button-ghost",
	danger: "app-button-danger",
};

const sizeStyles: Record<ButtonSize, string> = {
	sm: "h-9 px-3 text-xs",
	md: "h-10 px-4 text-sm",
	lg: "h-11 px-5 text-sm",
};

export const Button = ({
	variant = "default",
	size = "md",
	class: className,
	...props
}: ButtonProps) => {
	return (
		<button
			{...props}
			class={cx(
				"app-button app-focus",
				variantStyles[variant],
				sizeStyles[size],
				className,
			)}
		/>
	);
};
