import { createSignal, For } from "solid-js";
import Button from "@components/ui/Button";

type KeywordListEditorProps = {
	title: string;
	items: string[];
	placeholder: string;
	onAdd: (value: string) => boolean;
	onRemove: (value: string) => void;
};

export default function KeywordListEditor(props: KeywordListEditorProps) {
	const [value, setValue] = createSignal("");

	const add = () => {
		const next = value().trim();
		if (!next || !props.onAdd(next)) return;
		setValue("");
	};

	return (
		<div class="p-4 rounded border border-border flex flex-col gap-3">
			<span class="ts-label font-semibold text-primary">
				{props.title} ({props.items.length})
			</span>
			<div class="flex flex-wrap gap-2">
				<For each={props.items}>
					{(item) => (
						<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-hover border border-border ts-caption text-primary">
							{item}
							<button
								type="button"
								class="text-tertiary hover:text-error ml-1"
								aria-label={"Remove " + item}
								onClick={() => props.onRemove(item)}
							>
								×
							</button>
						</span>
					)}
				</For>
			</div>
			<div class="flex items-center gap-2">
				<input
					type="text"
					class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm w-64"
					placeholder={props.placeholder}
					value={value()}
					onInput={(event) => setValue(event.currentTarget.value)}
					onKeyDown={(event) => event.key === "Enter" && add()}
				/>
				<Button size="sm" variant="outlined" onClick={add}>
					Add
				</Button>
			</div>
		</div>
	);
}
