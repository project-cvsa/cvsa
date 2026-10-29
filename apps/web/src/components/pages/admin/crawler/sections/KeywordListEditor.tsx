import { Show } from "solid-js";
import Badge from "@components/ui/Badge";
import { getComponentT } from "@lib/i18n/isomorphic";
import TagInput from "@components/ui/TagInput";

type KeywordListEditorProps = {
	title: string;
	description?: string;
	items: string[];
	placeholder: string;
	onAdd: (value: string) => boolean;
	onRemove: (value: string) => void;
	onBatchChange?: (items: string[]) => void;
};

export default function KeywordListEditor(props: KeywordListEditorProps) {
	const t = getComponentT("crawler");
	const handleTagsChange = (newTags: string[]) => {
		if (props.onBatchChange) {
			props.onBatchChange(newTags);
			return;
		}

		// Reconcile additions and removals
		const currentSet = new Set(props.items);
		const newSet = new Set(newTags);

		// Handle deletions
		for (const item of props.items) {
			if (!newSet.has(item)) {
				props.onRemove(item);
			}
		}

		// Handle additions
		for (const tag of newTags) {
			if (!currentSet.has(tag)) {
				props.onAdd(tag);
			}
		}
	};

	return (
		<section class="flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<h3 class="text-sm font-semibold text-primary">{props.title}</h3>
				<Badge size="sm" variant="neutral">
					{props.items.length}
				</Badge>
			</div>
			<Show when={props.description}>
				<p class="text-xs text-secondary">{props.description}</p>
			</Show>
			<TagInput
				tags={props.items}
				onChange={handleTagsChange}
				placeholder={props.placeholder}
				clearLabel={t("common.clear")}
				removeLabel={t("common.delete")}
			/>
		</section>
	);
}
