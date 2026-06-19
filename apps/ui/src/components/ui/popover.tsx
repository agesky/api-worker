import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export type PopoverProps = JSX.IntrinsicElements["div"] & {
	open: boolean;
};

export const Popover = ({ open, class: className, ...props }: PopoverProps) => {
	if (!open) {
		return null;
	}
	return <div {...props} class={cx("app-popover", className)} />;
};

export const PopoverContent = ({
	class: className,
	...props
}: JSX.IntrinsicElements["div"]) => (
	<div {...props} class={cx("app-popover-content", className)} />
);
