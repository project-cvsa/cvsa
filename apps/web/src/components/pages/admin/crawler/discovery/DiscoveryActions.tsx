import { createSignal, For, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import Select from "@components/ui/Select";
import Tabs from "@components/ui/Tabs";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";

export default function DiscoveryActions(props: { onQueued: () => void }) {
	const t = getComponentT("crawler");
	const [method, setMethod] = createSignal<"search" | "related">("search");
	const [keyword, setKeyword] = createSignal("");
	const [seed, setSeed] = createSignal("");
	const [pages, setPages] = createSignal(2);
	const [keywords, setKeywords] = createSignal<string[]>([]);
	const [pending, setPending] = createSignal(false);
	const [queued, setQueued] = createSignal(false);
	onMount(async () => {
		const result = await api.crawler.getDiscoveryConfig();
		if (result.ok && result.data) setKeywords(result.data.searchKeywords ?? []);
	});
	const submit = async (hot = false) => {
		if (pending()) return;
		if (
			!hot &&
			method() === "related" &&
			!/^(?:av)?\d+$|^BV[0-9a-z]{10}$/i.test(seed().trim())
		) {
			toast.error(t("discoveryUi.identifierRequired"));
			return;
		}
		setPending(true);
		setQueued(false);
		const result = hot
			? await api.crawler.triggerHotSample()
			: method() === "search"
				? await api.crawler.triggerSweep({
						keywords: keyword().trim() ? [keyword().trim()] : undefined,
						pagesPerQuery: pages(),
					})
				: await api.crawler.triggerActive(seed().trim().replace(/^av/i, ""));
		setPending(false);
		if (result.ok) {
			setQueued(true);
			props.onQueued();
		} else toast.error(result.error.message || t("common.error"));
	};
	return (
		<section aria-label={t("audit.startDiscovery")} class="py-1">
			<div class="flex flex-col gap-3">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<Tabs
						size="sm"
						items={[
							{ id: "search", label: t("discoveryUi.keywordDiscovery") },
							{ id: "related", label: t("discoveryUi.relatedDiscovery") },
						]}
						value={method()}
						onChange={(value) => {
							setMethod(value);
							setQueued(false);
						}}
					/>
					<Button
						size="sm"
						variant="outlined"
						loading={pending()}
						onClick={() => void submit(true)}
					>
						{t("discoveryUi.sampleHot")}
					</Button>
				</div>
				<form
					class="flex flex-wrap items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<Show
						when={method() === "search"}
						fallback={
							<TextField
								size="sm"
								class="w-full sm:w-80"
								aria-label={t("discoveryUi.seed")}
								placeholder={t("discoveryUi.seed")}
								value={seed()}
								onInput={(event) => setSeed(event.currentTarget.value)}
							/>
						}
					>
						<TextField
							size="sm"
							class="w-full sm:w-80"
							aria-label={t("discoveryUi.keywordDiscovery")}
							placeholder={t("audit.keywordPlaceholder")}
							value={keyword()}
							onInput={(event) => setKeyword(event.currentTarget.value)}
						/>
						<div class="w-32">
							<Select
								size="sm"
								aria-label={t("audit.depth")}
								options={[1, 2, 3, 5].map((value) => ({
									value: String(value),
									label: t("audit.pages").replace("{count}", String(value)),
								}))}
								value={String(pages())}
								onValueChange={(value) => setPages(Number(value) || 2)}
							/>
						</div>
					</Show>
					<Button size="sm" type="submit" loading={pending()}>
						{t("audit.start")}
					</Button>
					<Show when={queued()}>
						<span role="status" class="ts-caption text-primary">
							{t("audit.submitted")}
						</span>
					</Show>
				</form>
				<Show when={method() === "search" && keywords().length > 0}>
					<div class="flex flex-wrap items-center gap-1.5">
						<For each={keywords()}>
							{(word) => (
								<button
									type="button"
									class="px-2 py-1 ts-caption border border-border text-secondary hover:bg-hover"
									aria-pressed={keyword() === word}
									onClick={() => setKeyword(word)}
								>
									{word}
								</button>
							)}
						</For>
					</div>
				</Show>
			</div>
		</section>
	);
}
