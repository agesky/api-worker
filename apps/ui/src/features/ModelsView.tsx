import { useEffect, useMemo, useState } from "hono/jsx/dom";
import {
	Card,
	Chip,
	ColumnPicker,
	MultiSelect,
	Pagination,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui";
import type { ModelItem } from "../core/types";
import {
	buildPageItems,
	loadColumnPrefs,
	loadPageSizePref,
	persistColumnPrefs,
	persistPageSizePref,
} from "../core/utils";

type ModelsViewProps = {
	models: ModelItem[];
};

/**
 * Renders the models view.
 *
 * Args:
 *   props: Models view props.
 *
 * Returns:
 *   Models JSX element.
 */
export const ModelsView = ({ models }: ModelsViewProps) => {
	const channelCount = new Set(
		models.flatMap((model) => model.channels.map((channel) => channel.id)),
	).size;
	const modelColumns = [
		{ id: "model", label: "模型", locked: true },
		{ id: "channels", label: "渠道" },
	];
	const [visibleColumns, setVisibleColumns] = useState(() =>
		loadColumnPrefs(
			"columns:models",
			modelColumns.map((column) => column.id),
		),
	);
	const visibleColumnSet = useMemo(
		() => new Set(visibleColumns),
		[visibleColumns],
	);
	const updateColumns = (next: string[]) => {
		setVisibleColumns(next);
		persistColumnPrefs("columns:models", next);
	};
	const [modelFilters, setModelFilters] = useState<string[]>([]);
	const [channelFilters, setChannelFilters] = useState<string[]>([]);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(() =>
		loadPageSizePref("pageSize:models", 15),
	);
	const pageSizeOptions = [15, 30, 50];
	const modelOptions = useMemo(
		() =>
			models.map((model) => ({
				value: model.id,
				label: model.id,
			})),
		[models],
	);
	const channelOptions = useMemo(() => {
		const map = new Map<string, string>();
		for (const model of models) {
			for (const channel of model.channels) {
				const label = channel.name || channel.id;
				if (!map.has(channel.id)) {
					map.set(channel.id, label);
				}
			}
		}
		return Array.from(map.entries())
			.map(([value, label]) => ({ value, label }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [models]);
	const filteredModels = useMemo(() => {
		const modelSet = modelFilters.length > 0 ? new Set(modelFilters) : null;
		const channelSet =
			channelFilters.length > 0 ? new Set(channelFilters) : null;
		return models.filter((model) => {
			const matchesModel = modelSet ? modelSet.has(model.id) : true;
			const matchesChannel = channelSet
				? model.channels.some((channel) => channelSet.has(channel.id))
				: true;
			return matchesModel && matchesChannel;
		});
	}, [channelFilters, modelFilters, models]);
	const totalPages = useMemo(
		() => Math.max(1, Math.ceil(filteredModels.length / pageSize)),
		[filteredModels.length, pageSize],
	);
	const pageItems = useMemo(
		() => buildPageItems(page, totalPages),
		[page, totalPages],
	);
	const pagedModels = useMemo(() => {
		const start = (page - 1) * pageSize;
		return filteredModels.slice(start, start + pageSize);
	}, [filteredModels, page, pageSize]);
	useEffect(() => {
		setPage(1);
	}, [channelFilters, modelFilters, pageSize]);
	return (
		<div class="animate-fade-up space-y-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h3 class="app-title text-lg">模型广场</h3>
					<p class="app-subtitle">当前聚合的模型与所属渠道清单。</p>
				</div>
				<div class="flex flex-wrap items-center gap-2 text-xs text-[color:var(--app-ink-muted)]">
					<Chip>{models.length} 个模型</Chip>
					<Chip>{channelCount} 个渠道</Chip>
					<ColumnPicker
						columns={modelColumns}
						value={visibleColumns}
						onChange={updateColumns}
					/>
				</div>
			</div>
			<Card variant="compact" class="app-layer-raised space-y-3 p-4">
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<p class="mb-1.5 block text-xs uppercase tracking-widest text-[color:var(--app-ink-muted)]">
							模型
						</p>
						<MultiSelect
							class="w-full"
							options={modelOptions}
							value={modelFilters}
							placeholder="选择模型"
							searchPlaceholder="搜索模型"
							emptyLabel="暂无匹配模型"
							onChange={setModelFilters}
						/>
					</div>
					<div>
						<p class="mb-1.5 block text-xs uppercase tracking-widest text-[color:var(--app-ink-muted)]">
							渠道
						</p>
						<MultiSelect
							class="w-full"
							options={channelOptions}
							value={channelFilters}
							placeholder="选择渠道"
							searchPlaceholder="搜索渠道"
							emptyLabel="暂无匹配渠道"
							onChange={setChannelFilters}
						/>
					</div>
				</div>
			</Card>
			{models.length === 0 ? (
				<Card class="text-center text-sm text-[color:var(--app-ink-muted)]">
					暂无模型，请先在站点管理配置可用渠道。
				</Card>
			) : (
				<div class="app-surface overflow-x-auto">
					<Table class="min-w-105 w-full text-xs sm:text-sm">
						<TableHeader>
							<TableRow>
								{visibleColumnSet.has("model") && <TableHead>模型</TableHead>}
								{visibleColumnSet.has("channels") && (
									<TableHead>渠道</TableHead>
								)}
							</TableRow>
						</TableHeader>
						<TableBody>
							{pagedModels.length === 0 ? (
								<TableRow>
									<TableCell
										class="px-3 py-6 text-center text-sm text-[color:var(--app-ink-muted)]"
										colSpan={visibleColumns.length}
									>
										暂无匹配模型
									</TableCell>
								</TableRow>
							) : (
								pagedModels.map((model) => (
									<TableRow key={model.id}>
										{visibleColumnSet.has("model") && (
											<TableCell>{model.id}</TableCell>
										)}
										{visibleColumnSet.has("channels") && (
											<TableCell>
												{model.channels
													.map((channel) => channel.name)
													.join(" / ")}
											</TableCell>
										)}
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			)}
			{models.length > 0 && (
				<div class="app-pagination-bar flex flex-col gap-3 text-xs text-[color:var(--app-ink-muted)] sm:flex-row sm:items-center sm:justify-between">
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-xs text-[color:var(--app-ink-muted)]">
							共 {filteredModels.length} 条 · {totalPages} 页
						</span>
						<Pagination
							page={page}
							totalPages={totalPages}
							items={pageItems}
							onPageChange={setPage}
						/>
					</div>
					<div class="app-page-size-control">
						<span class="app-page-size-control__label">每页</span>
						<div class="app-page-size-control__chips">
							{pageSizeOptions.map((size) => (
								<button
									class={`app-page-size-chip ${
										pageSize === size ? "app-page-size-chip--active" : ""
									}`}
									key={size}
									type="button"
									onClick={() => {
										persistPageSizePref("pageSize:models", size);
										setPageSize(size);
									}}
								>
									{size}
								</button>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
