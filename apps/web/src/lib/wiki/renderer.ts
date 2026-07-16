import type { ArtistResponseDto, SongDetailsResponseDto } from "@cvsa/core";
import Parser from "wikiparser-node";
import { OpenCC } from "opencc";

const openccConfigMap = {
	"zh-CN": "tw2s.json",
	"zh-HK": "s2hk.json",
	"zh-TW": "s2tw.json",
} as const;
const openccConfigMapKeys = Object.keys(openccConfigMap);
type OpenccConfigMapKeys = keyof typeof openccConfigMap;

interface RenderContextSong {
	entity: "song";
	data: SongDetailsResponseDto;
}

interface RenderContextArtist {
	entity: "artist";
	data: ArtistResponseDto;
}

export type RenderContext = (RenderContextSong | RenderContextArtist) & {
	language: string;
};

export function renderWiki(_source: string, context: RenderContext): string {
	const converter = new OpenCC(openccConfigMap[context.language as OpenccConfigMapKeys]);
	let source: string = _source;
	if (openccConfigMapKeys.includes(context.language)) {
		source = converter.convertSync(_source);
	}
	const parsed = Parser.parse(source);
	return handleNode(parsed, context);
}

function textNodeToHtml(text: string) {
	if (!text || typeof text !== "string") {
		return "";
	}

	// 1. Split the text into block paragraphs by double (or more) newlines
	const blocks = text.split(/\n{2,}/);

	const htmlBlocks = blocks
		.map((block) => {
			const trimmedBlock = block.trim();
			if (!trimmedBlock) return "";

			// 2. Wikitext rule: Replace single newlines within a block with a space
			const collapsedContent = trimmedBlock.replace(/\n/g, " ");

			// 3. Wrap in paragraph tags
			return `<p>${collapsedContent}</p>`;
		})
		.filter((block) => block !== "");

	return htmlBlocks.join("\n");
}

function handleNode(node: Parser.AstNodes, context: RenderContext): string {
	if (node.type === "text") {
		return textNodeToHtml(node.data);
	} else if (node.type === "heading") {
		return node.toHtml();
	} else if (node.type === "template") {
		return handleTemplate(node, context);
	}
	const children = node.childNodes;
	if (children.length === 0) {
		return "";
	}
	return children.reduce((acc, child) => acc + handleNode(child, context), "");
}

function handleTemplate(node: Parser.AstNodes, context: RenderContext) {
	if (node.name === "Template:Introduction" && context.entity === "song") {
		return "";
		// return `<p>《${context.data.name}》</p>`;
	}
	return "";
}
