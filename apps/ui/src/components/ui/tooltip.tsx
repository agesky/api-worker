import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export type TooltipProps = JSX.IntrinsicElements["span"] & {
	content: string;
};

export const Tooltip = ({
	content,
	class: className,
	...props
}: TooltipProps) => (
	<span
		{...props}
		class={cx("app-tooltip", className)}
		data-tooltip={content}
	/>
);
