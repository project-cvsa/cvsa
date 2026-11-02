import { metrics, type Meter, type MeterProvider } from "@opentelemetry/api";

export function createMetricInstruments<T>(scope: string, create: (meter: Meter) => T): () => T {
	let current: { provider: MeterProvider; instruments: T } | undefined;
	return () => {
		const provider = metrics.getMeterProvider();
		if (!current || current.provider !== provider) {
			current = { provider, instruments: create(provider.getMeter(scope)) };
		}
		return current.instruments;
	};
}
