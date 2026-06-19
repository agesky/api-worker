import type { JSX } from "hono/jsx";
import { cx } from "./utils";

export const Table = ({
	class: className,
	...props
}: JSX.IntrinsicElements["table"]) => (
	<table {...props} class={cx("app-table", className)} />
);

export const TableHeader = ({
	class: className,
	...props
}: JSX.IntrinsicElements["thead"]) => (
	<thead {...props} class={cx(className)} />
);

export const TableBody = ({
	class: className,
	...props
}: JSX.IntrinsicElements["tbody"]) => (
	<tbody {...props} class={cx(className)} />
);

export const TableRow = ({
	class: className,
	...props
}: JSX.IntrinsicElements["tr"]) => <tr {...props} class={cx(className)} />;

export const TableHead = ({
	class: className,
	...props
}: JSX.IntrinsicElements["th"]) => <th {...props} class={cx(className)} />;

export const TableCell = ({
	class: className,
	...props
}: JSX.IntrinsicElements["td"]) => <td {...props} class={cx(className)} />;
