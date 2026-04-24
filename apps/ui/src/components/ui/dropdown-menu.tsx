import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export type DropdownMenuProps = JSX.IntrinsicElements["div"] & {
	open: boolean;
};

export const DropdownMenu = ({
	open,
	class: className,
	...props
}: DropdownMenuProps) => {
	if (!open) {
		return null;
	}
	return <div {...props} class={cx("app-dropdown", className)} />;
};

export const DropdownMenuContent = ({
	class: className,
	...props
}: JSX.IntrinsicElements["div"]) => (
	<div {...props} class={cx("app-dropdown-content", className)} />
);

export const DropdownMenuItem = ({
	class: className,
	...props
}: JSX.IntrinsicElements["button"]) => (
	<button {...props} class={cx("app-dropdown-item", className)} type="button" />
);

export const DropdownMenuSeparator = ({
	class: className,
	...props
}: JSX.IntrinsicElements["div"]) => (
	<div {...props} class={cx("app-dropdown-separator", className)} />
);
