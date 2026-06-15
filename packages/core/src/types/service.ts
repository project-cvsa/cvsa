export interface IServiceWithGetDetails<T> {
	getDetails(id: number | string): Promise<T | null>;
}
