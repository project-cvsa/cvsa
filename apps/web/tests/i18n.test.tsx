import { describe, expect, test } from "vitest";
import { FaneeRuntime } from "@fanee/core";
import { renderToString } from "solid-js/web";
import { wrapComponentWithI18n } from "@lib/i18n/component-context";
import { getComponentT } from "@lib/i18n/isomorphic";
import { i18nServer } from "@lib/i18n/server";
import {
	createClientI18nPayload,
	parseClientI18nPayload,
	serializeClientI18nPayload,
} from "@lib/i18n/payload";
import { crawlerNamespaces, crawlerVideoNamespaces } from "@lib/i18n/namespaces";

describe("client translation resources", () => {
	test.each(["zh-TW", "zh-HK", "en-US"])(
		"hydrates %s with translated messages and the requested modules",
		async (locale) => {
			const payload = createClientI18nPayload(
				locale,
				crawlerVideoNamespaces,
				i18nServer.getAllTranslations()
			);
			const runtime = new FaneeRuntime().config({
				...payload,
				currentLocale: payload.locale,
				defaultLocale: "zh-CN",
				baseNamespace: "web:client",
			});
			await runtime.ready();
			const serverT = i18nServer.getT({ locale, namespace: "client:crawler:video" });
			const clientT = runtime.getT({ namespace: "crawler:video" });
			expect(clientT("videoDetail.snapshots")).toBe(serverT("videoDetail.snapshots"));
			expect(clientT("videoDetail.snapshotsCount", { count: 2 })).not.toContain("{$count}");
			expect(payload.resources["web:client:crawler:network"]).toBeUndefined();
			expect(runtime.getLocale()).toBe(locale);
		}
	);

	test("loads all crawler modules declared by the dashboard", () => {
		const payload = createClientI18nPayload(
			"en-US",
			crawlerNamespaces,
			i18nServer.getAllTranslations()
		);
		expect(Object.keys(payload.resources)).toEqual(
			crawlerNamespaces.map((namespace) => `web:client:${namespace}`)
		);
	});

	test("uses source messages for missing individual translations", async () => {
		const payload = createClientI18nPayload("en-US", ["example"], {
			"web:client:example": {
				"zh-CN": { title: "标题", label: "标签" },
				"en-US": { title: "Title" },
			},
		});
		const runtime = new FaneeRuntime().config({
			resources: payload.resources,
			currentLocale: payload.locale,
			defaultLocale: "zh-CN",
			baseNamespace: "web:client:example",
		});
		await runtime.ready();
		expect(runtime.t("title")).toBe("Title");
		expect(runtime.t("label")).toBe("标签");
	});

	test("round-trips inline JSON without allowing a translated value to close the script", () => {
		const payload = {
			locale: "en-US",
			resources: {
				example: { "en-US": { value: "</script><script>alert(1)</script>&\u2028\u2029" } },
			},
		};
		const serialized = serializeClientI18nPayload(payload);
		expect(serialized).not.toContain("<");
		expect(serialized).not.toContain("&");
		expect(parseClientI18nPayload(JSON.parse(serialized))).toEqual(payload);
		expect(
			parseClientI18nPayload({
				locale: "en-US",
				resources: { example: { "en-US": { value: 1 } } },
			})
		).toBeUndefined();
	});
});

test("renders independent request languages through the standard Solid provider", async () => {
	const render = async (locale: string) => {
		const runtime = new FaneeRuntime().config({
			currentLocale: locale,
			defaultLocale: "zh-CN",
			baseNamespace: "web:client",
			resources: i18nServer.getAllTranslations(),
		});
		await runtime.ready();
		const Component = wrapComponentWithI18n(() => {
			const t = getComponentT("crawler:video");
			return <p>{t("videoDetail.snapshots")}</p>;
		}, runtime);
		return renderToString(() => <Component />);
	};
	const [english, chinese] = await Promise.all([render("en-US"), render("zh-CN")]);
	const expectedEnglish = i18nServer.getT({ locale: "en-US", namespace: "client:crawler:video" })(
		"videoDetail.snapshots"
	);
	const expectedChinese = i18nServer.getT({ locale: "zh-CN", namespace: "client:crawler:video" })(
		"videoDetail.snapshots"
	);
	expect(english).toContain(expectedEnglish);
	expect(chinese).toContain(expectedChinese);
	expect(english).not.toContain(expectedChinese);
});
