import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export const Skeleton = ({
	class: className,
	...props
}: JSX.IntrinsicElements["div"]) => (
	<div {...props} class={cx("app-skeleton", className)} />
);
