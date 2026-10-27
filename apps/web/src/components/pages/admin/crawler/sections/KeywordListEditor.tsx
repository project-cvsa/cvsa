import { createSignal, For } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import TextField from "@components/ui/TextField";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import Plus from "lucide-solid/icons/plus";
import X from "lucide-solid/icons/x";

type KeywordListEditorProps = {
	title: string;
	description?: string;
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
		<Card>
			<CardHeader
				title={
					<div class="flex items-center gap-2">
						<span>{props.title}</span>
						<Badge variant="neutral" size="sm">
							{props.items.length}
						</Badge>
					</div>
				}
				description={props.description}
			/>
			<CardContent class="flex flex-col gap-4">
				{/* Chips Container */}
				<div class="flex flex-wrap gap-2 min-h-[32px]">
					<For each={props.items}>
						{(item) => (
							<span class="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-surface-container-high border border-border text-xs text-primary group hover:border-primary/40 transition-colors">
								<span class="font-medium">{item}</span>
								<button
									type="button"
									class="p-0.5 rounded-full text-tertiary hover:text-error hover:bg-error/10 transition-colors focus:outline-none"
									aria-label={"Remove " + item}
									onClick={() => props.onRemove(item)}
								>
									<X class="w-3 h-3" />
								</button>
							</span>
						)}
					</For>
				</div>

				{/* Add Input Row */}
				<div class="flex items-end gap-2 pt-2 border-t border-border">
					<div class="flex-1 max-w-md">
						<TextField
							label={props.placeholder}
							value={value()}
							onInput={(e) => setValue(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									add();
								}
							}}
						/>
					</div>
					<Button
						size="md"
						variant="outlined"
						disabled={!value().trim()}
						onClick={add}
						class="gap-1.5 shrink-0"
					>
						<Plus class="w-4 h-4" />
						<span>Add</span>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
