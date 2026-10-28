import { Show } from "solid-js";
import Badge from "@components/ui/Badge";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
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
		<Card>
			<CardHeader
				title={
					<div class="flex items-center gap-2">
						<span class="font-semibold text-primary">{props.title}</span>
						<Badge variant="neutral" size="sm">
							{props.items.length}
						</Badge>
					</div>
				}
			/>
			<CardContent class="flex flex-col gap-3">
				<Show when={props.description}>
					<p class="text-xs text-secondary leading-relaxed">{props.description}</p>
				</Show>
				<TagInput
					tags={props.items}
					onChange={handleTagsChange}
					placeholder={props.placeholder}
				/>
			</CardContent>
		</Card>
	);
}
