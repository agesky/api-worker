import { useEffect, useMemo, useState } from "hono/jsx/dom";
import { PopoverContent } from "./popover";
import { type ClassName, cx } from "./utils";

export type SingleSelectOption = {
	value: string;
	label: string;
	description?: string;
};

export type SingleSelectProps = {
	options: SingleSelectOption[];
	value: string;
	onChange: (next: string) => void;
	placeholder?: string;
	class?: ClassName;
	buttonClass?: ClassName;
	disabled?: boolean;
};

export const SingleSelect = ({
	options,
	value,
	onChange,
	placeholder = "请选择",
	class: className,
	buttonClass,
	disabled = false,
}: SingleSelectProps) => {
	const [open, setOpen] = useState(false);
	const instanceId = useMemo(
		() => `single-${Math.random().toString(36).slice(2)}`,
		[],
	);
	const popoverEvent = "app:single-select-open";
	const selectedOption =
		options.find((option) => option.value === value) ?? null;

	useEffect(() => {
		const handleGlobalOpen = (event: Event) => {
			const detail = (event as CustomEvent<string>).detail;
			if (detail !== instanceId) {
				setOpen(false);
			}
		};
		window.addEventListener(popoverEvent, handleGlobalOpen);
		return () => {
			window.removeEventListener(popoverEvent, handleGlobalOpen);
		};
	}, [instanceId, popoverEvent]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as HTMLElement | null;
			if (!target) {
				return;
			}
			if (target.closest(".app-single-select-root")) {
				return;
			}
			setOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				setOpen(false);
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [open]);

	return (
		<div
			class={cx(
				"app-single-select-root",
				open && "app-single-select-root--open",
				disabled && "app-single-select-root--disabled",
				className,
			)}
		>
			<button
				aria-expanded={open}
				class={cx(
					"app-single-select app-focus",
					open && "app-single-select--open",
					buttonClass,
				)}
				type="button"
				disabled={disabled}
				onClick={(event) => {
					event.stopPropagation();
					if (disabled) {
						return;
					}
					if (!open) {
						window.dispatchEvent(
							new CustomEvent<string>(popoverEvent, {
								detail: instanceId,
							}),
						);
					}
					setOpen((prev) => !prev);
				}}
			>
				<span
					class={cx(
						"app-single-select__value",
						!selectedOption && "app-single-select__placeholder",
					)}
				>
					{selectedOption?.label ?? placeholder}
				</span>
				<span aria-hidden="true" class="app-single-select__chevron">
					▾
				</span>
			</button>
			{open ? (
				<PopoverContent
					class="app-popover-content--full p-2"
					onPointerDown={(event) => event.stopPropagation()}
				>
					<div class="max-h-56 space-y-1 overflow-auto">
						{options.map((option) => {
							const selected = option.value === value;
							return (
								<button
									class={cx(
										"app-multi-option app-single-option",
										selected && "app-multi-option--selected",
									)}
									key={option.value}
									type="button"
									onClick={() => {
										onChange(option.value);
										setOpen(false);
									}}
								>
									<span class="min-w-0 flex-1">
										<span class="block truncate">{option.label}</span>
										{option.description ? (
											<span class="mt-1 block text-[11px] text-[color:var(--app-ink-muted)]">
												{option.description}
											</span>
										) : null}
									</span>
									{selected ? (
										<span class="app-multi-option__check">✓</span>
									) : null}
								</button>
							);
						})}
					</div>
				</PopoverContent>
			) : null}
		</div>
	);
};
