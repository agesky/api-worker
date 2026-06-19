import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export type SwitchProps = Omit<JSX.IntrinsicElements["button"], "role"> & {
	checked?: boolean;
	onToggle?: (next: boolean) => void;
};

export const Switch = ({
	checked = false,
	onToggle,
	class: className,
	onClick,
	...props
}: SwitchProps) => {
	return (
		<button
			{...props}
			type={props.type ?? "button"}
			role="switch"
			aria-checked={checked}
			class={cx(
				"app-switch app-focus",
				checked && "app-switch--checked",
				className,
			)}
			onClick={(event) => {
				onClick?.(event);
				onToggle?.(!checked);
			}}
		>
			<span class="app-switch__thumb" />
		</button>
	);
};
