import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export const Tabs = ({
	class: className,
	...props
}: JSX.IntrinsicElements["div"]) => (
	<div {...props} class={cx("flex flex-col gap-3", className)} />
);

export const TabsList = ({
	class: className,
	...props
}: JSX.IntrinsicElements["div"]) => (
	<div {...props} class={cx("flex flex-wrap items-center gap-2", className)} />
);

export type TabsTriggerProps = JSX.IntrinsicElements["button"] & {
	active?: boolean;
};

export const TabsTrigger = ({
	active,
	class: className,
	...props
}: TabsTriggerProps) => (
	<button
		{...props}
		class={cx(
			"app-button app-focus h-8 px-3 text-xs",
			active ? "app-button-primary" : "",
			className,
		)}
	/>
);

export const TabsContent = ({
	class: className,
	...props
}: JSX.IntrinsicElements["div"]) => <div {...props} class={cx(className)} />;
